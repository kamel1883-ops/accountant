import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth } from '../../middleware/auth';
import { quarterOf } from '../../utils/vatCalculator';

const router = Router();
router.use(requireAuth);

// GET /api/vat/return?year=2026&quarter=3
router.get('/return', async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const quarter = Number(req.query.quarter) || quarterOf(new Date());

  const invoices = await prisma.invoice.findMany({
    where: { tenantId: req.auth!.tenantId, date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } },
  });
  const inQuarter = invoices.filter((i) => quarterOf(i.date) === quarter);

  const sales = inQuarter.filter((i) => i.type === 'SALE');
  const credits = inQuarter.filter((i) => i.type === 'CREDIT_NOTE');
  const purchases = inQuarter.filter((i) => i.type === 'PURCHASE');
  const outputBase = sales.reduce((s, i) => s + Number(i.subtotal), 0) - credits.reduce((s, i) => s + Number(i.subtotal), 0);
  const outputVat = sales.reduce((s, i) => s + Number(i.vat), 0) - credits.reduce((s, i) => s + Number(i.vat), 0);
  const inputBase = purchases.reduce((s, i) => s + Number(i.subtotal), 0);
  const inputVat = purchases.reduce((s, i) => s + Number(i.vat), 0);
  const net = outputVat - inputVat;

  res.json({
    year, quarter,
    outputBase, outputVat, inputBase, inputVat,
    netVat: net,
    status: net >= 0 ? 'مستحق للهيئة' : 'قابل للاسترداد',
  });
});

export default router;
