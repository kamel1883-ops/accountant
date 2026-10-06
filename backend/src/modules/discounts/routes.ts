import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';

const router = Router();
router.use(requireAuth);

function normalizeCode(value: unknown) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function asPercent(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

// POST /api/sale-discounts/preview { code } — للمحاسب عند البيع، من غير كشف قائمة الأكواد
router.post('/preview', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const code = normalizeCode(req.body?.code);
  if (!code) return res.json({ code: '', percent: 0 });
  const row = await prisma.saleDiscountCode.findFirst({ where: { tenantId: req.auth!.tenantId, code, active: true } });
  if (!row) return res.status(400).json({ error: 'كود الخصم غير صحيح أو موقوف' });
  res.json({ code: row.code, percent: Number(row.percent) });
});

router.get('/', requireRole('ADMIN'), async (req, res) => {
  const rows = await prisma.saleDiscountCode.findMany({ where: { tenantId: req.auth!.tenantId }, orderBy: { createdAt: 'desc' } });
  res.json(rows.map((c) => ({ ...c, percent: Number(c.percent) })));
});

router.post('/', requireRole('ADMIN'), async (req, res) => {
  const code = normalizeCode(req.body?.code);
  const percent = asPercent(req.body?.percent);
  if (!code || code.length > 32) return res.status(400).json({ error: 'اكتب كود الخصم' });
  if (percent == null) return res.status(400).json({ error: 'نسبة الخصم بين 1 و 100' });
  const exists = await prisma.saleDiscountCode.findFirst({ where: { tenantId: req.auth!.tenantId, code } });
  if (exists) return res.status(409).json({ error: 'هذا الكود موجود مسبقاً' });
  const created = await prisma.saleDiscountCode.create({
    data: { tenantId: req.auth!.tenantId, code, percent, note: String(req.body?.note || '').trim() || null },
  });
  res.status(201).json({ ...created, percent: Number(created.percent) });
});

router.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const row = await prisma.saleDiscountCode.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!row) return res.status(404).json({ error: 'الكود غير موجود' });
  const data: { active?: boolean; percent?: number; note?: string | null } = {};
  if (req.body?.active !== undefined) data.active = !!req.body.active;
  if (req.body?.percent !== undefined) {
    const percent = asPercent(req.body.percent);
    if (percent == null) return res.status(400).json({ error: 'نسبة الخصم بين 1 و 100' });
    data.percent = percent;
  }
  if (req.body?.note !== undefined) data.note = String(req.body.note || '').trim() || null;
  const updated = await prisma.saleDiscountCode.update({ where: { id: row.id }, data });
  res.json({ ...updated, percent: Number(updated.percent) });
});

router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const row = await prisma.saleDiscountCode.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!row) return res.status(404).json({ error: 'الكود غير موجود' });
  await prisma.saleDiscountCode.delete({ where: { id: row.id } });
  res.json({ ok: true });
});

export default router;
