import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { PLANS, PlanCode } from '../documents/plans';
import { replaceUserEmail } from '../../utils/userEmail';
import { audit } from '../../utils/audit';

const router = Router();
router.use(requireAuth);

const ROLES = ['ADMIN', 'ACCOUNTANT', 'VIEWER'] as const;
type Role = (typeof ROLES)[number];

function publicUser(u: { id: string; email: string; nameAr: string; nameEn: string | null; role: string; createdAt: Date; emailHistory?: { email: string }[] }) {
  return {
    id: u.id,
    email: u.email,
    nameAr: u.nameAr,
    nameEn: u.nameEn,
    role: u.role,
    createdAt: u.createdAt,
    previousEmails: (u.emailHistory || []).map((h) => h.email),
  };
}

async function planLimit(tenantId: string) {
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  const plan = (sub?.plan || 'BASIC') as PlanCode;
  return { plan, max: PLANS[plan]?.users || 1 };
}

router.get('/', async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const [users, lim] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      include: { emailHistory: { orderBy: { changedAt: 'desc' }, select: { email: true } } },
    }),
    planLimit(tenantId),
  ]);
  res.json({
    meId: req.auth!.userId,
    myRole: req.auth!.role,
    plan: lim.plan,
    maxUsers: lim.max,
    users: users.map(publicUser),
  });
});

router.post('/', requireRole('ADMIN'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const email = String(req.body.email || '').trim().toLowerCase();
  const nameAr = String(req.body.nameAr || '').trim();
  const password = String(req.body.password || '');
  const role = (ROLES as readonly string[]).includes(String(req.body.role)) ? req.body.role as Role : 'VIEWER';
  if (!email || !nameAr) return res.status(400).json({ error: 'أدخل الاسم والبريد' });
  if (password.length < 8) return res.status(400).json({ error: 'كلمة المرور 8 أحرف على الأقل' });

  const lim = await planLimit(tenantId);
  const count = await prisma.user.count({ where: { tenantId } });
  if (count >= lim.max) {
    return res.status(400).json({
      error: lim.max === 1
        ? 'الباقة الأساسية لمستخدم واحد. رقِّ للمتقدمة لإضافة محاسبين.'
        : `وصلت للحد الأقصى (${lim.max} مستخدمين) في باقتك`,
    });
  }
  if (await prisma.user.findFirst({ where: { tenantId, email } })) {
    return res.status(409).json({ error: 'هذا البريد مسجّل في منشأتك مسبقاً' });
  }

  const branch = await prisma.branch.findFirst({ where: { tenantId, isMain: true } });
  const user = await prisma.user.create({
    data: {
      tenantId,
      branchId: branch?.id || null,
      email,
      nameAr,
      nameEn: req.body.nameEn ? String(req.body.nameEn).trim() : null,
      role,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  audit(req, { tenantId, userId: req.auth!.userId, action: 'USER_CREATE', resource: user.id, result: 'OK' });
  res.status(201).json(publicUser(user));
});

router.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const existing = await prisma.user.findFirst({ where: { id: req.params.id, tenantId } });
  if (!existing) return res.status(404).json({ error: 'المستخدم غير موجود' });

  if (req.body.email !== undefined && String(req.body.email).trim()) {
    if (existing.role === 'ADMIN') {
      return res.status(400).json({ error: 'بريد المدير نفسه يُغيَّر من الدعم الفني جداره للمحاسبة المالية' });
    }
    const moved = await replaceUserEmail(existing.id, tenantId, req.body.email);
    if ('error' in moved && moved.error) return res.status(400).json({ error: moved.error });
  }

  const data: { nameAr?: string; role?: Role; passwordHash?: string; tokenVersion?: { increment: number } } = {};
  if (req.body.nameAr) data.nameAr = String(req.body.nameAr).trim();
  if ((ROLES as readonly string[]).includes(String(req.body.role))) {
    if (existing.id === req.auth!.userId && req.body.role !== 'ADMIN') {
      return res.status(400).json({ error: 'لا تخفّض صلاحية حسابك وأنت المدير الوحيد المتصل' });
    }
    if (existing.role === 'ADMIN' && req.body.role !== 'ADMIN') {
      const admins = await prisma.user.count({ where: { tenantId, role: 'ADMIN' } });
      if (admins < 2) return res.status(400).json({ error: 'أبقِ مديراً واحداً على الأقل للمنشأة' });
    }
    data.role = req.body.role as Role;
  }
  if (req.body.password) {
    if (String(req.body.password).length < 8) return res.status(400).json({ error: 'كلمة المرور 8 أحرف على الأقل' });
    data.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    data.tokenVersion = { increment: 1 };
  }
  const user = await prisma.user.update({ where: { id: existing.id }, data });
  audit(req, { tenantId, userId: req.auth!.userId, action: req.body.password ? 'USER_PASSWORD' : 'USER_UPDATE', resource: user.id, result: 'OK' });
  res.json(publicUser(user));
});

router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const tenantId = req.auth!.tenantId;
  if (req.params.id === req.auth!.userId) return res.status(400).json({ error: 'لا تحذف حسابك وأنت داخل الجلسة' });
  const existing = await prisma.user.findFirst({ where: { id: req.params.id, tenantId } });
  if (!existing) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (existing.role === 'ADMIN') {
    const admins = await prisma.user.count({ where: { tenantId, role: 'ADMIN' } });
    if (admins < 2) return res.status(400).json({ error: 'لا تحذف المدير الوحيد' });
  }
  await prisma.user.delete({ where: { id: existing.id } });
  audit(req, { tenantId, userId: req.auth!.userId, action: 'USER_DELETE', resource: existing.id, result: 'OK' });
  res.json({ ok: true });
});

export default router;
