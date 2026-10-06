import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { logoDataUrl, parseLogo } from './logo';
import { sendMail, emails, appUrl } from '../../utils/mailer';
import { rateLimit } from '../../utils/rateLimit';
import { syncExpiry } from '../../utils/subscriptions';
import { digits, normalizeEmail } from '../../utils/userEmail';
import { audit } from '../../utils/audit';

const limiter = rateLimit({ max: 10, windowMs: 15 * 60 * 1000 });

const router = Router();
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const sign = (payload: object, expiresIn: string) => jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn } as any);

// POST /api/auth/login { email, password }
// شاشة دخول واحدة لكل العملاء: مستخدم منشأة مفعّلة => kind=tenant، أو عميل بانتظار التفعيل => kind=customer
router.post('/login', limiter, async (req, res) => {
  await syncExpiry();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const unified = digits(req.body.unifiedNumber);
  if (!/^7\d{9}$/.test(unified) || !email || !password) {
    return res.status(400).json({ error: 'أدخل الرقم الموحّد المسجّل عند إنشاء الحساب، ثم البريد وكلمة المرور' });
  }

  const users = await prisma.user.findMany({
    where: { email },
    include: { tenant: { select: { unifiedNumber: true } } },
  });
  const pool = users.filter((u) => digits(u.tenant.unifiedNumber) === unified);
  const matches = [];
  for (const user of pool) {
    if (await bcrypt.compare(password, user.passwordHash)) matches.push(user);
  }
  const user = matches[0];
  if (user) {
    const subscription = await prisma.subscription.findUnique({ where: { tenantId: user.tenantId } });
    if (subscription && subscription.status === 'SUSPENDED') {
      return res.status(402).json({ error: 'تم إيقاف اشتراك المنشأة مؤقتاً. تواصل مع جداره لإعادة التفعيل.' });
    }
    if (subscription && (subscription.status === 'EXPIRED' || subscription.status === 'CANCELLED')) {
      return res.status(402).json({ error: 'انتهى اشتراك المنشأة، تواصل مع جداره لتجديده' });
    }
    const token = sign(
      { userId: user.id, tenantId: user.tenantId, role: user.role, scope: 'tenant', tokenVersion: user.tokenVersion },
      process.env.JWT_EXPIRES_IN || '7d',
    );
    audit(req, { tenantId: user.tenantId, userId: user.id, action: 'LOGIN', result: 'OK' });
    return res.json({ kind: 'tenant', token, user: { id: user.id, nameAr: user.nameAr, role: user.role } });
  }

  const customer = await prisma.customerAccount.findUnique({
    where: { email },
    include: { lead: { select: { unifiedNumber: true } } },
  });
  if (customer && digits(customer.lead.unifiedNumber) === unified && (await bcrypt.compare(password, customer.passwordHash))) {
    const token = sign({ customerId: customer.id, leadId: customer.leadId, scope: 'customer', tokenVersion: customer.tokenVersion }, '7d');
    return res.json({ kind: 'customer', token, customer: { id: customer.id, contactName: customer.contactName, email: customer.email } });
  }
  audit(req, { action: 'LOGIN', result: 'DENIED' });
  return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
});

router.get('/company', requireAuth, async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.auth!.tenantId },
    select: { companyName: true, unifiedNumber: true, logoMime: true, logoData: true },
  });
  if (!tenant) return res.status(404).json({ error: 'المنشأة غير موجودة' });
  res.json({
    companyName: tenant.companyName,
    unifiedNumber: tenant.unifiedNumber,
    logoDataUrl: logoDataUrl(tenant.logoMime, tenant.logoData),
  });
});

router.post('/company/logo', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const parsed = parseLogo(req.body?.image);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });
  await prisma.tenant.update({
    where: { id: req.auth!.tenantId },
    data: { logoMime: parsed.mime, logoData: parsed.bytes },
  });
  res.json({ ok: true, logoDataUrl: logoDataUrl(parsed.mime, parsed.bytes) });
});

router.delete('/company/logo', requireAuth, requireRole('ADMIN'), async (req, res) => {
  await prisma.tenant.update({
    where: { id: req.auth!.tenantId },
    data: { logoMime: null, logoData: null },
  });
  res.json({ ok: true, logoDataUrl: null });
});

// POST /api/auth/forgot-password { email } — يرد دائماً بنفس الرسالة حتى لا يُكشف وجود الحساب من عدمه
router.post('/forgot-password', limiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const unified = digits(req.body.unifiedNumber);
  const generic = { message: 'إذا كان البريد مسجلاً لمدير منشأة فقد أرسلنا إليه رابط استعادة كلمة المرور.' };
  if (!email || !/^7\d{9}$/.test(unified)) return res.json(generic);

  const people = await prisma.user.findMany({
    where: { email },
    include: { tenant: { select: { unifiedNumber: true } } },
  });
  const admins = people.filter((p) => p.role === 'ADMIN' && digits(p.tenant.unifiedNumber) === unified);
  const targets = admins;
  if (people.length > 0 && admins.length === 0) return res.json(generic);

  const token = crypto.randomBytes(32).toString('hex');
  const data = { resetTokenHash: sha256(token), resetTokenExpires: new Date(Date.now() + 60 * 60 * 1000) };
  const users = targets.length
    ? await prisma.user.updateMany({ where: { id: { in: targets.map((t) => t.id) } }, data })
    : { count: 0 };
  const pending = await prisma.customerAccount.findUnique({ where: { email }, include: { lead: { select: { unifiedNumber: true } } } });
  const customers = pending && digits(pending.lead.unifiedNumber) === unified
    ? await prisma.customerAccount.updateMany({ where: { id: pending.id }, data })
    : { count: 0 };
  if (users.count + customers.count > 0) {
    const link = `${appUrl()}/reset-password?email=${encodeURIComponent(email)}&token=${token}`;
    const m = emails.reset(link);
    sendMail({ to: email, ...m }).catch((e) => console.error('mail error', e));
  }
  res.json(generic);
});

// POST /api/auth/reset-password { email, token, password }
router.post('/reset-password', limiter, async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { token, password } = req.body;
  if (!email || !token || !password || String(password).length < 8) {
    return res.status(400).json({ error: 'أكمل البيانات (كلمة المرور 8 أحرف على الأقل)' });
  }
  const where = { email, resetTokenHash: sha256(String(token)), resetTokenExpires: { gt: new Date() } };
  const passwordHash = await bcrypt.hash(String(password), 10);
  const clear = { passwordHash, resetTokenHash: null, resetTokenExpires: null, tokenVersion: { increment: 1 } };
  const u = await prisma.user.updateMany({ where, data: clear });
  const c = await prisma.customerAccount.updateMany({ where, data: clear });
  if (u.count + c.count === 0) return res.status(400).json({ error: 'الرابط غير صالح أو منتهي الصلاحية، اطلب رابطاً جديداً' });
  res.json({ message: 'تم تغيير كلمة المرور، يمكنك تسجيل الدخول الآن' });
});

export default router;
