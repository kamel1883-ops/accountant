import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth } from '../../middleware/auth';
import { buildBalances, sumBy, listBy, netProfitOf, round2, BalanceRow, totalAssets, totalEquityPosted } from '../../utils/accounting';

const router = Router();
router.use(requireAuth);

// الفترة الافتراضية: من بداية السنة الحالية إلى اليوم
function period(req: any) {
  const now = new Date();
  const fromRaw = req.query.from ? new Date(String(req.query.from)) : new Date(now.getFullYear(), 0, 1);
  const toRaw = req.query.to ? new Date(String(req.query.to) + 'T23:59:59') : now;
  const from = Number.isNaN(fromRaw.getTime()) ? new Date(now.getFullYear(), 0, 1) : fromRaw;
  const to = Number.isNaN(toRaw.getTime()) ? now : toRaw;
  return { from, to };
}

function fail(res: any, e: unknown, msg: string) {
  console.error(msg, e);
  if (!res.headersSent) res.status(500).json({ error: msg });
}

/* ===================== 1) قائمة الدخل ===================== */
// GET /api/statements/income?from&to
router.get('/income', async (req, res) => {
  try {
  const { from, to } = period(req);
  const { rows } = await buildBalances(req.auth!.tenantId, { from, to, includeClosing: false });
  const inPeriod = rows.map((r) => ({ ...r, balance: r.balance - r.openingBalance })); // حركة الفترة فقط

  const sales = sumBy(inPeriod, (r) => r.subtype === 'SALES_REVENUE');
  const salesReturns = sumBy(inPeriod, (r) => r.subtype === 'SALES_RETURNS');
  const netSales = round2(sales - salesReturns);
  const purchases = sumBy(inPeriod, (r) => r.subtype === 'PURCHASES_COST');
  const purchaseReturns = sumBy(inPeriod, (r) => r.subtype === 'PURCHASE_RETURNS');
  const cogs = round2(purchases - purchaseReturns);
  const grossProfit = round2(netSales - cogs);
  const operating = sumBy(inPeriod, (r) => r.subtype === 'OPERATING_EXPENSE' || r.subtype === 'DEPRECIATION');
  const operatingProfit = round2(grossProfit - operating);
  const otherIncome = sumBy(inPeriod, (r) => r.subtype === 'OTHER_INCOME');
  const otherExpense = sumBy(inPeriod, (r) => r.subtype === 'OTHER_EXPENSE');
  const netProfit = round2(operatingProfit + otherIncome - otherExpense);

  res.json({
    from, to,
    sales: { total: sales, items: listBy(inPeriod, (r) => r.subtype === 'SALES_REVENUE') },
    salesReturns: { total: salesReturns, items: listBy(inPeriod, (r) => r.subtype === 'SALES_RETURNS') },
    netSales,
    cogs: {
      total: cogs, purchases, purchaseReturns,
      openingInventory: 0, closingInventory: 0,
      items: listBy(inPeriod, (r) => r.subtype === 'PURCHASES_COST'),
    },
    grossProfit,
    operatingExpenses: { total: operating, items: listBy(inPeriod, (r) => r.subtype === 'OPERATING_EXPENSE' || r.subtype === 'DEPRECIATION') },
    operatingProfit,
    otherIncome: { total: otherIncome, items: listBy(inPeriod, (r) => r.subtype === 'OTHER_INCOME') },
    otherExpense: { total: otherExpense, items: listBy(inPeriod, (r) => r.subtype === 'OTHER_EXPENSE') },
    netProfit,
    margin: netSales ? round2((netProfit / netSales) * 100) : 0,
  });
  } catch (e) { fail(res, e, 'تعذّر إعداد قائمة الدخل'); }
});

/* ===================== 2) قائمة المركز المالي ===================== */
// GET /api/statements/balance-sheet?asOf
router.get('/balance-sheet', async (req, res) => {
  try {
  const asOfRaw = req.query.asOf ? new Date(String(req.query.asOf) + 'T23:59:59') : new Date();
  const asOf = Number.isNaN(asOfRaw.getTime()) ? new Date() : asOfRaw;
  const { rows } = await buildBalances(req.auth!.tenantId, { to: asOf, includeClosing: false });

  const currentAssets = sumBy(rows, (r) => r.subtype === 'CURRENT_ASSET' || r.subtype === 'CASH');
  const currentItems = listBy(rows, (r) => r.subtype === 'CURRENT_ASSET' || r.subtype === 'CASH');
  const nonCurrentGross = sumBy(rows, (r) => r.subtype === 'NON_CURRENT_ASSET');
  const accumDep = sumBy(rows, (r) => r.subtype === 'CONTRA_ASSET'); // رصيده دائن فيظهر موجباً
  const nonCurrentAssets = round2(nonCurrentGross - accumDep);
  const assetsTotal = round2(currentAssets + nonCurrentAssets);

  const currentLiabilities = sumBy(rows, (r) => r.subtype === 'CURRENT_LIABILITY');
  const nonCurrentLiabilities = sumBy(rows, (r) => r.subtype === 'NON_CURRENT_LIABILITY');
  const totalLiabilities = round2(currentLiabilities + nonCurrentLiabilities);

  // حقوق الملكية المسجّلة + نتيجة الفترة غير المقفلة (حتى تتوازن المعادلة قبل الإقفال)
  const equityPosted = totalEquityPosted(rows);
  const result = netProfitOf(rows);
  const totalEquity = round2(equityPosted + result);

  const diff = round2(assetsTotal - (totalLiabilities + totalEquity));
  res.json({
    asOf,
    assets: {
      current: { total: currentAssets, items: currentItems.filter((i) => Math.abs(i.amount) > 0.004) },
      nonCurrent: { total: nonCurrentAssets, gross: nonCurrentGross, accumulatedDepreciation: accumDep, items: listBy(rows, (r) => r.subtype === 'NON_CURRENT_ASSET' || r.subtype === 'CONTRA_ASSET') },
      total: assetsTotal,
    },
    liabilities: {
      current: { total: currentLiabilities, items: listBy(rows, (r) => r.subtype === 'CURRENT_LIABILITY') },
      nonCurrent: { total: nonCurrentLiabilities, items: listBy(rows, (r) => r.subtype === 'NON_CURRENT_LIABILITY') },
      total: totalLiabilities,
    },
    equity: { posted: { total: equityPosted, items: listBy(rows, (r) => r.type === 'EQUITY') }, currentPeriodResult: result, total: totalEquity },
    totalLiabilitiesAndEquity: round2(totalLiabilities + totalEquity),
    balanced: Math.abs(diff) < 0.01,
    difference: diff,
  });
  } catch (e) { fail(res, e, 'تعذّر إعداد قائمة المركز المالي'); }
});

/* ===================== 3) قائمة التغير في حقوق الملكية ===================== */
// GET /api/statements/equity?from&to
router.get('/equity', async (req, res) => {
  try {
  const { from, to } = period(req);
  const { rows } = await buildBalances(req.auth!.tenantId, { from, to, includeClosing: false });
  const movement = (pred: (r: BalanceRow) => boolean) => ({
    opening: sumBy(rows.map((r) => ({ ...r, balance: r.openingBalance })), pred),
    change: sumBy(rows.map((r) => ({ ...r, balance: r.balance - r.openingBalance })), pred),
    closing: sumBy(rows, pred),
  });
  const capital = movement((r) => r.subtype === 'CAPITAL');
  const reserves = movement((r) => r.subtype === 'RESERVES');
  const retained = movement((r) => r.subtype === 'RETAINED_EARNINGS');
  const drawings = movement((r) => r.subtype === 'DRAWINGS');
  const inPeriodRows = rows.map((r) => ({ ...r, balance: r.balance - r.openingBalance }));
  const profit = netProfitOf(inPeriodRows);
  const openingTotal = round2(capital.opening + reserves.opening + retained.opening - drawings.opening);
  const closingTotal = round2(openingTotal + capital.change + reserves.change + retained.change - drawings.change + profit);

  res.json({ from, to, capital, reserves, retainedEarnings: retained, drawings, profitForPeriod: profit, openingTotal, closingTotal });
  } catch (e) { fail(res, e, 'تعذّر إعداد قائمة التغير في حقوق الملكية'); }
});

/* ===================== 4) قائمة التدفقات النقدية (الطريقة غير المباشرة) ===================== */
// GET /api/statements/cash-flow?from&to
router.get('/cash-flow', async (req, res) => {
  try {
  const { from, to } = period(req);
  const { rows } = await buildBalances(req.auth!.tenantId, { from, to, includeClosing: false });
  const change = (pred: (r: BalanceRow) => boolean) => sumBy(rows.map((r) => ({ ...r, balance: r.balance - r.openingBalance })), pred);
  const inPeriodRows = rows.map((r) => ({ ...r, balance: r.balance - r.openingBalance }));

  const profit = netProfitOf(inPeriodRows);
  const depreciation = change((r) => r.subtype === 'DEPRECIATION'); // مصروف غير نقدي يُضاف
  // زيادة الأصول المتداولة تستهلك نقداً (بالسالب)، وزيادة الخصوم المتداولة توفّر نقداً (بالموجب)
  const workingCapitalAssets = -change((r) => r.subtype === 'CURRENT_ASSET');
  const workingCapitalLiabilities = change((r) => r.subtype === 'CURRENT_LIABILITY');
  const operating = round2(profit + depreciation + workingCapitalAssets + workingCapitalLiabilities);

  const investing = round2(-change((r) => r.subtype === 'NON_CURRENT_ASSET'));
  const financing = round2(
    change((r) => r.subtype === 'CAPITAL') + change((r) => r.subtype === 'NON_CURRENT_LIABILITY') - change((r) => r.subtype === 'DRAWINGS')
  );

  const openingCash = sumBy(rows.map((r) => ({ ...r, balance: r.openingBalance })), (r) => r.subtype === 'CASH');
  const closingCash = sumBy(rows, (r) => r.subtype === 'CASH');
  const netChange = round2(operating + investing + financing);
  const actualChange = round2(closingCash - openingCash);

  res.json({
    from, to,
    operating: { netProfit: profit, depreciation, inventoryChange: 0, workingCapitalAssets, workingCapitalLiabilities, total: operating },
    investing: { total: investing, items: listBy(inPeriodRows, (r) => r.subtype === 'NON_CURRENT_ASSET') },
    financing: { total: financing, items: listBy(inPeriodRows, (r) => r.subtype === 'CAPITAL' || r.subtype === 'NON_CURRENT_LIABILITY' || r.subtype === 'DRAWINGS') },
    netChange, openingCash, closingCash, actualChange,
    reconciled: Math.abs(netChange - actualChange) < 0.01,
    cashAccounts: listBy(rows, (r) => r.subtype === 'CASH'),
  });
  } catch (e) { fail(res, e, 'تعذّر إعداد قائمة التدفقات النقدية'); }
});

/* ===================== فحص سلامة البيانات ===================== */
// GET /api/statements/health — يتحقق أن المخرجات سليمة ويكشف أي خلل في المدخلات
router.get('/health', async (req, res) => {
  try {
  const tenantId = req.auth!.tenantId;
  const { rows } = await buildBalances(tenantId, {});
  const issues: { level: 'error' | 'warn'; message: string }[] = [];

  const totalDebit = round2(rows.reduce((s, r) => s + r.openingDebit + r.debit, 0));
  const totalCredit = round2(rows.reduce((s, r) => s + r.openingCredit + r.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) issues.push({ level: 'error', message: `ميزان المراجعة غير متوازن بفارق ${round2(totalDebit - totalCredit)}` });

  // قيود غير متوازنة بشكل فردي
  const entries = await prisma.journalEntry.findMany({ where: { tenantId }, include: { lines: true } });
  for (const e of entries) {
    const d = round2(e.lines.reduce((s, l) => s + Number(l.debit), 0));
    const c = round2(e.lines.reduce((s, l) => s + Number(l.credit), 0));
    if (Math.abs(d - c) > 0.004) issues.push({ level: 'error', message: `القيد رقم ${e.number ?? e.id.slice(0, 8)} بتاريخ ${e.date.toISOString().slice(0, 10)} غير متوازن` });
    if (e.lines.length < 2) issues.push({ level: 'error', message: `القيد رقم ${e.number ?? e.id.slice(0, 8)} له طرف واحد فقط` });
  }

  // سطور تشير إلى حسابات محذوفة أو تجميعية
  const accounts = await prisma.account.findMany({ where: { tenantId } });
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const lines = await prisma.journalLine.findMany({ where: { entry: { tenantId } } });
  const orphan = [...new Set(lines.map((l) => l.accountCode).filter((c) => !byCode.has(c)))];
  if (orphan.length) issues.push({ level: 'error', message: `سطور مرحّلة على حسابات غير موجودة: ${orphan.join(', ')}` });
  const onGroup = [...new Set(lines.map((l) => l.accountCode).filter((c) => byCode.get(c)?.isGroup))];
  if (onGroup.length) issues.push({ level: 'warn', message: `سطور مرحّلة على حسابات تجميعية: ${onGroup.join(', ')}` });

  // أرصدة عكس الطبيعة (تنبيه فقط، قد تكون صحيحة كسحب على المكشوف)
  for (const r of rows) {
    if (!r.isGroup && r.balance < -0.01 && (r.subtype === 'CASH' || r.subtype === 'CURRENT_ASSET')) {
      issues.push({ level: 'warn', message: `الحساب ${r.code} (${r.nameAr}) رصيده عكس طبيعته: ${r.balance}` });
    }
  }

  const bs = { assets: totalAssets(rows), liab: sumBy(rows, (r) => r.type === 'LIABILITY'), eq: round2(totalEquityPosted(rows) + netProfitOf(rows)) };
  if (Math.abs(bs.assets - (bs.liab + bs.eq)) > 0.01) issues.push({ level: 'error', message: 'معادلة المركز المالي غير متوازنة (الأصول ≠ الخصوم + حقوق الملكية)' });

  res.json({
    healthy: issues.filter((i) => i.level === 'error').length === 0,
    totals: { totalDebit, totalCredit, entries: entries.length, accounts: accounts.length },
    accountingEquation: bs,
    issues,
  });
  } catch (e) { fail(res, e, 'تعذّر فحص سلامة البيانات'); }
});

export default router;