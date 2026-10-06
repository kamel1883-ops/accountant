import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { assertCenter, tag } from '../../utils/costCenter';
import { splitAmounts } from '../../utils/costCenterMath';

const router = Router();
router.use(requireAuth);

// ---- Treasuries (الخزائن والحسابات البنكية) ----
router.get('/treasuries', async (req, res) => {
  res.json(await prisma.treasury.findMany({ where: { tenantId: req.auth!.tenantId } }));
});

router.post('/treasuries', requireRole('ADMIN'), async (req, res) => {
  const { nameAr, nameEn, type, accountCode } = req.body;
  if (!nameAr || !type || !accountCode) return res.status(400).json({ error: 'أدخل الاسم والنوع وحساب الأستاذ المرتبط' });
  const treasury = await prisma.treasury.create({ data: { tenantId: req.auth!.tenantId, nameAr, nameEn, type, accountCode } });
  res.status(201).json(treasury);
});

// GET /api/finance/treasuries/:id/balance — live balance from journal lines on its GL account
router.get('/treasuries/:id/balance', async (req, res) => {
  const treasury = await prisma.treasury.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!treasury) return res.status(404).json({ error: 'الخزينة غير موجودة' });
  const lines = await prisma.journalLine.findMany({ where: { accountCode: treasury.accountCode, entry: { tenantId: req.auth!.tenantId } } });
  const balance = lines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
  res.json({ treasury, balance });
});

// ---- Vouchers (سندات القبض والصرف) ----
router.get('/vouchers', async (req, res) => {
  res.json(await prisma.voucher.findMany({ where: { tenantId: req.auth!.tenantId }, include: { treasury: true }, orderBy: { date: 'desc' } }));
});

// POST /api/finance/vouchers — { treasuryId, type: 'RECEIPT'|'PAYMENT', party, amount, counterAccountCode, descAr, date }
// A receipt debits the treasury's GL account and credits the counter account (e.g. a customer).
// A payment credits the treasury's GL account and debits the counter account (e.g. an expense/supplier).
router.post('/vouchers', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const { treasuryId, type, party, amount, counterAccountCode, descAr, date, costCenterId, allocations } = req.body;
  if (!treasuryId || !type || !party || !amount || amount <= 0 || !counterAccountCode) {
    return res.status(400).json({ error: 'أكمل جميع حقول السند' });
  }
  const treasury = await prisma.treasury.findFirst({ where: { id: treasuryId, tenantId: req.auth!.tenantId } });
  if (!treasury) return res.status(404).json({ error: 'الخزينة غير موجودة' });
  const account = await prisma.account.findFirst({ where: { tenantId: req.auth!.tenantId, code: counterAccountCode } });
  const pnl = account && (account.type === 'SALES' || account.type === 'PURCHASES');
  let centerId: string | null = null;
  let parts: { costCenterId: string; amount: number }[] | null = null;
  try {
    if (Array.isArray(allocations) && allocations.length) {
      const owned = await prisma.costCenter.count({ where: { tenantId: req.auth!.tenantId, id: { in: allocations.map((a: { costCenterId: string }) => a.costCenterId) }, status: 'ACTIVE' } });
      if (owned !== allocations.length) {
        const error = new Error('أحد مراكز التوزيع غير موجود أو موقوف') as Error & { status?: number };
        error.status = 400;
        throw error;
      }
      parts = splitAmounts(Number(amount), allocations);
    } else if (pnl) {
      centerId = await assertCenter(req.auth!.tenantId, costCenterId);
    } else if (costCenterId) {
      centerId = await assertCenter(req.auth!.tenantId, costCenterId);
    }
  } catch (error) {
    return res.status((error as { status?: number }).status || 400).json({ error: (error as Error).message });
  }

  const result = await prisma.$transaction(async (tx) => {
    const voucher = await tx.voucher.create({
      data: { tenantId: req.auth!.tenantId, treasuryId, type, party, amount, counterAccountCode, costCenterId: centerId, descAr: descAr || (type === 'RECEIPT' ? `سند قبض من ${party}` : `سند صرف إلى ${party}`), date: new Date(date || Date.now()) },
    });
    const lines = parts
      ? parts.flatMap((p) => (type === 'RECEIPT'
        ? [{ accountCode: treasury.accountCode, debit: p.amount, credit: 0, costCenterId: p.costCenterId }, { accountCode: counterAccountCode, debit: 0, credit: p.amount, costCenterId: p.costCenterId }]
        : [{ accountCode: counterAccountCode, debit: p.amount, credit: 0, costCenterId: p.costCenterId }, { accountCode: treasury.accountCode, debit: 0, credit: p.amount, costCenterId: p.costCenterId }]))
      : tag(
        type === 'RECEIPT'
          ? [{ accountCode: treasury.accountCode, debit: amount, credit: 0 }, { accountCode: counterAccountCode, debit: 0, credit: amount }]
          : [{ accountCode: counterAccountCode, debit: amount, credit: 0 }, { accountCode: treasury.accountCode, debit: 0, credit: amount }],
        centerId,
      );
    await tx.journalEntry.create({
      data: {
        tenantId: req.auth!.tenantId, date: new Date(date || Date.now()),
        descAr: voucher.descAr, isAuto: true, sourceRef: `voucher:${voucher.id}`,
        lines: { create: lines },
      },
    });
    return voucher;
  });
  res.status(201).json(result);
});

export default router;
