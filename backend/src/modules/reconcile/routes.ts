import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { assertPeriodOpen, nextEntryNumber, validateEntryLines } from '../../utils/accounting';
import { assertCenter } from '../../utils/costCenter';
import { merchandiseAt } from '../../utils/inventoryValue';
import { canApply, inventoryTieOut, partyControl, vatTieOut, ControlRow } from '../../utils/partyControl';
import { SYS } from '../../utils/seedAccounts';
import {
  ageBucket, autoMatch, bankPosition, bankSuggestions, cashPosition, cashSuggestion, parseStatementCsv, round2, sumsMatch,
} from '../../utils/reconcileMath';

const router = Router();
router.use(requireAuth);

function day(value: string, end = false) {
  const date = new Date(end ? `${value}T23:59:59` : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function money(value: unknown) {
  return round2(Number(value) || 0);
}

async function bookBalance(tenantId: string, accountCode: string, to: Date) {
  const lines = await prisma.journalLine.findMany({
    where: { accountCode, entry: { tenantId, date: { lte: to } } },
    select: { debit: true, credit: true },
  });
  return round2(lines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0));
}

function matched(status: string) {
  return status === 'AUTO' || status === 'MANUAL';
}

function present(session: any) {
  const book = session.bookLines.map((l: any) => ({
    id: l.id, journalLineId: l.journalLineId, date: l.transactionDate, amount: money(l.amount),
    reference: l.reference, description: l.description, matchStatus: l.matchStatus, matchMethod: l.matchMethod,
    matchGroupId: l.matchGroupId, exceptionReason: l.exceptionReason,
    matched: matched(l.matchStatus),
    age: l.matchStatus === 'UNMATCHED' ? ageBucket(new Date(l.transactionDate).toISOString()) : null,
  }));
  const statement = session.statementLines.map((l: any) => ({
    id: l.id, date: l.transactionDate, amount: money(l.amount), reference: l.reference, description: l.description,
    matchStatus: l.matchStatus, matchMethod: l.matchMethod, matchGroupId: l.matchGroupId,
    exceptionReason: l.exceptionReason, matched: matched(l.matchStatus),
    age: l.matchStatus === 'UNMATCHED' ? ageBucket(new Date(l.transactionDate).toISOString()) : null,
  }));
  const position = session.kind === 'CASH'
    ? cashPosition(money(session.bookBalance), money(session.countedCash))
    : bankPosition({
      bookBalance: money(session.bookBalance),
      externalClosing: money(session.externalClosing),
      book: book.map((l: any) => ({ id: l.id, amount: l.amount, matched: l.matched })),
      external: statement.map((l: any) => ({ id: l.id, amount: l.amount, matched: l.matched })),
    });
  const suggestions = session.status === 'APPROVED' || (session.kind !== 'BANK' && session.kind !== 'CASH') ? []
    : session.kind === 'CASH'
    ? [cashSuggestion(money(session.bookBalance), money(session.countedCash), session.accountCode)].filter(Boolean)
    : bankSuggestions(statement.filter((l: any) => l.matchStatus !== 'EXCLUDED').map((l: any) => ({ id: l.id, amount: l.amount, description: l.description, matched: l.matched })), session.accountCode);
  return {
    id: session.id, kind: session.kind, accountCode: session.accountCode, treasuryId: session.treasuryId,
    periodFrom: session.periodFrom, periodTo: session.periodTo, status: session.status,
    bookBalance: money(session.bookBalance), externalOpening: money(session.externalOpening),
    externalClosing: session.kind === 'CASH' ? money(session.countedCash) : money(session.externalClosing),
    countedCash: session.countedCash == null ? null : money(session.countedCash),
    custodianName: session.custodianName, segregation: session.segregation,
    exceptionReason: session.exceptionReason, notes: session.notes,
    preparedBy: session.preparedBy, approvedBy: session.approvedBy,
    position, blockingDifference: position.difference,
    suggestions, book, statement,
    adjustments: (session.adjustments || []).map((a: any) => ({
      id: a.id, debitAccount: a.debitAccount, creditAccount: a.creditAccount, amount: money(a.amount),
      status: a.status, reason: a.reason, journalEntryId: a.journalEntryId,
    })),
  };
}

async function loadSession(tenantId: string, id: string) {
  return prisma.reconciliationSession.findFirst({
    where: { id, tenantId },
    include: { bookLines: true, statementLines: true, adjustments: true },
  });
}

async function savePosition(session: any) {
  const view = present(session);
  const position = view.position as { adjustedBook: number; adjustedExternal: number; difference: number };
  return prisma.reconciliationSession.update({
    where: { id: session.id },
    data: {
      adjustedBook: position.adjustedBook ?? view.bookBalance,
      adjustedExternal: position.adjustedExternal ?? view.externalClosing,
      difference: view.blockingDifference,
    },
    include: { bookLines: true, statementLines: true, adjustments: true },
  });
}

async function loadParties(tenantId: string, type: 'CUSTOMER' | 'SUPPLIER') {
  const accountCode = type === 'CUSTOMER' ? SYS.receivable : SYS.payable;
  const lines = await prisma.journalLine.findMany({
    where: { accountCode, entry: { tenantId, kind: { not: 'CLOSING' } } },
    include: { entry: true },
  });
  const salesIds: string[] = [];
  const purchaseIds: string[] = [];
  const voucherIds: string[] = [];
  for (const line of lines) {
    const ref = line.entry.sourceRef || '';
    if (ref.startsWith('salesDoc:')) salesIds.push(ref.slice(9));
    else if (ref.startsWith('purchaseDoc:')) purchaseIds.push(ref.slice(12));
    else if (ref.startsWith('voucher:')) voucherIds.push(ref.slice(8));
  }
  const [sales, purchases, vouchers, applications] = await Promise.all([
    salesIds.length ? prisma.salesDoc.findMany({ where: { tenantId, id: { in: salesIds } }, select: { id: true, customer: true, type: true } }) : [],
    purchaseIds.length ? prisma.purchaseDoc.findMany({ where: { tenantId, id: { in: purchaseIds } }, select: { id: true, supplier: true, type: true } }) : [],
    voucherIds.length ? prisma.voucher.findMany({ where: { tenantId, id: { in: voucherIds } }, select: { id: true, party: true, counterAccountCode: true } }) : [],
    prisma.partyApplication.findMany({ where: { tenantId, partyType: type } }),
  ]);
  const salesMap = new Map(sales.map((s) => [s.id, s]));
  const purchaseMap = new Map(purchases.map((p) => [p.id, p]));
  const voucherMap = new Map(vouchers.map((v) => [v.id, v]));
  const rows: ControlRow[] = lines.map((line) => {
    const effect = type === 'CUSTOMER'
      ? round2(Number(line.debit) - Number(line.credit))
      : round2(Number(line.credit) - Number(line.debit));
    const ref = line.entry.sourceRef || '';
    const base = { id: line.id, effect, date: line.entry.date.toISOString(), description: line.descAr || line.entry.descAr, reference: ref };
    if (ref.startsWith('salesDoc:')) {
      const doc = salesMap.get(ref.slice(9));
      if (doc) return { ...base, party: doc.customer, kind: doc.type === 'RETURN' ? 'RETURN' as const : 'INVOICE' as const };
    }
    if (ref.startsWith('purchaseDoc:')) {
      const doc = purchaseMap.get(ref.slice(12));
      if (doc) return { ...base, party: doc.supplier, kind: doc.type === 'RETURN' ? 'RETURN' as const : 'INVOICE' as const };
    }
    if (ref.startsWith('voucher:')) {
      const voucher = voucherMap.get(ref.slice(8));
      if (voucher && voucher.counterAccountCode === accountCode) return { ...base, party: voucher.party, kind: 'SETTLEMENT' as const };
    }
    return { ...base, party: null, kind: 'OTHER' as const };
  });
  const apps = applications.map((a) => ({ sourceId: a.sourceId, targetId: a.targetId, amount: Number(a.amount) }));
  return { accountCode, type, ...partyControl(rows, apps), rows, applications: apps };
}

router.get('/summary', async (req, res) => {
  const rows = await prisma.reconciliationSession.findMany({
    where: { tenantId: req.auth!.tenantId },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: { statementLines: true },
  });
  const open = rows.filter((r) => r.status !== 'APPROVED' && r.status !== 'REJECTED');
  const month = new Date();
  month.setDate(1);
  month.setHours(0, 0, 0, 0);
  const ages = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  for (const row of open) {
    for (const line of row.statementLines) {
      if (line.matchStatus !== 'UNMATCHED') continue;
      ages[ageBucket(line.transactionDate.toISOString())] += 1;
    }
  }
  res.json({
    open: open.length,
    approvedThisMonth: rows.filter((r) => r.status === 'APPROVED' && r.updatedAt >= month).length,
    difference: round2(open.reduce((s, r) => s + Math.abs(Number(r.difference)), 0)),
    unmatched: open.reduce((s, r) => s + r.statementLines.filter((l) => l.matchStatus === 'UNMATCHED').length, 0),
    ages,
    recent: rows.slice(0, 12).map((r) => ({
      id: r.id, kind: r.kind, accountCode: r.accountCode, status: r.status,
      difference: money(r.difference), bookBalance: money(r.bookBalance),
      externalClosing: money(r.externalClosing || r.countedCash), periodFrom: r.periodFrom, periodTo: r.periodTo,
      preparedBy: r.preparedBy, approvedBy: r.approvedBy,
    })),
  });
});

router.get('/', async (req, res) => {
  const rows = await prisma.reconciliationSession.findMany({
    where: { tenantId: req.auth!.tenantId },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  res.json(rows.map((r) => ({
    id: r.id, kind: r.kind, accountCode: r.accountCode, status: r.status,
    difference: money(r.difference), bookBalance: money(r.bookBalance),
    externalClosing: money(r.kind === 'CASH' ? r.countedCash : r.externalClosing),
    periodFrom: r.periodFrom, periodTo: r.periodTo,
  })));
});

router.get('/parties', async (req, res) => {
  const type = String(req.query.type || 'CUSTOMER');
  if (type !== 'CUSTOMER' && type !== 'SUPPLIER') return res.status(400).json({ error: 'نوع الطرف غير معروف' });
  const view = await loadParties(req.auth!.tenantId, type as 'CUSTOMER' | 'SUPPLIER');
  const { rows, applications, ...rest } = view;
  res.json(rest);
});

router.post('/parties/apply', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const type = String(req.body.partyType || '');
  const amount = money(req.body.amount);
  if (type !== 'CUSTOMER' && type !== 'SUPPLIER') return res.status(400).json({ error: 'نوع الطرف غير معروف' });
  const view = await loadParties(tenantId, type as 'CUSTOMER' | 'SUPPLIER');
  if (!canApply(view.rows, view.applications, String(req.body.sourceId || ''), String(req.body.targetId || ''), amount)) {
    return res.status(400).json({ error: 'لا يمكن تطبيق هذا المبلغ على الفاتورة' });
  }
  const source = view.rows.find((r) => r.id === req.body.sourceId)!;
  await prisma.partyApplication.create({
    data: { tenantId, partyType: type, partyName: source.party || '', sourceId: source.id, targetId: String(req.body.targetId), amount },
  });
  const next = await loadParties(tenantId, type as 'CUSTOMER' | 'SUPPLIER');
  const { rows, applications, ...rest } = next;
  res.status(201).json(rest);
});

router.post('/party-statement', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const type = String(req.body.type || '');
  if (type !== 'CUSTOMER' && type !== 'SUPPLIER') return res.status(400).json({ error: 'نوع الطرف غير معروف' });
  const party = String(req.body.party || '').trim();
  const from = day(String(req.body.periodFrom || '2000-01-01'));
  const to = day(String(req.body.periodTo || new Date().toISOString().slice(0, 10)), true);
  if (!party || !from || !to) return res.status(400).json({ error: 'اختر الطرف والفترة' });
  const view = await loadParties(tenantId, type);
  const mine = view.rows.filter((r) => r.party === party);
  const imported = [...(Array.isArray(req.body.lines) ? req.body.lines : []), ...parseStatementCsv(String(req.body.csv || ''))];
  if (!imported.length) return res.status(400).json({ error: 'أدخل حركات الكشف الخارجي' });
  const statement = imported.map((l: any) => {
    const date = day(String(l.date || '').slice(0, 10));
    return date ? { transactionDate: date, amount: money(l.amount), reference: l.reference || null, description: String(l.description || 'حركة كشف') } : null;
  });
  if (statement.some((l) => !l)) return res.status(400).json({ error: 'تاريخ إحدى حركات الكشف غير صالح' });
  const balance = round2(mine.reduce((s, r) => s + r.effect, 0));
  const session = await prisma.reconciliationSession.create({
    data: {
      tenantId, kind: type as 'CUSTOMER' | 'SUPPLIER', accountCode: type === 'CUSTOMER' ? SYS.receivable : SYS.payable,
      periodFrom: from, periodTo: to, bookBalance: balance, externalClosing: money(req.body.externalClosing),
      notes: party, preparedBy: req.auth!.userId, status: 'IN_PROGRESS',
      bookLines: {
        create: mine.filter((r) => Math.abs(r.effect) >= 0.01).map((r) => ({
          journalLineId: r.id, amount: r.effect, transactionDate: new Date(r.date), reference: r.reference || null, description: r.description || party,
        })),
      },
      statementLines: { create: statement as { transactionDate: Date; amount: number; reference: string | null; description: string }[] },
    },
    include: { bookLines: true, statementLines: true, adjustments: true },
  });
  const saved = await savePosition(session);
  res.status(201).json(present(saved));
});

router.get('/inventory', async (req, res) => {
  const asOf = new Date();
  const stock = await merchandiseAt(req.auth!.tenantId, asOf);
  const tie = inventoryTieOut(stock.physical, stock.posted);
  res.json({ ...tie, tracked: stock.tracked, asOf, posted: false });
});

router.get('/vat', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const [sales, purchases, outputLines, inputLines] = await Promise.all([
    prisma.salesDoc.findMany({ where: { tenantId, status: 'CONFIRMED', type: { in: ['INVOICE', 'RETURN'] } }, select: { type: true, vat: true } }),
    prisma.purchaseDoc.findMany({ where: { tenantId, status: 'CONFIRMED', type: { in: ['INVOICE', 'RETURN'] } }, select: { type: true, vat: true } }),
    prisma.journalLine.findMany({ where: { accountCode: SYS.outputVat, entry: { tenantId, kind: { not: 'CLOSING' } } }, select: { debit: true, credit: true } }),
    prisma.journalLine.findMany({ where: { accountCode: SYS.inputVat, entry: { tenantId, kind: { not: 'CLOSING' } } }, select: { debit: true, credit: true } }),
  ]);
  const signed = (rows: { type: string; vat: unknown }[]) => round2(rows.reduce((s, r) => s + (r.type === 'RETURN' ? -1 : 1) * Number(r.vat), 0));
  const tie = vatTieOut({
    outputGl: round2(outputLines.reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0)),
    inputGl: round2(inputLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0)),
    salesVat: signed(sales),
    purchaseVat: signed(purchases),
  });
  res.json({ ...tie, notice: 'مطابقة للعرض والتصدير فقط. الإقرار الضريبي ومراجعته مسؤولية المستخدم، ولا يُرسل من هذه الشاشة.' });
});

router.get('/:id', async (req, res) => {
  const session = await loadSession(req.auth!.tenantId, req.params.id);
  if (!session) return res.status(404).json({ error: 'المطابقة غير موجودة' });
  res.json(present(session));
});

router.post('/bank', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const { treasuryId, periodFrom, periodTo, externalOpening, externalClosing, lines, csv, notes, costCenterId, segregation, windowDays } = req.body;
  const from = day(String(periodFrom || ''));
  const to = day(String(periodTo || ''), true);
  if (!treasuryId || !from || !to) return res.status(400).json({ error: 'اختر البنك والفترة' });
  const treasury = await prisma.treasury.findFirst({ where: { id: treasuryId, tenantId } });
  if (!treasury || treasury.type !== 'BANK') return res.status(400).json({ error: 'اختر حساب بنك' });
  const imported = [
    ...(Array.isArray(lines) ? lines : []),
    ...parseStatementCsv(String(csv || '')),
  ];
  if (!imported.length) return res.status(400).json({ error: 'أدخل حركات كشف البنك أو الصق ملفاً' });
  const statement = imported.map((l) => {
    const date = day(String(l.date || '').slice(0, 10));
    return date ? { transactionDate: date, amount: money(l.amount), reference: l.reference || null, description: String(l.description || 'حركة كشف') } : null;
  });
  if (statement.some((l) => !l)) return res.status(400).json({ error: 'تاريخ إحدى حركات الكشف غير صالح' });
  const journals = await prisma.journalLine.findMany({
    where: { accountCode: treasury.accountCode, entry: { tenantId, date: { gte: from, lte: to } } },
    include: { entry: true },
  });
  const balance = await bookBalance(tenantId, treasury.accountCode, to);
  const session = await prisma.reconciliationSession.create({
    data: {
      tenantId, kind: 'BANK', accountCode: treasury.accountCode, treasuryId, costCenterId: costCenterId || null,
      periodFrom: from, periodTo: to, bookBalance: balance,
      externalOpening: money(externalOpening), externalClosing: money(externalClosing),
      segregation: !!segregation, notes: notes || null, preparedBy: req.auth!.userId, status: 'IN_PROGRESS',
      bookLines: {
        create: journals.map((l) => ({
          journalLineId: l.id,
          amount: money(Number(l.debit) - Number(l.credit)),
          transactionDate: l.entry.date,
          reference: l.entry.sourceRef || null,
          description: l.descAr || l.entry.descAr,
        })).filter((l) => Math.abs(l.amount) >= 0.01),
      },
      statementLines: { create: statement as { transactionDate: Date; amount: number; reference: string | null; description: string }[] },
    },
    include: { bookLines: true, statementLines: true, adjustments: true },
  });
  const pairs = autoMatch(
    session.bookLines.map((l) => ({ id: l.id, date: l.transactionDate.toISOString(), amount: money(l.amount), reference: l.reference })),
    session.statementLines.map((l) => ({ id: l.id, date: l.transactionDate.toISOString(), amount: money(l.amount), reference: l.reference })),
    Number(windowDays ?? 3),
  );
  for (const pair of pairs) {
    const group = `auto:${pair.bookId}`;
    await prisma.reconcileBookLine.update({ where: { id: pair.bookId }, data: { matchStatus: 'AUTO', matchMethod: pair.method, matchGroupId: group } });
    await prisma.reconcileStatementLine.update({ where: { id: pair.externalId }, data: { matchStatus: 'AUTO', matchMethod: pair.method, matchGroupId: group } });
  }
  const saved = await savePosition(await loadSession(tenantId, session.id));
  await prisma.auditLog.create({
    data: { tenantId, userId: req.auth!.userId, action: 'reconcile.bank', resource: session.id, result: `diff ${money(saved.difference)}` },
  });
  res.status(201).json(present(saved));
});

router.post('/cash', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const { treasuryId, periodTo, counted, custodianName, notes, costCenterId, segregation } = req.body;
  const to = day(String(periodTo || new Date().toISOString().slice(0, 10)), true);
  if (!treasuryId || !to || !(Number(counted) >= 0)) return res.status(400).json({ error: 'اختر الصندوق وأدخل النقد المعدود' });
  const treasury = await prisma.treasury.findFirst({ where: { id: treasuryId, tenantId } });
  if (!treasury || treasury.type !== 'CASH') return res.status(400).json({ error: 'اختر صندوقاً' });
  const balance = await bookBalance(tenantId, treasury.accountCode, to);
  const session = await prisma.reconciliationSession.create({
    data: {
      tenantId, kind: 'CASH', accountCode: treasury.accountCode, treasuryId, costCenterId: costCenterId || null,
      periodFrom: to, periodTo: to, bookBalance: balance, countedCash: money(counted), externalClosing: money(counted),
      custodianName: custodianName || null, segregation: !!segregation, notes: notes || null,
      preparedBy: req.auth!.userId, status: 'IN_PROGRESS', difference: cashPosition(balance, money(counted)).difference,
    },
    include: { bookLines: true, statementLines: true, adjustments: true },
  });
  await prisma.auditLog.create({
    data: { tenantId, userId: req.auth!.userId, action: 'reconcile.cash', resource: session.id, result: `diff ${money(session.difference)}` },
  });
  res.status(201).json(present(session));
});

router.post('/:id/match', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const session = await loadSession(tenantId, req.params.id);
  if (!session) return res.status(404).json({ error: 'المطابقة غير موجودة' });
  if (session.status === 'APPROVED') return res.status(409).json({ error: 'المطابقة معتمدة' });
  const bookIds: string[] = req.body.bookIds || [];
  const statementIds: string[] = req.body.statementIds || [];
  const books = session.bookLines.filter((l) => bookIds.includes(l.id));
  const statements = session.statementLines.filter((l) => statementIds.includes(l.id));
  if (!books.length || !statements.length) return res.status(400).json({ error: 'اختر حركة من الدفاتر وحركة من الكشف' });
  if (!sumsMatch(books.map((l) => money(l.amount)), statements.map((l) => money(l.amount)))) {
    return res.status(400).json({ error: 'مجموع الدفاتر لا يساوي مجموع الكشف' });
  }
  const group = `manual:${Date.now()}`;
  await prisma.reconcileBookLine.updateMany({ where: { id: { in: books.map((l) => l.id) } }, data: { matchStatus: 'MANUAL', matchMethod: 'MANUAL', matchGroupId: group } });
  await prisma.reconcileStatementLine.updateMany({ where: { id: { in: statements.map((l) => l.id) } }, data: { matchStatus: 'MANUAL', matchMethod: 'MANUAL', matchGroupId: group } });
  const saved = await savePosition(await loadSession(tenantId, session.id));
  res.json(present(saved));
});

router.post('/:id/unmatch', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const session = await loadSession(tenantId, req.params.id);
  if (!session || !req.body.groupId) return res.status(404).json({ error: 'المطابقة غير موجودة' });
  if (session.status === 'APPROVED') return res.status(409).json({ error: 'المطابقة معتمدة' });
  await prisma.reconcileBookLine.updateMany({ where: { sessionId: session.id, matchGroupId: String(req.body.groupId) }, data: { matchStatus: 'UNMATCHED', matchMethod: null, matchGroupId: null } });
  await prisma.reconcileStatementLine.updateMany({ where: { sessionId: session.id, matchGroupId: String(req.body.groupId) }, data: { matchStatus: 'UNMATCHED', matchMethod: null, matchGroupId: null } });
  await prisma.auditLog.create({ data: { tenantId, userId: req.auth!.userId, action: 'reconcile.unmatch', resource: session.id, result: String(req.body.groupId).slice(0, 80) } });
  const saved = await savePosition(await loadSession(tenantId, session.id));
  res.json(present(saved));
});

router.post('/:id/exclude', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'سبب الاستثناء إلزامي، والفرق يبقى ظاهراً' });
  const session = await loadSession(tenantId, req.params.id);
  if (!session) return res.status(404).json({ error: 'المطابقة غير موجودة' });
  if (session.status === 'APPROVED') return res.status(409).json({ error: 'المطابقة معتمدة' });
  if (req.body.bookId) await prisma.reconcileBookLine.updateMany({ where: { id: String(req.body.bookId), sessionId: session.id }, data: { matchStatus: 'EXCLUDED', exceptionReason: reason } });
  if (req.body.statementId) await prisma.reconcileStatementLine.updateMany({ where: { id: String(req.body.statementId), sessionId: session.id }, data: { matchStatus: 'EXCLUDED', exceptionReason: reason } });
  const saved = await savePosition(await loadSession(tenantId, session.id));
  res.json(present(saved));
});

router.post('/:id/approve', requireRole('ADMIN'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const session = await loadSession(tenantId, req.params.id);
  if (!session) return res.status(404).json({ error: 'المطابقة غير موجودة' });
  if (session.status === 'APPROVED') return res.status(409).json({ error: 'المطابقة معتمدة مسبقاً' });
  if (session.segregation && session.preparedBy === req.auth!.userId) {
    return res.status(403).json({ error: 'فصل المهام يمنع معد المطابقة من اعتمادها' });
  }
  const view = present(session);
  const suggestions = view.suggestions as { statementLineId?: string; debitAccount: string; creditAccount: string; amount: number; reason: string }[];
  const simulatedExternal = view.statement.map((l: any) => ({
    id: l.id, amount: l.amount, matched: l.matched || suggestions.some((s) => s.statementLineId === l.id),
  }));
  const simulated = session.kind === 'CASH'
    ? { difference: suggestions.length ? 0 : view.blockingDifference }
    : bankPosition({
      bookBalance: view.bookBalance,
      externalClosing: view.externalClosing,
      book: view.book.map((l: any) => ({ id: l.id, amount: l.amount, matched: l.matched })),
      external: simulatedExternal,
    });
  const exceptionReason = String(req.body.exceptionReason || '').trim();
  if (Math.abs(simulated.difference) >= 0.02 && !exceptionReason) {
    return res.status(400).json({ error: 'لا يُعتمد فرق غير صفري إلا بسبب مكتوب من المدير' });
  }
  try {
    if (suggestions.length) await assertPeriodOpen(tenantId, session.periodTo);
    for (const suggestion of suggestions) {
      if (suggestion.debitAccount === '5301' || suggestion.debitAccount === '5302' || suggestion.creditAccount === '4301') {
        await assertCenter(tenantId, session.costCenterId);
      }
    }
  } catch (error) {
    return res.status((error as { status?: number }).status || 400).json({ error: (error as Error).message });
  }

  const posted: string[] = [];
  for (const suggestion of suggestions) {
    const lines = [
      { accountCode: suggestion.debitAccount, debit: suggestion.amount, credit: 0, descAr: suggestion.reason, costCenterId: session.costCenterId || undefined },
      { accountCode: suggestion.creditAccount, debit: 0, credit: suggestion.amount, descAr: suggestion.reason, costCenterId: session.costCenterId || undefined },
    ];
    const valid = await validateEntryLines(tenantId, lines);
    if (!valid.ok) return res.status(422).json({ error: valid.error });
    const entry = await prisma.$transaction(async (tx) => tx.journalEntry.create({
      data: {
        tenantId, date: session.periodTo, descAr: suggestion.reason, isAuto: true,
        sourceRef: `reconcile:${session.id}`, createdBy: req.auth!.userId,
        number: await nextEntryNumber(tenantId, tx),
        lines: { create: valid.lines },
      },
    }));
    const adjustment = await prisma.reconcileAdjustment.create({
      data: {
        sessionId: session.id, statementLineId: suggestion.statementLineId || null, journalEntryId: entry.id,
        debitAccount: suggestion.debitAccount, creditAccount: suggestion.creditAccount,
        amount: suggestion.amount, status: 'POSTED', reason: suggestion.reason,
        createdBy: session.preparedBy, approvedBy: req.auth!.userId, approvedAt: new Date(),
      },
    });
    if (suggestion.statementLineId) {
      await prisma.reconcileStatementLine.update({
        where: { id: suggestion.statementLineId },
        data: { matchStatus: 'AUTO', matchMethod: 'ADJUST', matchGroupId: adjustment.id },
      });
    }
    posted.push(entry.id);
  }

  const balance = await bookBalance(tenantId, session.accountCode, session.periodTo);
  const updated = await prisma.reconciliationSession.update({
    where: { id: session.id },
    data: {
      bookBalance: balance, status: 'APPROVED', approvedBy: req.auth!.userId,
      exceptionReason: exceptionReason || null,
    },
    include: { bookLines: true, statementLines: true, adjustments: true },
  });
  const saved = await savePosition(updated);
  await prisma.auditLog.create({
    data: {
      tenantId, userId: req.auth!.userId, action: 'reconcile.approve', resource: session.id,
      result: `book ${money(saved.bookBalance)} diff ${money(saved.difference)} entries ${posted.length}`,
    },
  });
  res.json(present(saved));
});

export default router;
