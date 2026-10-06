import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth } from '../../middleware/auth';
import { buildBalances, round2, listBy, sumBy, netProfitOf, totalExpenses, isDebitNature, BalanceRow } from '../../utils/accounting';

const router = Router();
router.use(requireAuth);

function dateFilter(req: any) {
  const { from, to } = req.query;
  return {
    ...(from ? { gte: new Date(String(from)) } : {}),
    ...(to ? { lte: new Date(String(to)) } : {}),
  };
}

// GET /api/reports/sales?from&to — sales invoices, totals, and a breakdown by customer
router.get('/sales', async (req, res) => {
  const df = dateFilter(req);
  const invoices = await prisma.invoice.findMany({ where: { tenantId: req.auth!.tenantId, type: 'SALE', ...(Object.keys(df).length ? { date: df } : {}) }, orderBy: { date: 'desc' } });
  const byParty: Record<string, { count: number; subtotal: number; vat: number; total: number }> = {};
  for (const i of invoices) {
    const p = (byParty[i.party] ||= { count: 0, subtotal: 0, vat: 0, total: 0 });
    p.count++; p.subtotal += Number(i.subtotal); p.vat += Number(i.vat); p.total += Number(i.total);
  }
  res.json({
    invoices,
    totals: { subtotal: invoices.reduce((s, i) => s + Number(i.subtotal), 0), vat: invoices.reduce((s, i) => s + Number(i.vat), 0), total: invoices.reduce((s, i) => s + Number(i.total), 0) },
    byCustomer: byParty,
  });
});

// GET /api/reports/purchases?from&to — same shape, for purchase invoices / suppliers
router.get('/purchases', async (req, res) => {
  const df = dateFilter(req);
  const invoices = await prisma.invoice.findMany({ where: { tenantId: req.auth!.tenantId, type: 'PURCHASE', ...(Object.keys(df).length ? { date: df } : {}) }, orderBy: { date: 'desc' } });
  const byParty: Record<string, { count: number; subtotal: number; vat: number; total: number }> = {};
  for (const i of invoices) {
    const p = (byParty[i.party] ||= { count: 0, subtotal: 0, vat: 0, total: 0 });
    p.count++; p.subtotal += Number(i.subtotal); p.vat += Number(i.vat); p.total += Number(i.total);
  }
  res.json({
    invoices,
    totals: { subtotal: invoices.reduce((s, i) => s + Number(i.subtotal), 0), vat: invoices.reduce((s, i) => s + Number(i.vat), 0), total: invoices.reduce((s, i) => s + Number(i.total), 0) },
    bySupplier: byParty,
  });
});

// GET /api/reports/inventory — stock levels across all warehouses, flags items at/under reorder point
router.get('/inventory', async (req, res) => {
  const products = await prisma.product.findMany({
    where: { tenantId: req.auth!.tenantId },
    include: { balances: { include: { warehouse: true } }, category: true },
  });
  const rows = products.map((p) => {
    const total = p.balances.reduce((s, b) => s + Number(b.quantity), 0);
    return {
      sku: p.sku, nameAr: p.nameAr, nameEn: p.nameEn, category: p.category?.nameAr || null, categoryEn: p.category?.nameEn || null,
      totalQty: total, reorderPoint: Number(p.reorderPoint), lowStock: total <= Number(p.reorderPoint),
      byWarehouse: p.balances.map((b) => ({ warehouse: b.warehouse.nameAr, quantity: Number(b.quantity) })),
    };
  });
  res.json({ products: rows, lowStockCount: rows.filter((r) => r.lowStock).length });
});

// GET /api/reports/ledger/:accountCode — full movement detail for one GL account (drill-down from trial balance)
router.get('/ledger/:accountCode', async (req, res) => {
  const lines = await prisma.journalLine.findMany({
    where: { accountCode: req.params.accountCode, entry: { tenantId: req.auth!.tenantId } },
    include: { entry: true },
    orderBy: { entry: { date: 'asc' } },
  });
  let running = 0;
  const rows = lines.map((l) => {
    running += Number(l.debit) - Number(l.credit);
    return { date: l.entry.date, descAr: l.entry.descAr, debit: Number(l.debit), credit: Number(l.credit), runningBalance: running };
  });
  res.json({ accountCode: req.params.accountCode, rows, closingBalance: running });
});

// GET /api/reports/account-statement/:code?from&to — كشف حساب تفصيلي مع رصيد افتتاحي ومتحرك
router.get('/account-statement/:code', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const { from, to } = req.query as any;
  const fromD = from ? new Date(String(from)) : undefined;
  const toD = to ? new Date(String(to) + 'T23:59:59') : undefined;

  const account = await prisma.account.findUnique({ where: { tenantId_code: { tenantId, code: req.params.code } } });
  if (!account) return res.status(404).json({ error: 'الحساب غير موجود' });

  const { rows } = await buildBalances(tenantId, { from: fromD, to: toD });
  const row = rows.find((r) => r.code === account.code)!;

  const lines = await prisma.journalLine.findMany({
    where: { accountCode: account.code, entry: { tenantId, ...(fromD || toD ? { date: { ...(fromD && { gte: fromD }), ...(toD && { lte: toD }) } } : {}) } },
    include: { entry: true },
    orderBy: [{ entry: { date: 'asc' } }],
  });
  const debitNature = row.openingBalance >= 0 ? account.type === 'ASSET' || account.type === 'PURCHASES' : account.type === 'ASSET' || account.type === 'PURCHASES';
  let running = row.openingBalance;
  const movements = lines.map((l) => {
    const d = Number(l.debit), c = Number(l.credit);
    running = round2(running + (debitNature ? d - c : c - d));
    return { date: l.entry.date, number: l.entry.number, descAr: l.descAr || l.entry.descAr, kind: l.entry.kind, debit: d, credit: c, balance: running };
  });
  res.json({
    account: { code: account.code, nameAr: account.nameAr, nameEn: account.nameEn, type: account.type, subtype: account.subtype },
    openingBalance: row.openingBalance, movements,
    totals: { debit: round2(movements.reduce((s, m) => s + m.debit, 0)), credit: round2(movements.reduce((s, m) => s + m.credit, 0)) },
    closingBalance: running,
  });
});

// GET /api/reports/expenses?from&to — تقرير المصروفات مفصّلاً
router.get('/expenses', async (req, res) => {
  const { from, to } = req.query as any;
  const fromD = from ? new Date(String(from)) : new Date(new Date().getFullYear(), 0, 1);
  const toD = to ? new Date(String(to) + 'T23:59:59') : new Date();
  const { rows } = await buildBalances(req.auth!.tenantId, { from: fromD, to: toD });
  const inPeriod = rows.map((r) => ({ ...r, balance: round2(r.balance - r.openingBalance) }));
  const items = listBy(inPeriod, (r) => r.type === 'PURCHASES');
  const total = totalExpenses(inPeriod);
  res.json({ from: fromD, to: toD, total, items: items.sort((a, b) => b.amount - a.amount) });
});

// GET /api/reports/summary?from&to — ملخص تنفيذي شامل
router.get('/summary', async (req, res) => {
  const { from, to } = req.query as any;
  const fromD = from ? new Date(String(from)) : new Date(new Date().getFullYear(), 0, 1);
  const toD = to ? new Date(String(to) + 'T23:59:59') : new Date();
  const { rows } = await buildBalances(req.auth!.tenantId, { from: fromD, to: toD });
  const inPeriod = rows.map((r) => ({ ...r, balance: round2(r.balance - r.openingBalance) }));
  res.json({
    from: fromD, to: toD,
    sales: sumBy(inPeriod, (r) => r.subtype === 'SALES_REVENUE'),
    salesReturns: sumBy(inPeriod, (r) => r.subtype === 'SALES_RETURNS'),
    purchases: sumBy(inPeriod, (r) => r.subtype === 'PURCHASES_COST'),
    expenses: sumBy(inPeriod, (r) => r.subtype === 'OPERATING_EXPENSE' || r.subtype === 'DEPRECIATION'),
    netProfit: netProfitOf(inPeriod),
    cash: sumBy(rows, (r) => r.subtype === 'CASH'),
    receivables: sumBy(rows, (r) => r.code === '1103'),
    payables: sumBy(rows, (r) => r.code === '2101'),
    outputVat: sumBy(rows, (r) => r.code === '2102'),
    inputVat: sumBy(rows, (r) => r.code === '1106'),
  });
});

// GET /api/reports/dashboard?from&to — مؤشرات اللوحة والسلسلة الشهرية
router.get('/dashboard', async (req, res) => {
  try {
    const tenantId = req.auth!.tenantId;
    const { from, to } = req.query as { from?: string; to?: string };
    const fromD = from ? new Date(String(from)) : new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    const toD = to ? new Date(`${String(to)}T23:59:59.999Z`) : new Date();
    if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) {
      return res.status(400).json({ error: 'فترة غير صالحة' });
    }

    const [built, accounts, lines, saleInvoices, purchaseInvoices, entries, products] = await Promise.all([
      buildBalances(tenantId, { from: fromD, to: toD, includeClosing: false }),
      prisma.account.findMany({ where: { tenantId }, select: { code: true, nameAr: true, nameEn: true, type: true, subtype: true, isGroup: true } }),
      prisma.journalLine.findMany({
        where: { entry: { tenantId, date: { gte: fromD, lte: toD }, kind: { not: 'CLOSING' } } },
        select: { accountCode: true, debit: true, credit: true, entry: { select: { date: true } } },
      }),
      prisma.invoice.findMany({
        where: { tenantId, type: 'SALE', date: { gte: fromD, lte: toD } },
        select: { party: true, total: true },
      }),
      prisma.invoice.count({ where: { tenantId, type: 'PURCHASE', date: { gte: fromD, lte: toD } } }),
      prisma.journalEntry.count({ where: { tenantId, date: { gte: fromD, lte: toD }, kind: { not: 'CLOSING' } } }),
      prisma.product.findMany({
        where: { tenantId },
        select: { reorderPoint: true, balances: { select: { quantity: true } } },
      }),
    ]);

    const { rows } = built;
    const inPeriod = rows.map((r) => ({ ...r, balance: round2(r.balance - r.openingBalance) }));
    const sales = sumBy(inPeriod, (r) => r.subtype === 'SALES_REVENUE');
    const salesReturns = sumBy(inPeriod, (r) => r.subtype === 'SALES_RETURNS');
    const netSales = round2(sales - salesReturns);
    const purchases = sumBy(inPeriod, (r) => r.subtype === 'PURCHASES_COST');
    const purchaseReturns = sumBy(inPeriod, (r) => r.subtype === 'PURCHASE_RETURNS');
    const expenses = sumBy(inPeriod, (r) => r.subtype === 'OPERATING_EXPENSE' || r.subtype === 'DEPRECIATION');
    const netProfit = netProfitOf(inPeriod);
    const grossProfit = round2(netSales - round2(purchases - purchaseReturns));

    const byCode = new Map(accounts.map((a) => [a.code, a]));
    const buckets = new Map<string, Map<string, { d: number; c: number }>>();
    const monthStarts: { year: number; month: number }[] = [];
    for (let y = fromD.getUTCFullYear(), m = fromD.getUTCMonth(); y < toD.getUTCFullYear() || (y === toD.getUTCFullYear() && m <= toD.getUTCMonth()); ) {
      monthStarts.push({ year: y, month: m + 1 });
      buckets.set(`${y}-${m + 1}`, new Map());
      m += 1;
      if (m > 11) { m = 0; y += 1; }
      if (monthStarts.length > 36) break;
    }
    for (const line of lines) {
      const y = line.entry.date.getUTCFullYear();
      const m = line.entry.date.getUTCMonth() + 1;
      const bucket = buckets.get(`${y}-${m}`);
      if (!bucket || !byCode.has(line.accountCode)) continue;
      const cell = bucket.get(line.accountCode) || { d: 0, c: 0 };
      cell.d += Number(line.debit);
      cell.c += Number(line.credit);
      bucket.set(line.accountCode, cell);
    }

    const months = monthStarts.map(({ year, month }) => {
      const bucket = buckets.get(`${year}-${month}`)!;
      const monthRows: BalanceRow[] = [];
      for (const [code, cell] of bucket) {
        const acc = byCode.get(code)!;
        const sign = isDebitNature(acc.type, acc.subtype) ? 1 : -1;
        monthRows.push({
          code, nameAr: acc.nameAr, nameEn: acc.nameEn, type: acc.type, subtype: acc.subtype, isGroup: acc.isGroup,
          debit: round2(cell.d), credit: round2(cell.c), balance: round2((cell.d - cell.c) * sign),
          openingDebit: 0, openingCredit: 0, openingBalance: 0,
        });
      }
      const monthSales = sumBy(monthRows, (r) => r.subtype === 'SALES_REVENUE');
      const monthReturns = sumBy(monthRows, (r) => r.subtype === 'SALES_RETURNS');
      return {
        year, month,
        sales: round2(monthSales - monthReturns),
        purchases: sumBy(monthRows, (r) => r.subtype === 'PURCHASES_COST'),
        expenses: sumBy(monthRows, (r) => r.subtype === 'OPERATING_EXPENSE' || r.subtype === 'DEPRECIATION'),
        profit: netProfitOf(monthRows),
      };
    });

    const cursor = toD.getUTCFullYear() * 12 + toD.getUTCMonth() + 1;
    const thisMonth = months.find((m) => m.year * 12 + m.month === cursor);
    const prev = months.find((m) => m.year * 12 + m.month === cursor - 1);
    const customers = new Map<string, { total: number; count: number }>();
    for (const inv of saleInvoices) {
      const name = inv.party?.trim() || '—';
      const row = customers.get(name) || { total: 0, count: 0 };
      row.total += Number(inv.total);
      row.count += 1;
      customers.set(name, row);
    }
    let lowStock = 0;
    for (const product of products) {
      const qty = product.balances.reduce((s, b) => s + Number(b.quantity), 0);
      if (Number(product.reorderPoint) > 0 && qty <= Number(product.reorderPoint)) lowStock += 1;
    }

    res.json({
      from: fromD, to: toD,
      sales, salesReturns, netSales, purchases, expenses, netProfit, grossProfit,
      margin: netSales ? round2((netProfit / netSales) * 100) : 0,
      grossMargin: netSales ? round2((grossProfit / netSales) * 100) : 0,
      cash: sumBy(rows, (r) => r.subtype === 'CASH'),
      receivables: sumBy(rows, (r) => r.code === '1103'),
      payables: sumBy(rows, (r) => r.code === '2101'),
      outputVat: sumBy(rows, (r) => r.code === '2102'),
      inputVat: sumBy(rows, (r) => r.code === '1106'),
      months,
      compare: {
        sales: thisMonth?.sales || 0,
        prevSales: prev?.sales || 0,
        profit: thisMonth?.profit || 0,
        prevProfit: prev?.profit || 0,
      },
      expensesTop: listBy(inPeriod, (r) => r.subtype === 'OPERATING_EXPENSE' || r.subtype === 'DEPRECIATION')
        .sort((a, b) => b.amount - a.amount).slice(0, 6),
      customers: [...customers.entries()]
        .map(([name, v]) => ({ name, total: round2(v.total), count: v.count }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 6),
      counts: {
        salesInvoices: saleInvoices.length,
        purchaseInvoices,
        entries,
        products: products.length,
        lowStock,
      },
    });
  } catch (e) {
    console.error('dashboard', e);
    if (!res.headersSent) res.status(500).json({ error: 'تعذّر تجهيز لوحة التحكم' });
  }
});

export default router;
