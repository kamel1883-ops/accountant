export function round2(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export type Move = {
  id: string;
  date: string;
  amount: number;
  reference?: string | null;
  description?: string | null;
};

export type MatchPair = { bookId: string; externalId: string; method: 'REF' | 'AMOUNT' };

function normRef(value?: string | null) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function daysApart(a: string, b: string) {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 9999;
  return Math.abs(da - db) / 86400000;
}

/** مطابقة تلقائية: المرجع أولاً، ثم مبلغ واحد فريد داخل نافذة التاريخ. */
export function autoMatch(book: Move[], external: Move[], windowDays = 3): MatchPair[] {
  const usedBook = new Set<string>();
  const usedExternal = new Set<string>();
  const pairs: MatchPair[] = [];
  const window = Number(windowDays) >= 0 ? Number(windowDays) : 3;

  for (const b of book) {
    const ref = normRef(b.reference);
    if (!ref) continue;
    const hit = external.find((e) => !usedExternal.has(e.id)
      && normRef(e.reference) === ref
      && Math.abs(Number(e.amount) - Number(b.amount)) < 0.02
      && daysApart(b.date, e.date) <= window);
    if (!hit) continue;
    usedBook.add(b.id);
    usedExternal.add(hit.id);
    pairs.push({ bookId: b.id, externalId: hit.id, method: 'REF' });
  }

  for (const b of book) {
    if (usedBook.has(b.id) || Math.abs(Number(b.amount)) < 0.01) continue;
    const candidates = external.filter((e) => !usedExternal.has(e.id)
      && Math.abs(Number(e.amount) - Number(b.amount)) < 0.02
      && daysApart(b.date, e.date) <= window);
    if (candidates.length !== 1) continue;
    usedBook.add(b.id);
    usedExternal.add(candidates[0].id);
    pairs.push({ bookId: b.id, externalId: candidates[0].id, method: 'AMOUNT' });
  }
  return pairs;
}

export function sumsMatch(bookAmounts: number[], externalAmounts: number[]) {
  const book = round2(bookAmounts.reduce((s, n) => s + Number(n), 0));
  const external = round2(externalAmounts.reduce((s, n) => s + Number(n), 0));
  return Math.abs(book - external) < 0.02;
}

export type OpenLine = { id: string; amount: number; matched: boolean };

/** الرصيد المعدّل للدفاتر يساوي الرصيد المعدّل للكشف عندما تُفسَّر الفروقات. */
export function bankPosition(input: {
  bookBalance: number;
  externalClosing: number;
  book: OpenLine[];
  external: OpenLine[];
}) {
  const openBook = input.book.filter((l) => !l.matched);
  const openExternal = input.external.filter((l) => !l.matched);
  const depositsInTransit = round2(openBook.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0));
  const outstanding = round2(openBook.filter((l) => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0));
  const unrecordedIn = round2(openExternal.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0));
  const unrecordedOut = round2(openExternal.filter((l) => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0));
  const adjustedExternal = round2(Number(input.externalClosing) + depositsInTransit - outstanding);
  const adjustedBook = round2(Number(input.bookBalance) + unrecordedIn - unrecordedOut);
  const difference = round2(adjustedBook - adjustedExternal);
  return {
    depositsInTransit,
    outstanding,
    unrecordedIn,
    unrecordedOut,
    adjustedBook,
    adjustedExternal,
    difference,
    rawDifference: round2(Number(input.bookBalance) - Number(input.externalClosing)),
    matched: Math.abs(difference) < 0.02,
  };
}

export function bankSuggestions(external: { id: string; amount: number; description?: string | null; matched: boolean }[], bankAccount: string) {
  return external.filter((l) => !l.matched && Math.abs(Number(l.amount)) >= 0.01).map((l) => {
    const amount = round2(Math.abs(Number(l.amount)));
    if (Number(l.amount) < 0) {
      return {
        statementLineId: l.id,
        debitAccount: '5301',
        creditAccount: bankAccount,
        amount,
        reason: l.description || 'رسوم أو حركة بنكية غير مسجلة',
      };
    }
    return {
      statementLineId: l.id,
      debitAccount: bankAccount,
      creditAccount: '4301',
      amount,
      reason: l.description || 'إيداع بنكي غير مسجل',
    };
  });
}

export function cashPosition(bookBalance: number, counted: number) {
  const difference = round2(Number(counted) - Number(bookBalance));
  return {
    bookBalance: round2(Number(bookBalance)),
    counted: round2(Number(counted)),
    difference,
    shortage: difference < 0 ? round2(-difference) : 0,
    overage: difference > 0 ? difference : 0,
    matched: Math.abs(difference) < 0.02,
  };
}

export function cashSuggestion(bookBalance: number, counted: number, cashAccount: string) {
  const pos = cashPosition(bookBalance, counted);
  if (pos.shortage > 0) {
    return { debitAccount: '5302', creditAccount: cashAccount, amount: pos.shortage, reason: 'عجز صندوق' };
  }
  if (pos.overage > 0) {
    return { debitAccount: cashAccount, creditAccount: '4301', amount: pos.overage, reason: 'زيادة صندوق' };
  }
  return null;
}

export function ageBucket(date: string, today = new Date().toISOString()) {
  const days = daysApart(date, today);
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

function cell(value: string) {
  return value.trim().replace(/^"|"$/g, '').replace(/,/g, '');
}

/** amount الموجب إيداع في الحساب، والسالب سحب أو رسوم. عمود المدين في الكشف ينقص الرصيد. */
export function parseStatementCsv(text: string) {
  const rows = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!rows.length) return [];
  const split = (line: string) => line.split(/[;,\t]/).map(cell);
  const head = split(rows[0]).map((h) => h.toLowerCase());
  const hasHeader = head.some((h) => /date|تاريخ|amount|مبلغ|debit|credit|مدين|دائن|desc|بيان|ref|مرجع/.test(h));
  const idx = (names: string[]) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const dateI = hasHeader ? idx(['date', 'تاريخ']) : 0;
  const descI = hasHeader ? idx(['desc', 'بيان', 'description', 'تفاصيل']) : 1;
  const refI = hasHeader ? idx(['ref', 'مرجع', 'reference']) : -1;
  const amountI = hasHeader ? idx(['amount', 'مبلغ']) : -1;
  const debitI = hasHeader ? idx(['debit', 'مدين']) : -1;
  const creditI = hasHeader ? idx(['credit', 'دائن']) : -1;
  const body = hasHeader ? rows.slice(1) : rows;
  return body.map((line) => {
    const cols = split(line);
    const debit = debitI >= 0 ? Number(cols[debitI] || 0) : 0;
    const credit = creditI >= 0 ? Number(cols[creditI] || 0) : 0;
    const amount = amountI >= 0 ? Number(cols[amountI] || 0) : round2(credit - debit);
    return {
      date: cols[dateI] || '',
      description: (descI >= 0 ? cols[descI] : '') || 'حركة كشف',
      reference: refI >= 0 ? cols[refI] || '' : '',
      amount: round2(amount),
    };
  }).filter((l) => l.date && Number.isFinite(l.amount) && Math.abs(l.amount) >= 0.01);
}
