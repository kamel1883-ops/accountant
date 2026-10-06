import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';

const router = Router();
router.use(requireAuth);

// GET /api/stock/balances?warehouseId=... — on-hand quantities
router.get('/balances', async (req, res) => {
  const { warehouseId } = req.query;
  const balances = await prisma.stockBalance.findMany({
    where: { warehouse: { tenantId: req.auth!.tenantId }, ...(warehouseId ? { warehouseId: String(warehouseId) } : {}) },
    include: { product: true, warehouse: true },
  });
  res.json(balances);
});

// Applies a movement + keeps StockBalance in sync in one transaction.
async function applyMovement(tenantId: string, data: { productId: string; warehouseId: string; type: 'IN' | 'OUT' | 'COUNT_ADJUST'; quantity: number; reason?: string; sourceRef?: string }) {
  return prisma.$transaction(async (tx) => {
    const movement = await tx.stockMovement.create({ data: { tenantId, ...data } });
    const delta = data.type === 'OUT' ? -data.quantity : data.quantity;
    await tx.stockBalance.upsert({
      where: { productId_warehouseId: { productId: data.productId, warehouseId: data.warehouseId } },
      update: { quantity: { increment: delta } },
      create: { productId: data.productId, warehouseId: data.warehouseId, quantity: delta },
    });
    return movement;
  });
}

// POST /api/stock/movements — manual IN/OUT adjustment { productId, warehouseId, type, quantity, reason }
router.post('/movements', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const { productId, warehouseId, type, quantity, reason } = req.body;
  if (!productId || !warehouseId || !['IN', 'OUT'].includes(type) || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'تحقق من الصنف والمستودع والكمية' });
  }
  const movement = await applyMovement(req.auth!.tenantId, { productId, warehouseId, type, quantity, reason });
  res.status(201).json(movement);
});

// ---- Stock count (جرد المخزون) ----

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function countDate(raw: unknown) {
  const s = String(raw || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date();
  return new Date(`${s}T00:00:00.000Z`);
}

function shapeLine(line: { id: string; warehouseId: string; productId: string; expectedQty: unknown; countedQty: unknown }, product?: { sku: string; nameAr: string; nameEn: string | null; category?: { nameAr: string; nameEn: string | null } | null }) {
  const expectedQty = Number(line.expectedQty);
  const countedQty = line.countedQty == null ? null : Number(line.countedQty);
  return {
    id: line.id,
    warehouseId: line.warehouseId,
    productId: line.productId,
    sku: product?.sku || '',
    nameAr: product?.nameAr || '',
    nameEn: product?.nameEn || '',
    categoryAr: product?.category?.nameAr || '',
    categoryEn: product?.category?.nameEn || '',
    expectedQty,
    countedQty,
    variance: countedQty == null ? null : round3(countedQty - expectedQty),
  };
}

async function presentCount(id: string, tenantId: string) {
  const count = await prisma.stockCount.findFirst({
    where: { id, tenantId },
    include: { lines: true },
  });
  if (!count) return null;
  const scope = count.warehouseIds.length ? count.warehouseIds : [count.warehouseId];
  const warehouses = await prisma.warehouse.findMany({
    where: { tenantId, id: { in: scope } },
    select: { id: true, nameAr: true, nameEn: true },
  });
  const whById = Object.fromEntries(warehouses.map((w) => [w.id, w]));
  const products = await prisma.product.findMany({
    where: { tenantId, id: { in: count.lines.map((l) => l.productId) } },
    select: { id: true, sku: true, nameAr: true, nameEn: true, category: { select: { nameAr: true, nameEn: true } } },
  });
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const lines = count.lines.map((l) => shapeLine(l, byId[l.productId]));
  const sections = scope.map((warehouseId) => {
    const sectionLines = lines
      .filter((l) => l.warehouseId === warehouseId)
      .sort((a, b) => (a.categoryAr || '').localeCompare(b.categoryAr || '', 'ar') || a.sku.localeCompare(b.sku) || a.nameAr.localeCompare(b.nameAr, 'ar'));
    return {
      warehouse: whById[warehouseId] || { id: warehouseId, nameAr: '', nameEn: '' },
      items: sectionLines.length,
      systemQty: round3(sectionLines.reduce((sum, l) => sum + l.expectedQty, 0)),
      lines: sectionLines,
    };
  });
  return {
    id: count.id,
    status: count.status,
    countedOn: count.countedOn,
    createdAt: count.createdAt,
    submittedAt: count.submittedAt,
    warehouses: sections.map((s) => s.warehouse),
    sections,
    lines,
  };
}

router.get('/counts', async (req, res) => {
  const rows = await prisma.stockCount.findMany({
    where: { tenantId: req.auth!.tenantId },
    orderBy: { createdAt: 'desc' },
    include: { lines: { select: { expectedQty: true, countedQty: true } } },
  });
  if (!rows.length) return res.json([]);
  const scopeIds = [...new Set(rows.flatMap((r) => (r.warehouseIds.length ? r.warehouseIds : [r.warehouseId])))];
  const warehouses = await prisma.warehouse.findMany({
    where: { tenantId: req.auth!.tenantId, id: { in: scopeIds } },
    select: { id: true, nameAr: true, nameEn: true },
  });
  const wh = Object.fromEntries(warehouses.map((w) => [w.id, w]));
  res.json(rows.map((row) => {
    let matched = 0;
    let over = 0;
    let short = 0;
    let pending = 0;
    for (const line of row.lines) {
      if (line.countedQty == null) { pending += 1; continue; }
      const variance = Number(line.countedQty) - Number(line.expectedQty);
      if (variance > 0) over += 1;
      else if (variance < 0) short += 1;
      else matched += 1;
    }
    const ids = row.warehouseIds.length ? row.warehouseIds : [row.warehouseId];
    return {
      id: row.id,
      status: row.status,
      countedOn: row.countedOn,
      createdAt: row.createdAt,
      submittedAt: row.submittedAt,
      warehouses: ids.map((id) => wh[id] || { id, nameAr: '', nameEn: '' }),
      items: row.lines.length,
      matched,
      over,
      short,
      pending,
    };
  }));
});

router.post('/counts', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const mode = req.body.mode === 'branch' ? 'branch' : 'warehouse';
  const all = await prisma.warehouse.findMany({
    where: { tenantId },
    select: { id: true, branchId: true },
    orderBy: { nameAr: 'asc' },
  });
  let ids: string[] = [];
  if (mode === 'branch') {
    const branches = await prisma.branch.findMany({ where: { tenantId }, select: { id: true } });
    const requested: string[] = Array.isArray(req.body.branchIds) ? req.body.branchIds.map((id: unknown) => String(id)) : [];
    const branchIds = [...new Set<string>(req.body.all ? branches.map((b) => b.id) : requested)].filter((id) => branches.some((b) => b.id === id));
    if (!branchIds.length) return res.status(400).json({ error: 'اختر فرعاً واحداً على الأقل' });
    ids = all.filter((w) => branchIds.includes(w.branchId)).map((w) => w.id);
    if (!ids.length) return res.status(400).json({ error: 'لا توجد مستودعات داخل الفروع المختارة' });
  } else {
    const requested: string[] = Array.isArray(req.body.warehouseIds) ? req.body.warehouseIds.map((id: unknown) => String(id)) : [];
    ids = [...new Set<string>(req.body.all ? all.map((w) => w.id) : requested)].filter((id) => all.some((w) => w.id === id));
    if (!ids.length) return res.status(400).json({ error: 'اختر مستودعاً واحداً على الأقل' });
  }

  const balances = (await prisma.stockBalance.findMany({
    where: { warehouseId: { in: ids }, warehouse: { tenantId } },
    select: { warehouseId: true, productId: true, quantity: true },
  })).filter((b) => Number(b.quantity) !== 0);
  if (!balances.length) return res.status(400).json({ error: 'لا توجد أصناف بكمية داخل المستودعات المختارة' });

  const count = await prisma.stockCount.create({
    data: {
      tenantId,
      warehouseId: ids[0],
      warehouseIds: ids,
      countedOn: countDate(req.body.countedOn),
      lines: {
        create: balances.map((b) => ({
          warehouseId: b.warehouseId,
          productId: b.productId,
          expectedQty: b.quantity,
        })),
      },
    },
  });
  res.status(201).json(await presentCount(count.id, tenantId));
});

router.get('/counts/:id', async (req, res) => {
  const count = await presentCount(req.params.id, req.auth!.tenantId);
  if (!count) return res.status(404).json({ error: 'الجرد غير موجود' });
  res.json(count);
});

router.patch('/counts/:id/lines/:lineId', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const count = await prisma.stockCount.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!count) return res.status(404).json({ error: 'الجرد غير موجود' });
  if (count.status === 'SUBMITTED') return res.status(409).json({ error: 'تم اعتماد هذا الجرد مسبقاً' });
  const qty = Number(req.body.countedQty);
  if (!Number.isFinite(qty) || qty < 0) return res.status(400).json({ error: 'أدخل كمية فعلية صحيحة' });
  const line = await prisma.stockCountLine.findFirst({ where: { id: req.params.lineId, countId: count.id } });
  if (!line) return res.status(404).json({ error: 'سطر الجرد غير موجود' });
  const saved = await prisma.stockCountLine.update({ where: { id: line.id }, data: { countedQty: qty } });
  const expectedQty = Number(saved.expectedQty);
  const countedQty = Number(saved.countedQty);
  res.json({ id: saved.id, expectedQty, countedQty, variance: round3(countedQty - expectedQty) });
});

router.post('/counts/:id/submit', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const count = await prisma.stockCount.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId }, include: { lines: true } });
  if (!count) return res.status(404).json({ error: 'الجرد غير موجود' });
  if (count.status === 'SUBMITTED') return res.status(409).json({ error: 'تم اعتماد هذا الجرد مسبقاً' });
  const filled = count.lines.filter((l) => l.countedQty != null);
  if (!filled.length) return res.status(400).json({ error: 'سجّل الكمية الفعلية لصنف واحد على الأقل قبل الاعتماد' });

  for (const line of filled) {
    const variance = Number(line.countedQty) - Number(line.expectedQty);
    if (variance === 0) continue;
    await applyMovement(req.auth!.tenantId, {
      productId: line.productId,
      warehouseId: line.warehouseId,
      type: variance > 0 ? 'IN' : 'OUT',
      quantity: Math.abs(variance),
      reason: 'تسوية جرد',
      sourceRef: `count:${count.id}`,
    });
  }
  await prisma.stockCount.update({ where: { id: count.id }, data: { status: 'SUBMITTED', submittedAt: new Date() } });
  res.json(await presentCount(count.id, req.auth!.tenantId));
});

export default router;
