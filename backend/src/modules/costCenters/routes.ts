import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { incomeRows, round2, splitAmounts } from '../../utils/costCenterMath';

const router = Router();
router.use(requireAuth);

const TYPES = ['BRANCH', 'DEPARTMENT', 'PROJECT', 'CHANNEL', 'WAREHOUSE', 'SUPPORT'];

async function used(tenantId: string, id: string) {
  const [lines, sales, purchases, vouchers] = await Promise.all([
    prisma.journalLine.count({ where: { costCenterId: id, entry: { tenantId } } }),
    prisma.salesDoc.count({ where: { tenantId, costCenterId: id } }),
    prisma.purchaseDoc.count({ where: { tenantId, costCenterId: id } }),
    prisma.voucher.count({ where: { tenantId, costCenterId: id } }),
  ]);
  return lines + sales + purchases + vouchers > 0;
}

router.get('/', async (req, res) => {
  const rows = await prisma.costCenter.findMany({
    where: { tenantId: req.auth!.tenantId },
    orderBy: { code: 'asc' },
  });
  res.json(rows);
});

router.post('/', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const { code, nameAr, nameEn, type, parentId, managerName, address, phone, defaultWarehouseId, defaultCashAccountCode, startDate, notes } = req.body;
  if (!code || !nameAr) return res.status(400).json({ error: 'أدخل كود مركز التكلفة واسمه' });
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'نوع مركز التكلفة غير معروف' });
  const exists = await prisma.costCenter.findUnique({ where: { tenantId_code: { tenantId, code: String(code).trim() } } });
  if (exists) return res.status(409).json({ error: 'كود مركز التكلفة مستخدم مسبقاً' });
  if (parentId) {
    const parent = await prisma.costCenter.findFirst({ where: { id: parentId, tenantId } });
    if (!parent) return res.status(400).json({ error: 'المركز الرئيسي غير موجود' });
  }
  const row = await prisma.costCenter.create({
    data: {
      tenantId, code: String(code).trim(), nameAr: String(nameAr).trim(), nameEn: nameEn || null,
      type, parentId: parentId || null, managerName: managerName || null, address: address || null, phone: phone || null,
      defaultWarehouseId: defaultWarehouseId || null, defaultCashAccountCode: defaultCashAccountCode || null,
      startDate: startDate ? new Date(startDate) : new Date(), notes: notes || null,
    },
  });
  await prisma.auditLog.create({ data: { tenantId, userId: req.auth!.userId, action: 'costCenter.create', resource: row.id, result: row.code } });
  res.status(201).json(row);
});

router.patch('/:id', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const current = await prisma.costCenter.findFirst({ where: { id: req.params.id, tenantId } });
  if (!current) return res.status(404).json({ error: 'مركز التكلفة غير موجود' });
  const data: any = {};
  for (const key of ['nameAr', 'nameEn', 'managerName', 'address', 'phone', 'defaultWarehouseId', 'defaultCashAccountCode', 'notes', 'type'] as const) {
    if (req.body[key] !== undefined) data[key] = req.body[key] || null;
  }
  if (req.body.type && !TYPES.includes(req.body.type)) return res.status(400).json({ error: 'نوع مركز التكلفة غير معروف' });
  if (req.body.parentId !== undefined) {
    if (req.body.parentId === current.id) return res.status(400).json({ error: 'لا يمكن أن يكون المركز أباً لنفسه' });
    data.parentId = req.body.parentId || null;
  }
  const row = await prisma.costCenter.update({ where: { id: current.id }, data });
  await prisma.auditLog.create({ data: { tenantId, userId: req.auth!.userId, action: 'costCenter.update', resource: row.id, result: `${current.nameAr} -> ${row.nameAr}` } });
  res.json(row);
});

router.post('/:id/stop', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const current = await prisma.costCenter.findFirst({ where: { id: req.params.id, tenantId } });
  if (!current) return res.status(404).json({ error: 'مركز التكلفة غير موجود' });
  const row = await prisma.costCenter.update({ where: { id: current.id }, data: { status: 'STOPPED', endDate: new Date() } });
  await prisma.auditLog.create({ data: { tenantId, userId: req.auth!.userId, action: 'costCenter.stop', resource: row.id, result: row.code } });
  res.json(row);
});

router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const current = await prisma.costCenter.findFirst({ where: { id: req.params.id, tenantId } });
  if (!current) return res.status(404).json({ error: 'مركز التكلفة غير موجود' });
  if (await used(tenantId, current.id)) return res.status(409).json({ error: 'مركز سبق استخدامه لا يُحذف. أوقفه فقط.' });
  await prisma.costCenter.delete({ where: { id: current.id } });
  res.json({ message: 'تم الحذف' });
});

function range(req: any) {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date('2000-01-01');
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59`) : new Date('2999-12-31');
  return { from, to };
}

router.get('/reports/income', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const { from, to } = range(req);
  const [lines, centers, sales] = await Promise.all([
    prisma.journalLine.findMany({
      where: { entry: { tenantId, date: { gte: from, lte: to } } },
      select: { costCenterId: true, accountCode: true, debit: true, credit: true },
    }),
    prisma.costCenter.findMany({ where: { tenantId }, select: { id: true, code: true, nameAr: true, nameEn: true, type: true, status: true } }),
    prisma.salesDoc.findMany({
      where: { tenantId, status: 'CONFIRMED', type: 'INVOICE', date: { gte: from, lte: to } },
      select: { costCenterId: true, total: true },
    }),
  ]);
  const accounts = await prisma.account.findMany({ where: { tenantId }, select: { code: true, subtype: true, type: true } });
  const meta = new Map(accounts.map((a) => [a.code, a]));
  const shaped = lines
    .map((l) => ({ centerId: l.costCenterId, accountCode: l.accountCode, subtype: meta.get(l.accountCode)?.subtype || null, type: meta.get(l.accountCode)?.type, debit: Number(l.debit), credit: Number(l.credit) }))
    .filter((l) => l.type === 'SALES' || l.type === 'PURCHASES');
  const rows = incomeRows(shaped);
  const names = new Map(centers.map((c) => [c.id, c]));
  const counts = new Map<string, { n: number; total: number }>();
  for (const s of sales) {
    const key = s.costCenterId || '';
    const cur = counts.get(key) || { n: 0, total: 0 };
    cur.n += 1;
    cur.total = round2(cur.total + Number(s.total));
    counts.set(key, cur);
  }
  const out = rows.map((r) => {
    const c = r.centerId ? names.get(r.centerId) : null;
    const count = counts.get(r.centerId || '') || { n: 0, total: 0 };
    return {
      ...r,
      code: c?.code || '',
      nameAr: c?.nameAr || 'غير محدد',
      nameEn: c?.nameEn || 'Unassigned',
      invoices: count.n,
      averageInvoice: count.n ? round2(r.netSales / count.n) : 0,
    };
  });
  const profit = round2(out.reduce((s, r) => s + r.profit, 0));
  res.json({ from, to, rows: out, profit });
});

router.get('/reports/trial', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const { from, to } = range(req);
  const centerId = String(req.query.costCenterId || '');
  const lines = await prisma.journalLine.findMany({
    where: {
      ...(centerId ? { costCenterId: centerId } : {}),
      entry: { tenantId, date: { gte: from, lte: to } },
    },
    select: { accountCode: true, debit: true, credit: true },
  });
  const accounts = await prisma.account.findMany({ where: { tenantId, isGroup: false }, select: { code: true, nameAr: true, nameEn: true } });
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const l of lines) {
    const cur = totals.get(l.accountCode) || { debit: 0, credit: 0 };
    cur.debit = round2(cur.debit + Number(l.debit));
    cur.credit = round2(cur.credit + Number(l.credit));
    totals.set(l.accountCode, cur);
  }
  const rows = accounts
    .map((a) => ({ ...a, debit: totals.get(a.code)?.debit || 0, credit: totals.get(a.code)?.credit || 0 }))
    .filter((r) => r.debit || r.credit);
  const debit = round2(rows.reduce((s, r) => s + r.debit, 0));
  const credit = round2(rows.reduce((s, r) => s + r.credit, 0));
  res.json({ rows, debit, credit, balanced: Math.abs(debit - credit) < 0.05, unified: !centerId });
});

router.get('/reports/ledger', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const centerId = String(req.query.costCenterId || '');
  if (!centerId) return res.status(400).json({ error: 'اختر مركز التكلفة' });
  const { from, to } = range(req);
  const lines = await prisma.journalLine.findMany({
    where: { costCenterId: centerId, entry: { tenantId, date: { gte: from, lte: to } } },
    include: { entry: { select: { id: true, date: true, number: true, descAr: true, sourceRef: true } } },
    orderBy: { entry: { date: 'asc' } },
    take: 500,
  });
  res.json(lines.map((l) => ({
    date: l.entry.date, number: l.entry.number, descAr: l.descAr || l.entry.descAr, accountCode: l.accountCode,
    debit: Number(l.debit), credit: Number(l.credit), sourceRef: l.entry.sourceRef, entryId: l.entry.id,
  })));
});

router.get('/rules', async (req, res) => {
  res.json(await prisma.allocationRule.findMany({
    where: { tenantId: req.auth!.tenantId },
    include: { lines: true },
    orderBy: { code: 'asc' },
  }));
});

router.post('/rules', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const { code, nameAr, lines } = req.body as { code: string; nameAr: string; lines: { costCenterId: string; percentage: number }[] };
  if (!code || !nameAr || !Array.isArray(lines) || lines.length < 2) return res.status(400).json({ error: 'أدخل اسم القاعدة ومركزَين على الأقل' });
  const owned = await prisma.costCenter.count({ where: { tenantId, id: { in: lines.map((l) => l.costCenterId) }, status: 'ACTIVE' } });
  if (owned !== lines.length) return res.status(400).json({ error: 'أحد مراكز التوزيع غير موجود أو موقوف' });
  try { splitAmounts(100, lines); }
  catch (error) { return res.status((error as { status?: number }).status || 400).json({ error: (error as Error).message }); }
  const row = await prisma.allocationRule.create({
    data: {
      tenantId, code: String(code).trim(), nameAr: String(nameAr).trim(),
      lines: { create: lines.map((l) => ({ costCenterId: l.costCenterId, percentage: l.percentage })) },
    },
    include: { lines: true },
  });
  res.status(201).json(row);
});

export default router;
