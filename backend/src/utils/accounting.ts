import { prisma } from '../config/db';

export type Acc = { code: string; nameAr: string; nameEn: string; type: string; subtype: string | null; isGroup: boolean; parentId: string | null; id: string };

// الطبيعة المدينة: الأصول والمشتريات/المصروفات. أي رصيد يُحسب دائماً بنفس هذه القاعدة
// فلا يختلف تفسير الرصيد من تقرير لآخر.
export const isDebitNature = (type: string, subtype?: string | null) => {
  if (subtype === 'CONTRA_ASSET') return false;      // مجمع الإهلاك رصيده دائن
  if (subtype === 'DRAWINGS') return true;           // المسحوبات رصيدها مدين
  if (subtype === 'SALES_RETURNS') return true;      // مردودات المبيعات مدينة
  if (subtype === 'PURCHASE_RETURNS') return false;  // مردودات المشتريات دائنة
  return type === 'ASSET' || type === 'PURCHASES';
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface BalanceRow {
  code: string; nameAr: string; nameEn: string; type: string; subtype: string | null; isGroup: boolean;
  debit: number; credit: number; balance: number; // balance موجب = بنفس طبيعة الحساب
  openingDebit: number; openingCredit: number; openingBalance: number;
}

/**
 * محرّك الأرصدة: يقرأ القيود مرة واحدة ويحسب أرصدة كل الحسابات.
 * from/to يحددان الفترة؛ ما قبل from يُحسب كرصيد افتتاحي للفترة.
 * كل التقارير والقوائم المالية تعتمد على هذه الدالة وحدها لضمان تطابق الأرقام.
 */
export async function buildBalances(tenantId: string, opts: { from?: Date; to?: Date; includeClosing?: boolean } = {}) {
  const accounts = (await prisma.account.findMany({ where: { tenantId }, orderBy: { code: 'asc' } })) as unknown as Acc[];
  const where: any = { entry: { tenantId } };
  if (opts.to) where.entry.date = { lte: opts.to };
  if (opts.includeClosing === false) where.entry.kind = { not: 'CLOSING' };

  const lines = await prisma.journalLine.findMany({ where, include: { entry: { select: { date: true, kind: true } } } });

  const map = new Map<string, BalanceRow>();
  for (const a of accounts) {
    map.set(a.code, {
      code: a.code, nameAr: a.nameAr, nameEn: a.nameEn, type: a.type, subtype: a.subtype, isGroup: a.isGroup,
      debit: 0, credit: 0, balance: 0, openingDebit: 0, openingCredit: 0, openingBalance: 0,
    });
  }
  for (const l of lines) {
    const row = map.get(l.accountCode);
    if (!row) continue;
    const d = Number(l.debit), c = Number(l.credit);
    if (opts.from && l.entry.date < opts.from) { row.openingDebit += d; row.openingCredit += c; }
    else { row.debit += d; row.credit += c; }
  }
  const sign = (r: BalanceRow) => (isDebitNature(r.type, r.subtype) ? 1 : -1);
  for (const r of map.values()) {
    r.openingDebit = round2(r.openingDebit); r.openingCredit = round2(r.openingCredit);
    r.debit = round2(r.debit); r.credit = round2(r.credit);
    r.openingBalance = round2((r.openingDebit - r.openingCredit) * sign(r));
    r.balance = round2((r.openingDebit + r.debit - r.openingCredit - r.credit) * sign(r));
  }
  return { accounts, rows: [...map.values()] };
}

export const sumBy = (rows: BalanceRow[], pred: (r: BalanceRow) => boolean) =>
  round2(rows.filter((r) => !r.isGroup && pred(r)).reduce((s, r) => s + r.balance, 0));

export const listBy = (rows: BalanceRow[], pred: (r: BalanceRow) => boolean) =>
  rows.filter((r) => !r.isGroup && pred(r) && Math.abs(r.balance) > 0.004)
      .map((r) => ({ code: r.code, nameAr: r.nameAr, nameEn: r.nameEn, amount: r.balance }));

// الحسابات المقابلة (Contra) تُطرح من مجموعة نوعها: مجمع الإهلاك يُطرح من الأصول،
// ومردودات المبيعات تُطرح من الإيرادات، ومردودات المشتريات تُطرح من المصروفات.
// أي تجميع على مستوى النوع يجب أن يمر من هنا حتى لا تُجمع هذه الحسابات خطأً.
export const CONTRA_SUBTYPES = ['CONTRA_ASSET', 'SALES_RETURNS', 'PURCHASE_RETURNS'];
export const isContra = (r: { subtype: string | null }) => !!r.subtype && CONTRA_SUBTYPES.includes(r.subtype);

/** إجمالي نوع حسابي صافياً بعد طرح الحسابات المقابلة */
export function totalOfType(rows: BalanceRow[], type: string) {
  return round2(
    rows.filter((r) => !r.isGroup && r.type === type)
        .reduce((s, r) => s + (isContra(r) ? -r.balance : r.balance), 0)
  );
}

/** صافي الأصول = الأصول − مجمع الإهلاك */
export const totalAssets = (rows: BalanceRow[]) => totalOfType(rows, 'ASSET');
/** صافي الإيرادات = المبيعات والإيرادات − مردودات المبيعات */
export const totalRevenue = (rows: BalanceRow[]) => totalOfType(rows, 'SALES');
/** صافي المصروفات = المشتريات والمصروفات − مردودات المشتريات */
export const totalExpenses = (rows: BalanceRow[]) => totalOfType(rows, 'PURCHASES');
/** حقوق الملكية المسجّلة (المسحوبات مدينة فتُطرح تلقائياً بإشارتها) */
export const totalEquityPosted = (rows: BalanceRow[]) =>
  round2(rows.filter((r) => !r.isGroup && r.type === 'EQUITY').reduce((s, r) => s + (r.subtype === 'DRAWINGS' ? -r.balance : r.balance), 0));

// صافي الربح للفترة = صافي الإيرادات − صافي المصروفات
export function netProfitOf(rows: BalanceRow[]) {
  return round2(totalRevenue(rows) - totalExpenses(rows));
}

/** الرقم التسلسلي التالي للقيد داخل المنشأة */
export async function nextEntryNumber(tenantId: string, db: any = prisma) {
  const last = await db.journalEntry.findFirst({ where: { tenantId }, orderBy: { number: 'desc' }, select: { number: true } });
  return (last?.number || 0) + 1;
}

/**
 * التحقق الكامل من صحة القيد قبل الحفظ — نقطة واحدة تمنع دخول أي قيد خاطئ:
 * أطراف كافية، حسابات موجودة وغير تجميعية ونشطة، لا سطر بمدين ودائن معاً، وتوازن تام.
 */
export async function validateEntryLines(
  tenantId: string,
  lines: { accountCode: string; debit?: number; credit?: number; descAr?: string; costCenterId?: string }[],
  db: any = prisma
) {
  if (!Array.isArray(lines) || lines.length < 2) return { ok: false as const, error: 'القيد يحتاج طرفين على الأقل' };

  const clean = lines
    .map((l) => ({ accountCode: String(l.accountCode || '').trim(), debit: round2(Number(l.debit) || 0), credit: round2(Number(l.credit) || 0), descAr: l.descAr || null, costCenterId: (l as { costCenterId?: string }).costCenterId || null }))
    .filter((l) => l.accountCode && (l.debit !== 0 || l.credit !== 0));

  if (clean.length < 2) return { ok: false as const, error: 'أدخل طرفين على الأقل بمبالغ صحيحة' };
  if (clean.some((l) => l.debit < 0 || l.credit < 0)) return { ok: false as const, error: 'لا تُقبل المبالغ السالبة' };
  const both = clean.find((l) => l.debit > 0 && l.credit > 0);
  if (both) return { ok: false as const, error: `الحساب ${both.accountCode}: لا يمكن أن يكون مديناً ودائناً في نفس السطر` };

  const codes = [...new Set(clean.map((l) => l.accountCode))];
  const accounts = await db.account.findMany({ where: { tenantId, code: { in: codes } } });
  const byCode = new Map(accounts.map((a: any) => [a.code, a]));
  for (const code of codes) {
    const a: any = byCode.get(code);
    if (!a) return { ok: false as const, error: `الحساب ${code} غير موجود في دليل الحسابات` };
    if (a.isGroup) return { ok: false as const, error: `الحساب ${code} (${a.nameAr}) حساب تجميعي ولا يُرحَّل عليه — اختر حساباً فرعياً` };
    if (!a.active) return { ok: false as const, error: `الحساب ${code} (${a.nameAr}) غير نشط` };
  }

  const totalDebit = round2(clean.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(clean.reduce((s, l) => s + l.credit, 0));
  if (totalDebit === 0) return { ok: false as const, error: 'إجمالي القيد صفر' };
  if (Math.abs(totalDebit - totalCredit) > 0.004) {
    return { ok: false as const, error: `القيد غير متوازن: المدين ${totalDebit.toFixed(2)} والدائن ${totalCredit.toFixed(2)} والفرق ${Math.abs(totalDebit - totalCredit).toFixed(2)}` };
  }
  return { ok: true as const, lines: clean, totalDebit, totalCredit };
}

/** يمنع الترحيل داخل سنة مالية مُقفلة */
export async function assertPeriodOpen(tenantId: string, date: Date, db: any = prisma) {
  const fy = await db.fiscalYear.findFirst({ where: { tenantId, startDate: { lte: date }, endDate: { gte: date } } });
  if (fy?.closed) throw Object.assign(new Error(`السنة المالية ${fy.name} مقفلة ولا يمكن الترحيل فيها`), { status: 409 });
  return fy;
}
