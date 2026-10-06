import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { buildBalances, isDebitNature, round2, validateEntryLines, nextEntryNumber, assertPeriodOpen } from '../../utils/accounting';
import { journalVoucherPdf } from '../documents/print';
import { assertCenter } from '../../utils/costCenter';

const router = Router();
router.use(requireAuth);

/* ===================== القيود اليومية ===================== */
// GET /api/journal?from&to&kind&q
router.get('/', async (req, res) => {
  const { from, to, kind, q } = req.query as any;
  const where: any = { tenantId: req.auth!.tenantId };
  if (from || to) where.date = { ...(from && { gte: new Date(String(from)) }), ...(to && { lte: new Date(String(to) + 'T23:59:59') }) };
  if (kind) where.kind = String(kind);
  if (q) where.descAr = { contains: String(q), mode: 'insensitive' };

  const entries = await prisma.journalEntry.findMany({
    where,
    orderBy: [{ date: 'desc' }, { number: 'desc' }],
    take: 200,
    select: {
      id: true, number: true, date: true, descAr: true, kind: true, isAuto: true,
      lines: { select: { debit: true } },
    },
  });
  res.json(entries.map((e) => ({
    id: e.id,
    number: e.number,
    date: e.date,
    descAr: e.descAr,
    kind: e.kind,
    isAuto: e.isAuto,
    totalDebit: round2(e.lines.reduce((s, l) => s + Number(l.debit), 0)),
  })));
});

function sideColumns(amount: number, debitNature: boolean) {
  const n = round2(amount);
  if (Math.abs(n) < 0.004) return { debit: 0, credit: 0 };
  if (debitNature) return n > 0 ? { debit: n, credit: 0 } : { debit: 0, credit: round2(-n) };
  return n > 0 ? { debit: 0, credit: n } : { debit: round2(-n), credit: 0 };
}

async function sendTrialBalance(req: any, res: any) {
  const { from, to, level, zero } = req.query as any;
  const fromD = from ? new Date(String(from)) : undefined;
  const toD = to ? new Date(String(to) + 'T23:59:59') : undefined;
  const { rows } = await buildBalances(req.auth!.tenantId, { from: fromD, to: toD });

  let out = rows.filter((r) => (level === 'summary' ? r.isGroup : !r.isGroup));
  if (zero !== '1') out = out.filter((r) => Math.abs(r.openingDebit) + Math.abs(r.openingCredit) + Math.abs(r.debit) + Math.abs(r.credit) > 0.004);

  const shaped = out.map((r) => {
    const naturalDebit = isDebitNature(r.type, r.subtype);
    const opening = sideColumns(r.openingBalance, naturalDebit);
    const closing = sideColumns(r.balance, naturalDebit);
    return {
      code: r.code, nameAr: r.nameAr, nameEn: r.nameEn, type: r.type, subtype: r.subtype,
      openingDebit: opening.debit, openingCredit: opening.credit,
      debit: r.debit, credit: r.credit,
      closingDebit: closing.debit, closingCredit: closing.credit,
    };
  });
  const totals = shaped.reduce((t, r) => ({
    openingDebit: t.openingDebit + r.openingDebit, openingCredit: t.openingCredit + r.openingCredit,
    debit: t.debit + r.debit, credit: t.credit + r.credit,
    closingDebit: t.closingDebit + r.closingDebit, closingCredit: t.closingCredit + r.closingCredit,
  }), { openingDebit: 0, openingCredit: 0, debit: 0, credit: 0, closingDebit: 0, closingCredit: 0 });
  Object.keys(totals).forEach((k) => ((totals as any)[k] = round2((totals as any)[k])));

  res.json({
    from: fromD || null, to: toD || null,
    rows: shaped,
    totals,
    balanced: Math.abs(totals.debit - totals.credit) < 0.01 && Math.abs(totals.openingDebit - totals.openingCredit) < 0.01 && Math.abs(totals.closingDebit - totals.closingCredit) < 0.01,
  });
}

// المسارات الثابتة قبل /:id وإلا يُلتقط "reports" كمعرّف قيد
router.get('/trial-balance', sendTrialBalance);
router.get('/reports/trial-balance', sendTrialBalance);

// GET /api/journal/:id/print — مستند قيد اليومية جاهز للطباعة
router.get('/:id/print', async (req, res) => {
  const out = await journalVoucherPdf(req.auth!.tenantId, req.params.id, req.query.lang === 'en' ? 'en' : 'ar');
  if (!out) return res.status(404).json({ error: 'القيد غير موجود' });
  res.type('application/pdf').set('Content-Disposition', `inline; filename="voucher-${out.number}.pdf"`).send(out.pdf);
});

// GET /api/journal/:id
router.get('/:id', async (req, res) => {
  const e = await prisma.journalEntry.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId }, include: { lines: true } });
  if (!e) return res.status(404).json({ error: 'القيد غير موجود' });
  const accounts = await prisma.account.findMany({ where: { tenantId: req.auth!.tenantId }, select: { code: true, nameAr: true, nameEn: true } });
  const names = Object.fromEntries(accounts.map((a) => [a.code, a]));
  res.json({
    ...e,
    totalDebit: round2(e.lines.reduce((s, l) => s + Number(l.debit), 0)),
    totalCredit: round2(e.lines.reduce((s, l) => s + Number(l.credit), 0)),
    lines: e.lines.map((l) => ({ ...l, debit: Number(l.debit), credit: Number(l.credit), accountName: names[l.accountCode]?.nameAr || l.accountCode, accountNameEn: names[l.accountCode]?.nameEn || '' })),
  });
});

// POST /api/journal — قيد مركّب: أي عدد من الأطراف المدينة والدائنة (20 طرفاً أو أكثر)
// { date, descAr, lines: [{accountCode, debit, credit, descAr}] }
router.post('/', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const { date, descAr, descEn, lines, costCenterId } = req.body;
  if (!date || !String(descAr || '').trim()) return res.status(400).json({ error: 'أدخل تاريخ القيد وبيانه' });

  const entryDate = new Date(date);
  try { await assertPeriodOpen(tenantId, entryDate); }
  catch (e: any) { return res.status(e.status || 400).json({ error: e.message }); }

  const v = await validateEntryLines(tenantId, (lines || []).map((l: any) => ({ ...l, costCenterId: l.costCenterId || costCenterId || null })));
  if (!v.ok) return res.status(422).json({ error: v.error });
  try {
    const active = await prisma.costCenter.count({ where: { tenantId, status: 'ACTIVE' } });
    if (active) {
      const codes = [...new Set(v.lines.map((l) => l.accountCode))];
      const accounts = await prisma.account.findMany({ where: { tenantId, code: { in: codes } } });
      const pnl = new Set(accounts.filter((a) => a.type === 'SALES' || a.type === 'PURCHASES').map((a) => a.code));
      if (v.lines.some((l) => pnl.has(l.accountCode) && !l.costCenterId)) {
        await assertCenter(tenantId, null);
      }
    }
  } catch (error) {
    return res.status((error as { status?: number }).status || 400).json({ error: (error as Error).message });
  }

  const entry = await prisma.$transaction(async (tx) => tx.journalEntry.create({
    data: {
      tenantId, date: entryDate, descAr: String(descAr).trim(), descEn, kind: 'NORMAL',
      number: await nextEntryNumber(tenantId, tx), createdBy: req.auth!.userId,
      lines: { create: v.lines },
    },
    include: { lines: true },
  }));
  res.status(201).json({ ...entry, totalDebit: v.totalDebit, totalCredit: v.totalCredit });
});

// DELETE /api/journal/:id — يُمنع حذف القيود التلقائية وقيود الافتتاح/الإقفال والفترات المقفلة
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const e = await prisma.journalEntry.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!e) return res.status(404).json({ error: 'القيد غير موجود' });
  if (e.isAuto) return res.status(409).json({ error: 'قيد تلقائي مرتبط بمستند — احذف المستند نفسه أو سجّل قيداً عكسياً' });
  if (e.kind !== 'NORMAL') return res.status(409).json({ error: 'قيود أول المدة والإقفال تُدار من صفحة الفترات المالية' });
  try { await assertPeriodOpen(req.auth!.tenantId, e.date); }
  catch (x: any) { return res.status(x.status || 400).json({ error: x.message }); }
  await prisma.journalEntry.delete({ where: { id: e.id } });
  res.json({ message: 'تم حذف القيد' });
});

export default router;
