import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';

const router = Router();
router.use(requireAuth);

// ---- Categories ----
router.get('/categories', async (req, res) => {
  res.json(await prisma.productCategory.findMany({ where: { tenantId: req.auth!.tenantId } }));
});
router.post('/categories', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const { nameAr, nameEn } = req.body;
  if (!nameAr) return res.status(400).json({ error: 'أدخل اسم التصنيف' });
  res.status(201).json(await prisma.productCategory.create({ data: { tenantId: req.auth!.tenantId, nameAr, nameEn } }));
});

// ---- Units of measure ----
router.get('/units', async (req, res) => {
  res.json(await prisma.unit.findMany({ where: { tenantId: req.auth!.tenantId } }));
});
router.post('/units', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const { nameAr, nameEn } = req.body;
  if (!nameAr) return res.status(400).json({ error: 'أدخل اسم الوحدة' });
  res.status(201).json(await prisma.unit.create({ data: { tenantId: req.auth!.tenantId, nameAr, nameEn } }));
});

// ---- Warehouses ----
router.get('/warehouses', async (req, res) => {
  res.json(await prisma.warehouse.findMany({ where: { tenantId: req.auth!.tenantId }, include: { branch: true } }));
});
router.post('/warehouses', requireRole('ADMIN'), async (req, res) => {
  const { nameAr, nameEn, branchId } = req.body;
  if (!nameAr || !branchId) return res.status(400).json({ error: 'أدخل اسم المستودع واختر الفرع' });
  res.status(201).json(await prisma.warehouse.create({ data: { tenantId: req.auth!.tenantId, nameAr, nameEn, branchId } }));
});

// ---- Products ----
router.get('/products', async (req, res) => {
  const products = await prisma.product.findMany({
    where: { tenantId: req.auth!.tenantId },
    include: { category: true, unit: true, balances: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(products);
});

router.post('/products', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const { sku, nameAr, nameEn, categoryId, unitId, costPrice, sellPrice, reorderPoint } = req.body;
  if (!sku || !nameAr) return res.status(400).json({ error: 'أدخل رمز الصنف (SKU) واسمه' });

  const exists = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId: req.auth!.tenantId, sku } } });
  if (exists) return res.status(409).json({ error: 'رمز الصنف مستخدم مسبقاً' });

  const product = await prisma.product.create({
    data: {
      tenantId: req.auth!.tenantId, sku, nameAr, nameEn, categoryId: categoryId || null, unitId: unitId || null,
      costPrice: costPrice || 0, sellPrice: sellPrice || 0, reorderPoint: reorderPoint || 0,
    },
  });
  res.status(201).json(product);
});

function priceOf(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

router.patch('/products/:id', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const current = await prisma.product.findFirst({ where: { id: req.params.id, tenantId } });
  if (!current) return res.status(404).json({ error: 'الصنف غير موجود' });
  const { sku, nameAr, categoryId, unitId, costPrice, sellPrice, reorderPoint } = req.body;
  const nextSku = String(sku || '').trim();
  const nextName = String(nameAr || '').trim();
  if (!nextSku || !nextName) return res.status(400).json({ error: 'أدخل رمز الصنف واسمه' });
  const cost = priceOf(costPrice);
  const sell = priceOf(sellPrice);
  const reorder = priceOf(reorderPoint);
  if (cost === null || sell === null || reorder === null) return res.status(400).json({ error: 'أدخل سعراً صحيحاً' });
  if (nextSku !== current.sku) {
    const exists = await prisma.product.findUnique({ where: { tenantId_sku: { tenantId, sku: nextSku } } });
    if (exists) return res.status(409).json({ error: 'رمز الصنف مستخدم مسبقاً' });
  }
  const product = await prisma.product.update({
    where: { id: current.id },
    data: {
      sku: nextSku, nameAr: nextName,
      categoryId: categoryId || null, unitId: unitId || null,
      costPrice: cost, sellPrice: sell, reorderPoint: reorder,
    },
  });
  res.json(product);
});

export default router;
