import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { buildBalances, netProfitOf, round2, validateEntryLines, nextEntryNumber, totalRevenue, totalExpenses } from '../../utils/accounting';
import { SYS } from '../../utils/seedAccounts';

const router = Router();
router.use(requireAuth);

/* ===================== السنوات المالية ===================== */
router.get('/years', async (req, res) => {
  res.json(await prisma.fiscalYear.findMany({ where: { tenantId: req.auth!.tenantId }, orderBy: { startDate: 'desc' } }));
});

// POST /api/periods/years { name, startDate, endDate }
router.post('/years', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const { name, startDate, endDate } = req.body;
  if (!name || !startDate || !endDate) return res.status(400).json({ error: 'أدخل اسم السنة وتاريخي البداية والنهاية' });
  if (new Date(startDate) >= new Date(endDate)) return res.status(400).json({ error: 'تاريخ البداية يجب أن يسبق تاريخ النهاية' });
  const exists = await prisma.fiscalYear.findFirst({ where: { tenantId: req.auth!.tenantId, name: String(name) } });
  if (exists) return res.status(409).json({ error: 'هذه السنة المالية مسجّلة مسبقاً' });
  const fy = await prisma.fiscalYear.create({
    data: { tenantId: req.auth!.tenantId, name: String(name), startDate: new Date(startDate), endDate: new Date(endDate + 'T23:59:59') },
  });
  res.status(201).json(fy);
});

/* ===================== أرصدة أول المدة ===================== */
// GET /api/periods/opening/:yearId — يعرض قيد الافتتاح إن وُجد
router.get('/opening/:yearId', async (req, res) => {
  const fy = await prisma.fiscalYear.findFirst({ where: { id: req.params.yearId, tenantId: req.auth!.tenantId } });
  if (!fy) return res.status(404).json({ error: 'السنة المالية غير موجودة' });
  const entry = fy.openingEntryId
    ? await prisma.journalEntry.findFirst({ where: { id: fy.openingEntryId, tenantId: req.auth!.tenantId }, include: { lines: true } })
    : null;
  res.json({ fiscalYear: fy, entry });
});

// POST /api/periods/opening/:yearId { lines: [{accountCode, debit, credit}] }
// يسجّل أرصدة أول المدة كقيد من نوع OPENING بتاريخ بداية السنة. يستبدل القيد السابق إن وُجد.
router.post('/opening/:yearId', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const fy = await prisma.fiscalYear.findFirst({ where: { id: req.params.yearId, tenantId } });
  if (!fy) return res.status(404).json({ error: 'السنة المالية غير موجودة' });
  if (fy.closed) return res.status(409).json({ error: 'السنة المالية مقفلة' });

  const v = await validateEntryLines(tenantId, req.body.lines || []);
  if (!v.ok) return res.status(422).json({ error: v.error });

  const result = await prisma.$transaction(async (tx) => {
    if (fy.openingEntryId) await tx.journalEntry.delete({ where: { id: fy.openingEntryId } }).catch(() => {});
    const entry = await tx.journalEntry.create({
      data: {
        tenantId, kind: 'OPENING', number: await nextEntryNumber(tenantId, tx), date: fy.startDate,
        descAr: `أرصدة أول المدة — السنة المالية ${fy.name}`, createdBy: req.auth!.userId,
        lines: { create: v.lines },
      },
      include: { lines: true },
    });
    await tx.fiscalYear.update({ where: { id: fy.id }, data: { openingEntryId: entry.id } });
    return entry;
  });
  res.status(201).json({ entry: result, totalDebit: v.totalDebit, message: 'تم تسجيل أرصدة أول المدة' });
});

/* ===================== الحسابات الختامية (الإقفال) ===================== */
// GET /api/periods/closing-preview/:yearId — معاينة قيد الإقفال قبل تنفيذه
router.get('/closing-preview/:yearId', async (req, res) => {
  const fy = await prisma.fiscalYear.findFirst({ where: { id: req.params.yearId, tenantId: req.auth!.tenantId } });
  if (!fy) return res.status(404).json({ error: 'السنة المالية غير موجودة' });
  res.json(await buildClosingPreview(req.auth!.tenantId, fy));
});

async function buildClosingPreview(tenantId: string, fy: any) {
  const { rows } = await buildBalances(tenantId, { to: fy.endDate, includeClosing: false });
  // كل حسابات المبيعات والمشتريات تُقفل في حساب نتيجة العام
  const temp = rows.filter((r) => !r.isGroup && (r.type === 'SALES' || r.type === 'PURCHASES') && Math.abs(r.balance) > 0.004);
  const lines: { accountCode: string; debit: number; credit: number; descAr: string }[] = [];
  for (const r of temp) {
    // إقفال الحساب = ترحيل عكس رصيده
    const isDebitBalance = r.type === 'PURCHASES' ? r.subtype !== 'PURCHASE_RETURNS' : r.subtype === 'SALES_RETURNS';
    if (isDebitBalance) lines.push({ accountCode: r.code, debit: 0, credit: round2(r.balance), descAr: `إقفال ${r.nameAr}` });
    else lines.push({ accountCode: r.code, debit: round2(r.balance), credit: 0, descAr: `إقفال ${r.nameAr}` });
  }
  const profit = netProfitOf(rows);
  if (profit >= 0) lines.push({ accountCode: SYS.currentResult, debit: 0, credit: round2(profit), descAr: 'صافي ربح العام' });
  else lines.push({ accountCode: SYS.currentResult, debit: round2(-profit), credit: 0, descAr: 'صافي خسارة العام' });

  return {
    fiscalYear: fy, netProfit: profit,
    revenue: totalRevenue(rows),
    expenses: totalExpenses(rows),
    lines,
    totalDebit: round2(lines.reduce((s, l) => s + l.debit, 0)),
    totalCredit: round2(lines.reduce((s, l) => s + l.credit, 0)),
  };
}

// POST /api/periods/close/:yearId { transferToRetained?: boolean, lock?: boolean }
// ينفّذ قيد الإقفال: يصفّر حسابات المبيعات والمشتريات ويرحّل النتيجة لحقوق الملكية.
router.post('/close/:yearId', requireRole('ADMIN'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const fy = await prisma.fiscalYear.findFirst({ where: { id: req.params.yearId, tenantId } });
  if (!fy) return res.status(404).json({ error: 'السنة المالية غير موجودة' });
  if (fy.closed) return res.status(409).json({ error: 'السنة المالية مقفلة مسبقاً' });

  const preview = await buildClosingPreview(tenantId, fy);
  if (preview.lines.length < 2) return res.status(422).json({ error: 'لا توجد حركة على حسابات المبيعات أو المشتريات لإقفالها' });

  const lines = [...preview.lines];
  // ترحيل النتيجة من حساب نتيجة العام إلى الأرباح المرحّلة (اختياري)
  const extra: typeof lines = [];
  if (req.body.transferToRetained) {
    const p = preview.netProfit;
    if (p >= 0) {
      extra.push({ accountCode: SYS.currentResult, debit: round2(p), credit: 0, descAr: 'ترحيل النتيجة' });
      extra.push({ accountCode: SYS.retained, debit: 0, credit: round2(p), descAr: 'ترحيل النتيجة للأرباح المرحّلة' });
    } else {
      extra.push({ accountCode: SYS.retained, debit: round2(-p), credit: 0, descAr: 'ترحيل الخسارة للأرباح المرحّلة' });
      extra.push({ accountCode: SYS.currentResult, debit: 0, credit: round2(-p), descAr: 'ترحيل النتيجة' });
    }
  }
  const all = [...lines, ...extra];
  const v = await validateEntryLines(tenantId, all);
  if (!v.ok) return res.status(422).json({ error: `تعذّر بناء قيد الإقفال: ${v.error}` });

  const result = await prisma.$transaction(async (tx) => {
    if (fy.closingEntryId) await tx.journalEntry.delete({ where: { id: fy.closingEntryId } }).catch(() => {});
    const entry = await tx.journalEntry.create({
      data: {
        tenantId, kind: 'CLOSING', number: await nextEntryNumber(tenantId, tx), date: fy.endDate,
        descAr: `قيد الإقفال الختامي — السنة المالية ${fy.name}`, createdBy: req.auth!.userId,
        lines: { create: v.lines },
      },
      include: { lines: true },
    });
    await tx.fiscalYear.update({ where: { id: fy.id }, data: { closingEntryId: entry.id, closed: req.body.lock !== false, closedAt: new Date() } });
    return entry;
  });

  res.status(201).json({ entry: result, netProfit: preview.netProfit, message: 'تم إقفال السنة المالية وترحيل النتيجة' });
});

// POST /api/periods/reopen/:yearId — إعادة فتح السنة (يحذف قيد الإقفال)
router.post('/reopen/:yearId', requireRole('ADMIN'), async (req, res) => {
  const fy = await prisma.fiscalYear.findFirst({ where: { id: req.params.yearId, tenantId: req.auth!.tenantId } });
  if (!fy) return res.status(404).json({ error: 'السنة المالية غير موجودة' });
  await prisma.$transaction(async (tx) => {
    if (fy.closingEntryId) await tx.journalEntry.delete({ where: { id: fy.closingEntryId } }).catch(() => {});
    await tx.fiscalYear.update({ where: { id: fy.id }, data: { closed: false, closedAt: null, closingEntryId: null } });
  });
  res.json({ message: 'تم إعادة فتح السنة المالية وإلغاء قيد الإقفال' });
});

export default router;
