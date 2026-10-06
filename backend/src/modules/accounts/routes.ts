import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { buildBalances, isContra, round2 } from '../../utils/accounting';

const router = Router();
router.use(requireAuth);

const TYPE_LABEL: Record<string, string> = {
  ASSET: 'الأصول', LIABILITY: 'الخصوم', EQUITY: 'حقوق الملكية', SALES: 'المبيعات', PURCHASES: 'المشتريات',
};

// GET /api/accounts?withBalances=1 — دليل الحسابات كاملاً (شجرة عبر parentId)
router.get('/', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const accounts = await prisma.account.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  if (req.query.withBalances !== '1') return res.json(accounts);
  const { rows } = await buildBalances(tenantId, {});
  const byCode = Object.fromEntries(rows.map((r) => [r.code, r.balance]));
  const withOwn = accounts.map((a) => ({ ...a, balance: byCode[a.code] ?? 0 }));
  const children = new Map<string, typeof withOwn>();
  for (const a of withOwn) {
    if (!a.parentId) continue;
    const list = children.get(a.parentId) || [];
    list.push(a);
    children.set(a.parentId, list);
  }
  const rolled = new Map<string, number>();
  const walk = (id: string): number => {
    if (rolled.has(id)) return rolled.get(id)!;
    rolled.set(id, 0);
    const account = withOwn.find((a) => a.id === id)!;
    const kids = children.get(id) || [];
    let total = Number(account.balance) || 0;
    for (const kid of kids) {
      const amount = walk(kid.id);
      total = round2(total + (!kid.isGroup && isContra(kid) ? -amount : amount));
    }
    rolled.set(id, total);
    return total;
  };
  res.json(withOwn.map((a) => ({ ...a, balance: walk(a.id) })));
});

// GET /api/accounts/roots — الحسابات الرئيسية الخمسة
router.get('/roots', async (req, res) => {
  const roots = await prisma.account.findMany({ where: { tenantId: req.auth!.tenantId, parentId: null }, orderBy: { code: 'asc' } });
  res.json(roots.map((r) => ({ ...r, typeLabel: TYPE_LABEL[r.type] })));
});

// POST /api/accounts — فتح حساب فرعي تحت أي حساب
// { parentId, code, nameAr, nameEn, subtype?, isGroup? }  — النوع يُورَّث من الأب دائماً
router.post('/', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const { parentId, code, nameAr, nameEn, subtype, isGroup } = req.body;
  if (!parentId) return res.status(400).json({ error: 'اختر الحساب الأب' });
  if (!String(code || '').trim() || !String(nameAr || '').trim()) return res.status(400).json({ error: 'أدخل رقم الحساب واسمه' });

  const parent = await prisma.account.findFirst({ where: { id: parentId, tenantId } });
  if (!parent) return res.status(404).json({ error: 'الحساب الأب غير موجود' });

  const exists = await prisma.account.findUnique({ where: { tenantId_code: { tenantId, code: String(code).trim() } } });
  if (exists) return res.status(409).json({ error: 'رقم الحساب مستخدم مسبقاً' });

  const account = await prisma.$transaction(async (tx) => {
    // الأب الذي صار له أبناء يصبح تجميعياً تلقائياً لمنع الترحيل عليه وعلى أبنائه معاً
    if (!parent.isGroup) {
      const used = await tx.journalLine.count({ where: { accountCode: parent.code, entry: { tenantId } } });
      if (used > 0) throw Object.assign(new Error(`الحساب ${parent.code} عليه حركة مرحّلة، فلا يمكن جعله حساباً أباً. اختر حساباً آخر.`), { status: 409 });
      await tx.account.update({ where: { id: parent.id }, data: { isGroup: true } });
    }
    return tx.account.create({
      data: {
        tenantId, code: String(code).trim(), nameAr: String(nameAr).trim(), nameEn: nameEn || nameAr,
        type: parent.type, subtype: subtype || parent.subtype, parentId: parent.id, isGroup: !!isGroup,
      },
    });
  });
  res.status(201).json(account);
});

// PATCH /api/accounts/:id — تعديل الاسم أو التفعيل
router.patch('/:id', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const a = await prisma.account.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!a) return res.status(404).json({ error: 'الحساب غير موجود' });
  const { nameAr, nameEn, active, subtype } = req.body;
  const updated = await prisma.account.update({
    where: { id: a.id },
    data: { ...(nameAr && { nameAr }), ...(nameEn && { nameEn }), ...(active !== undefined && { active: !!active }), ...(subtype && { subtype }) },
  });
  res.json(updated);
});

// DELETE /api/accounts/:id — يُمنع حذف حساب عليه حركة أو له أبناء أو أساسي
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const a = await prisma.account.findFirst({ where: { id: req.params.id, tenantId } });
  if (!a) return res.status(404).json({ error: 'الحساب غير موجود' });
  if (a.isSystem) return res.status(409).json({ error: 'حساب أساسي في دليل الحسابات ولا يُحذف — يمكنك تعطيله' });
  const children = await prisma.account.count({ where: { parentId: a.id } });
  if (children) return res.status(409).json({ error: 'للحساب حسابات فرعية — احذفها أولاً' });
  const used = await prisma.journalLine.count({ where: { accountCode: a.code, entry: { tenantId } } });
  if (used) return res.status(409).json({ error: 'الحساب عليه حركة مرحّلة ولا يُحذف — عطّله بدلاً من ذلك' });
  await prisma.account.delete({ where: { id: a.id } });
  res.json({ message: 'تم حذف الحساب' });
});

export default router;
