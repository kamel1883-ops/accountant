import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/db';
import { requireOwnerAuth } from '../../middleware/ownerAuth';
import { seedChartOfAccountsForTenant } from '../../utils/seedAccounts';
import { nextDocNumber, quotePdf, contractPdf, serviceInvoicePdf } from '../documents/service';
import { PLANS, PlanCode, TRIAL_DAYS } from '../documents/plans';
import { money } from '../documents/format';
import { sendMail, emails, appUrl, notifyOwnerNewLead } from '../../utils/mailer';
import { replaceUserEmail } from '../../utils/userEmail';
import { audit } from '../../utils/audit';
import crypto from 'crypto';
import { rateLimit } from '../../utils/rateLimit';
import { syncExpiry } from '../../utils/subscriptions';
import { resolveDiscount, normalizeCode } from '../../utils/discounts';
import { digits } from '../../utils/unifiedNumber';
import { dropLead } from '../../utils/leadLifecycle';
import { wipeTenant } from '../../utils/wipeTenant';
import { addMonths } from '../documents/format';
import supportOwnerRoutes from '../support/ownerRoutes';

const router = Router();

// ---- Owner access: بريد مالك واحد سرّي فقط ----
// النظام لا يتعرّف إلا على OWNER_EMAIL من ملف .env. لا يوجد تسجيل ولا إنشاء حساب للمالك،
// وأي بريد آخر يُعامل كأنه غير موجود (نفس الرسالة ونفس زمن الاستجابة تقريباً).
const OWNER_EMAIL = () => String(process.env.OWNER_EMAIL || process.env.OWNER_SEED_EMAIL || '').trim().toLowerCase();
const OWNER_PATH = () => (process.env.OWNER_PATH || '/owner-portal').replace(/\/$/, '');
const sha256 = (x: string) => crypto.createHash('sha256').update(x).digest('hex');
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const authLimiter = rateLimit({ max: 8, windowMs: 15 * 60 * 1000 });

// POST /api/owner/login { email, password }
router.post('/login', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const fail = () => res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  if (!OWNER_EMAIL() || email !== OWNER_EMAIL()) { await bcrypt.compare(password, DUMMY_HASH); return fail(); }
  const owner = await prisma.owner.findUnique({ where: { email } });
  if (!owner || !(await bcrypt.compare(password, owner.passwordHash))) return fail();

  const token = jwt.sign({ ownerId: owner.id, email: owner.email, scope: 'owner', tokenVersion: owner.tokenVersion }, process.env.JWT_SECRET as string, { expiresIn: '12h' });
  res.json({ token, name: owner.name });
});

// POST /api/owner/forgot-password { email } — الرابط يُرسل لبريد المالك المعتمد فقط، والرد واحد دائماً
router.post('/forgot-password', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (OWNER_EMAIL() && email === OWNER_EMAIL()) {
    const owner = await prisma.owner.findUnique({ where: { email } });
    if (owner) {
      const token = crypto.randomBytes(32).toString('hex');
      await prisma.owner.update({ where: { id: owner.id }, data: { resetTokenHash: sha256(token), resetTokenExpires: new Date(Date.now() + 30 * 60 * 1000) } });
      const link = `${appUrl()}${OWNER_PATH()}/reset?email=${encodeURIComponent(email)}&token=${token}`;
      const m = emails.reset(link);
      const mail = await sendMail({ to: email, ...m });
      if (!mail.sent) {
        console.warn('[owner-reset] لم يُسلَّم بريد الاستعادة (تحقق من SMTP أو sendmail)');
      }
    }
  }
  res.json({ message: 'إذا كان البريد هو بريد المالك المعتمد فقد أرسلنا إليه رابط الاستعادة.' });
});

// POST /api/owner/reset-password { email, token, password }
router.post('/reset-password', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const { token, password } = req.body;
  const bad = () => res.status(400).json({ error: 'الرابط غير صالح أو منتهي الصلاحية' });
  if (!OWNER_EMAIL() || email !== OWNER_EMAIL() || !token || String(password || '').length < 10) {
    return String(password || '').length < 10 && email === OWNER_EMAIL() ? res.status(400).json({ error: 'كلمة المرور 10 أحرف على الأقل' }) : bad();
  }
  const owner = await prisma.owner.findFirst({ where: { email, resetTokenHash: sha256(String(token)), resetTokenExpires: { gt: new Date() } } });
  if (!owner) return bad();
  await prisma.owner.update({ where: { id: owner.id }, data: { passwordHash: await bcrypt.hash(String(password), 10), resetTokenHash: null, resetTokenExpires: null, tokenVersion: { increment: 1 } } });
  res.json({ message: 'تم تغيير كلمة المرور، سجّل الدخول الآن' });
});

router.use(requireOwnerAuth); // everything below requires the owner's own token

router.post('/change-password', async (req, res) => {
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');
  if (next.length < 10) return res.status(400).json({ error: 'كلمة المرور الجديدة 10 أحرف على الأقل' });
  const owner = await prisma.owner.findUnique({ where: { email: OWNER_EMAIL() } });
  if (!owner || !(await bcrypt.compare(current, owner.passwordHash))) {
    return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  }
  await prisma.owner.update({ where: { id: owner.id }, data: { passwordHash: await bcrypt.hash(next, 10), resetTokenHash: null, resetTokenExpires: null, tokenVersion: { increment: 1 } } });
  res.json({ message: 'تم تغيير كلمة المرور. استخدمها في الدخول التالي.' });
});

router.use('/support', supportOwnerRoutes);

// ---- Leads inbox ----
// GET /api/owner/leads — طلبات التجربة/الاشتراك مع عروض الأسعار والعقود المرتبطة
router.get('/leads', async (_req, res) => {
  const leads = await prisma.lead.findMany({ orderBy: { createdAt: 'desc' }, include: { quotes: true, contracts: true, serviceInvoices: true, customer: { select: { id: true } } } });
  res.json(leads.map((l) => {
    const { crData, ...rest } = l;
    return {
    ...rest,
    hasCr: !!crData && crData.length > 0,
    hasAccount: !!l.customer,
    quotes: l.quotes.map((q) => ({ id: q.id, number: q.number, discount: Number(q.discount), discountCode: q.discountCode, plan: q.plan })),
    contracts: l.contracts.map((c) => ({ id: c.id, number: c.number })),
    serviceInvoices: l.serviceInvoices.map((inv) => ({ id: inv.id, number: inv.number })),
  };
  }));
});

router.get('/leads/:id/cr', async (req, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id }, select: { crMime: true, crData: true, crFilename: true } });
  if (!lead?.crData?.length) return res.status(404).json({ error: 'لا توجد صورة للسجل التجاري' });
  res.type(lead.crMime || 'application/octet-stream')
    .set('Content-Disposition', `inline; filename="${encodeURIComponent(lead.crFilename || 'commercial-register')}"`)
    .send(lead.crData);
});

router.get('/tenants/:id/cr', async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id }, select: { unifiedNumber: true } });
  if (!tenant) return res.status(404).json({ error: 'المنشأة غير موجودة' });
  const leads = await prisma.lead.findMany({
    where: { crData: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, unifiedNumber: true, crMime: true, crData: true, crFilename: true },
  });
  const lead = leads.find((l) => digits(l.unifiedNumber) === digits(tenant.unifiedNumber) && l.crData?.length);
  if (!lead?.crData) return res.status(404).json({ error: 'لا توجد صورة للسجل التجاري' });
  res.type(lead.crMime || 'application/octet-stream')
    .set('Content-Disposition', `inline; filename="${encodeURIComponent(lead.crFilename || 'commercial-register')}"`)
    .send(lead.crData);
});

// إنهاء طلب لم يُفعَّل: تُحذف بياناته ويتحرر الرقم الموحّد للتسجيل من جديد.
router.post('/leads/:id/terminate', async (req, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!lead) return res.status(404).json({ error: 'الطلب غير موجود' });
  if (lead.status === 'converted') return res.status(409).json({ error: 'هذا الطلب مفعّل. أنهِ حساب المنشأة من صفحة العملاء المشتركين.' });
  await prisma.$transaction((tx) => dropLead(tx, lead.id));
  res.json({ ok: true, message: 'تم إنهاء الطلب وحذف بياناته. يمكن لصاحب الرقم الموحّد التسجيل من جديد.' });
});

// إنهاء حساب منشأة (تجربة أو اشتراك): حذف البيانات حتى يتحرر الرقم الموحّد.
router.post('/tenants/:id/terminate', async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id }, select: { id: true, unifiedNumber: true } });
  if (!tenant) return res.status(404).json({ error: 'المنشأة غير موجودة' });
  const leads = await prisma.lead.findMany({ select: { id: true, unifiedNumber: true, status: true } });
  const contracts = await prisma.contract.findMany({ where: { tenantId: tenant.id }, select: { leadId: true } });
  const invoices = await prisma.serviceInvoice.findMany({ where: { tenantId: tenant.id }, select: { leadId: true } });
  const leadIds = new Set<string>([...contracts.map((c) => c.leadId), ...invoices.map((i) => i.leadId)]);
  for (const lead of leads) {
    if (lead.status === 'converted' && digits(lead.unifiedNumber) === digits(tenant.unifiedNumber)) leadIds.add(lead.id);
  }
  await prisma.$transaction(async (tx) => {
    for (const id of leadIds) await dropLead(tx, id);
    await wipeTenant(tx, tenant.id);
  }, { timeout: 60000 });
  res.json({ ok: true, message: 'تم إنهاء الحساب وحذف بياناته. يمكن التسجيل بهذا الرقم الموحّد من جديد.' });
});

// POST /api/owner/leads/:id/quote { plan?, discount?, send? } — إصدار عرض سعر جديد (مثلاً بخصم) وإرساله للعميل
router.post('/leads/:id/quote', async (req, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!lead) return res.status(404).json({ error: 'الطلب غير موجود' });
  const plan: PlanCode = req.body.plan === 'ADVANCED' ? 'ADVANCED' : req.body.plan === 'BASIC' ? 'BASIC' : lead.plan;
  let discount = Number(req.body.discount) || 0;
  let discountCode: string | null = null;
  if (req.body.code) {
    const r = await resolveDiscount(req.body.code, plan);
    if (!r.ok) return res.status(400).json({ error: r.error });
    discount = r.amount; discountCode = r.code;
    await prisma.discountCode.update({ where: { id: r.id }, data: { usedCount: { increment: 1 } } });
  }
  const quote = await prisma.quote.create({ data: { number: await nextDocNumber('quote'), leadId: lead.id, plan, discount, discountCode } });
  if (req.body.send) {
    const out = await quotePdf(quote.id);
    if (out) {
      const m = emails.quote(lead.contactName || lead.companyName, out.number, money(out.total));
      const pdf = { filename: `${out.number}.pdf`, content: out.pdf, contentType: 'application/pdf' };
      await sendMail({ to: lead.email, ...m, attachments: [pdf] });
      await notifyOwnerNewLead({
        companyName: lead.companyName,
        contactName: lead.contactName || undefined,
        email: lead.email,
        phone: lead.phone,
        unifiedNumber: lead.unifiedNumber,
        city: lead.city || undefined,
        activity: lead.activity || undefined,
        plan: PLANS[plan].nameAr,
        requestType: 'quote',
        quoteNumber: out.number,
        amount: money(out.total),
      }, [pdf]);
      await prisma.quote.update({ where: { id: quote.id }, data: { emailedAt: new Date() } });
    }
  }
  res.status(201).json(quote);
});

router.get('/quotes/:id/pdf', async (req, res) => {
  const out = await quotePdf(req.params.id);
  if (!out) return res.status(404).json({ error: 'غير موجود' });
  res.type('application/pdf').set('Content-Disposition', `attachment; filename="${out.number}.pdf"`).send(out.pdf);
});

router.get('/contracts/:id/pdf', async (req, res) => {
  const out = await contractPdf(req.params.id);
  if (!out) return res.status(404).json({ error: 'غير موجود' });
  res.type('application/pdf').set('Content-Disposition', `attachment; filename="${out.number}.pdf"`).send(out.pdf);
});

router.get('/invoices/:id/pdf', async (req, res) => {
  const out = await serviceInvoicePdf(req.params.id);
  if (!out) return res.status(404).json({ error: 'غير موجود' });
  res.type('application/pdf').set('Content-Disposition', `attachment; filename="${out.number}.pdf"`).send(out.pdf);
});

async function issueServiceInvoice(leadId: string, body: any = {}) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { contracts: { orderBy: { signedAt: 'desc' }, take: 1 } },
  });
  if (!lead) return null;
  const contract = lead.contracts[0];
  const plan: PlanCode = body.plan === 'ADVANCED' || body.plan === 'BASIC' ? body.plan : contract?.plan || lead.plan;
  const discount = body.discount !== undefined && body.discount !== '' ? Number(body.discount) || 0 : contract ? Number(contract.discount) : 0;
  const amount = Number(body.amount) || (contract ? Number(contract.amountAgreed) : PLANS[plan].price);
  const months = Math.max(1, Number(body.months) || contract?.months || 12);
  return prisma.serviceInvoice.create({
    data: {
      number: await nextDocNumber('invoice'),
      leadId: lead.id,
      tenantId: body.tenantId || contract?.tenantId || null,
      plan,
      months,
      amount,
      discount,
      discountCode: contract?.discountCode || null,
    },
  });
}

// POST /api/owner/leads/:id/invoice — فاتورة اشتراك غير خاضعة للضريبة، وتبقى قابلة للتحميل
router.post('/leads/:id/invoice', async (req, res) => {
  const invoice = await issueServiceInvoice(req.params.id, req.body);
  if (!invoice) return res.status(404).json({ error: 'الطلب غير موجود' });
  res.status(201).json(invoice);
});

// POST /api/owner/leads/:id/activate
// { mode: 'trial'|'subscribe', plan, months=12, amountReceived, paymentDate, reference, discount, trialDays, send=true }
// يؤكد الاشتراك: ينشئ المنشأة + الاشتراك + الفرع الرئيسي + دليل الحسابات + أول مستخدم ADMIN (من حساب العميل)،
// ويسجّل الدفعة المستلمة، ويولّد العقد ويرسله للعميل بالبريد.
router.post('/leads/:id/activate', async (req, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id }, include: { customer: true } });
  if (!lead) return res.status(404).json({ error: 'الطلب غير موجود' });
  if (lead.status === 'converted') return res.status(409).json({ error: 'تم تفعيل هذا الطلب مسبقاً' });

  const b = req.body;
  const mode = b.mode === 'trial' ? 'trial' : 'subscribe';
  const plan: PlanCode = b.plan === 'ADVANCED' ? 'ADVANCED' : b.plan === 'BASIC' ? 'BASIC' : lead.plan;
  const months = Math.max(1, Number(b.months) || 12);
  const lastQuote = await prisma.quote.findFirst({ where: { leadId: lead.id }, orderBy: { issuedAt: 'desc' } });
  const sameAsQuote = !!lastQuote && lastQuote.plan === plan;
  const discount = b.discount !== undefined && b.discount !== '' ? Number(b.discount) || 0 : sameAsQuote ? Number(lastQuote!.discount) : 0;
  const discountCode = b.discountCode !== undefined ? normalizeCode(b.discountCode) || null : sameAsQuote ? lastQuote!.discountCode : null;
  const listPrice = PLANS[plan].price;
  const amountAgreed = Number(b.amountAgreed) || listPrice;
  const trialDays = Number(b.trialDays) || TRIAL_DAYS;
  const start = new Date();
  const end = new Date(start); end.setMonth(end.getMonth() + months);
  const contractNumber = mode === 'subscribe' ? await nextDocNumber('contract') : null;
  const invoiceNumber = mode === 'subscribe' && b.createInvoice ? await nextDocNumber('invoice') : null;

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        companyName: lead.companyName, unifiedNumber: lead.unifiedNumber, activity: lead.activity,
        subscription: {
          create: {
            plan,
            status: 'TRIAL',
            priceAtSignup: 0,
            trialEndsAt: mode === 'trial' ? new Date(Date.now() + trialDays * 86400000) : end,
          },
        },
      },
    });
    await seedChartOfAccountsForTenant(tenant.id, tx);
    const branch = await tx.branch.create({ data: { tenantId: tenant.id, nameAr: 'الفرع الرئيسي', nameEn: 'Main branch', isMain: true } });
    if (lead.customer) {
      await tx.user.create({
        data: { tenantId: tenant.id, branchId: branch.id, email: lead.customer.email, passwordHash: lead.customer.passwordHash, nameAr: lead.customer.contactName, role: 'ADMIN' },
      });
    }
    const contract = contractNumber
      ? await tx.contract.create({ data: { number: contractNumber, leadId: lead.id, tenantId: tenant.id, plan, months, amountAgreed, discount, discountCode, trialDays: TRIAL_DAYS, signedAt: start } })
      : null;
    const invoice = invoiceNumber
      ? await tx.serviceInvoice.create({
        data: {
          number: invoiceNumber,
          leadId: lead.id,
          tenantId: tenant.id,
          plan,
          months,
          amount: amountAgreed,
          discount,
          discountCode,
        },
      })
      : null;
    await tx.lead.update({ where: { id: lead.id }, data: { status: 'converted' } });
    return { tenant, contract, invoice };
  });

  if (b.send !== false) {
    (async () => {
      const name = lead.contactName || lead.companyName;
      const until = mode === 'trial' ? new Date(Date.now() + trialDays * 86400000) : end;
      const untilLabel = until.toLocaleDateString('ar-SA-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
      const m = emails.activated(name, lead.companyName, PLANS[plan].nameAr, 'تجربة مجانية', untilLabel);
      const out = result.contract ? await contractPdf(result.contract.id) : null;
      await sendMail({
        to: lead.email,
        ...m,
        attachments: out ? [{ filename: `${out.number}.pdf`, content: out.pdf, contentType: 'application/pdf' }] : undefined,
      });
      if (out && result.contract) await prisma.contract.update({ where: { id: result.contract.id }, data: { emailedAt: new Date() } });
    })().catch((e) => console.error('activation mail error', e));
  }

  res.status(201).json({
    tenantId: result.tenant.id,
    contractId: result.contract?.id || null,
    invoiceId: result.invoice?.id || null,
    userCreated: !!lead.customer,
    message: lead.customer ? 'تم التفعيل، ويمكن للعميل الدخول بنفس بريده وكلمة مروره.' : 'تم التفعيل. الطلب لا يملك حساباً، أنشئ له مستخدماً يدوياً.',
  });
});

// ---- Discount codes (أكواد الخصم) ----
const genCode = () => Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)]).join('');

router.get('/codes', async (_req, res) => {
  res.json((await prisma.discountCode.findMany({ orderBy: { createdAt: 'desc' } })).map((c) => ({ ...c, value: Number(c.value) })));
});

// POST /api/owner/codes { code?, type: 'PERCENT'|'FIXED', value, plan?, maxUses?, validFrom?, validUntil?, note? }
router.post('/codes', async (req, res) => {
  const b = req.body;
  const type = b.type === 'FIXED' ? 'FIXED' : 'PERCENT';
  const value = Number(b.value);
  if (!(value > 0) || (type === 'PERCENT' && value > 100)) return res.status(400).json({ error: type === 'PERCENT' ? 'النسبة من 1 إلى 100' : 'أدخل مبلغاً صحيحاً' });
  const code = normalizeCode(b.code) || genCode();
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return res.status(400).json({ error: 'الكود حروف إنجليزية وأرقام فقط (3 إلى 30)' });
  if (await prisma.discountCode.findUnique({ where: { code } })) return res.status(409).json({ error: 'هذا الكود موجود مسبقاً' });
  const created = await prisma.discountCode.create({
    data: {
      code, type, value,
      plan: b.plan === 'BASIC' || b.plan === 'ADVANCED' ? b.plan : null,
      maxUses: b.maxUses ? Number(b.maxUses) : null,
      validFrom: b.validFrom ? new Date(b.validFrom) : null,
      validUntil: b.validUntil ? new Date(b.validUntil + 'T23:59:59') : null,
      note: b.note || null,
    },
  });
  res.status(201).json({ ...created, value: Number(created.value) });
});

// PATCH /api/owner/codes/:id { active?, maxUses?, validUntil?, note? }
router.patch('/codes/:id', async (req, res) => {
  const b = req.body;
  const c = await prisma.discountCode.update({
    where: { id: req.params.id },
    data: {
      ...(b.active !== undefined && { active: !!b.active }),
      ...(b.maxUses !== undefined && { maxUses: b.maxUses ? Number(b.maxUses) : null }),
      ...(b.validUntil !== undefined && { validUntil: b.validUntil ? new Date(b.validUntil + 'T23:59:59') : null }),
      ...(b.note !== undefined && { note: b.note || null }),
    },
  });
  res.json({ ...c, value: Number(c.value) });
});

router.delete('/codes/:id', async (req, res) => {
  const c = await prisma.discountCode.findUnique({ where: { id: req.params.id } });
  if (!c) return res.status(404).json({ error: 'غير موجود' });
  if (c.usedCount > 0) return res.status(409).json({ error: 'الكود استُخدم من قبل — عطّله بدل حذفه للحفاظ على السجل' });
  await prisma.discountCode.delete({ where: { id: c.id } });
  res.json({ ok: true });
});

// ---- Overview (نظرة عامة: تجارب، فعّالون، عقود قاربت الانتهاء) ----
router.get('/overview', async (_req, res) => {
  await syncExpiry();
  const subs = await prisma.subscription.findMany({ include: { tenant: true } });
  const now = Date.now();
  const shape = (s: (typeof subs)[number]) => {
    const end = s.status === 'TRIAL' ? s.trialEndsAt : s.endDate;
    return {
      tenantId: s.tenantId, companyName: s.tenant.companyName, plan: s.plan, status: s.status,
      priceAtSignup: Number(s.priceAtSignup), startDate: s.startDate, endDate: end,
      daysLeft: end ? Math.ceil((end.getTime() - now) / 86400000) : null,
    };
  };
  const all = subs.map(shape);
  const byDays = (a: { daysLeft: number | null }, b: { daysLeft: number | null }) => (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9);
  const trial = all.filter((s) => s.status === 'TRIAL').sort(byDays);
  const active = all.filter((s) => s.status === 'ACTIVE').sort(byDays);
  const expiringSoon = active.filter((s) => (s.daysLeft ?? 1e9) <= 60);
  const expired = all.filter((s) => s.status === 'EXPIRED');
  const payments = await prisma.payment.findMany();
  res.json({
    counts: { trial: trial.length, active: active.length, expiringSoon: expiringSoon.length, expired: expired.length, pendingLeads: await prisma.lead.count({ where: { status: { not: 'converted' } } }) },
    annualRevenue: payments.filter((p) => active.some((s) => s.tenantId === p.tenantId)).reduce((sum, p) => sum + Number(p.amount), 0),
    totalReceived: payments.filter((p) => active.some((s) => s.tenantId === p.tenantId)).reduce((sum, p) => sum + Number(p.amount), 0),
    trial, active, expiringSoon, expired,
  });
});

// POST /api/owner/tenants/:id/renew { startDate, endDate, amountReceived, reference? } — تحويل التجربة أو التجديد إلى سنة مدفوعة
router.post('/tenants/:id/renew', async (req, res) => {
  const b = req.body;
  const sub = await prisma.subscription.findUnique({ where: { tenantId: req.params.id }, include: { tenant: true } });
  if (!sub) return res.status(404).json({ error: 'الاشتراك غير موجود' });
  const startDate = new Date(b.startDate);
  const endDate = new Date(b.endDate);
  const amount = Number(b.amountReceived);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
    return res.status(400).json({ error: 'حدد تاريخ البداية وتاريخ النهاية، والنهاية بعد البداية' });
  }
  if (!(amount > 0)) return res.status(400).json({ error: 'أدخل المبلغ المستلم قبل تسجيل الاشتراك إيراداً' });
  const plan: PlanCode = b.plan === 'BASIC' || b.plan === 'ADVANCED' ? b.plan : sub.plan;
  const wasTrial = sub.status === 'TRIAL';
  const updated = await prisma.subscription.update({
    where: { tenantId: req.params.id },
    data: { status: 'ACTIVE', plan, startDate, endDate, trialEndsAt: null, priceAtSignup: amount },
  });
  await prisma.payment.create({
    data: { tenantId: req.params.id, amount, receivedAt: startDate, reference: b.reference || (wasTrial ? 'تحويل لاشتراك' : 'تجديد') },
  });
  if (wasTrial) {
    const admin = await prisma.user.findFirst({ where: { tenantId: req.params.id, role: 'ADMIN' }, select: { email: true, nameAr: true } });
    if (admin?.email) {
      const untilLabel = endDate.toLocaleDateString('ar-SA-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
      const m = emails.activated(admin.nameAr || sub.tenant.companyName, sub.tenant.companyName, PLANS[plan].nameAr, 'اشتراك فعال', untilLabel);
      sendMail({ to: admin.email, ...m }).catch((e) => console.error('subscription mail error', e));
    }
  }
  res.json(updated);
});

// ---- Existing tenants management ----
// PATCH /api/owner/tenants/:id/users/:userId/email { email } — بريد مدير المنشأة فقط
router.patch('/tenants/:id/users/:userId/email', async (req, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.params.userId, tenantId: req.params.id } });
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود في هذه المنشأة' });
  if (user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'من بوابة المالك يُغيَّر بريد مدير المنشأة فقط. بقية المستخدمين يغيّر بريدهم مدير المنشأة من إدارة المستخدمين.' });
  }
  const moved = await replaceUserEmail(user.id, user.tenantId, req.body.email);
  if ('error' in moved && moved.error) return res.status(400).json({ error: moved.error });
  audit(req, { tenantId: user.tenantId, userId: user.id, action: 'ADMIN_EMAIL_REPLACE', resource: user.id, result: 'OK' });
  res.json({ ok: true, email: moved.user?.email });
});

// GET /api/owner/tenants
router.get('/tenants', async (_req, res) => {
  const tenants = await prisma.tenant.findMany({
    include: {
      subscription: true,
      contracts: { select: { id: true, number: true } },
      serviceInvoices: { select: { id: true, number: true } },
      users: {
        select: {
          id: true, email: true, nameAr: true, role: true, createdAt: true,
          emailHistory: { select: { email: true, changedAt: true }, orderBy: { changedAt: 'desc' } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(tenants);
});

router.post('/tenants/:id/suspend', async (req, res) => {
  const sub = await prisma.subscription.findUnique({ where: { tenantId: req.params.id } });
  if (!sub) return res.status(404).json({ error: 'الاشتراك غير موجود' });
  if (sub.status === 'SUSPENDED') return res.json(sub);
  const updated = await prisma.subscription.update({ where: { tenantId: req.params.id }, data: { status: 'SUSPENDED' } });
  res.json(updated);
});

router.post('/tenants/:id/resume', async (req, res) => {
  const sub = await prisma.subscription.findUnique({ where: { tenantId: req.params.id } });
  if (!sub) return res.status(404).json({ error: 'الاشتراك غير موجود' });
  const now = new Date();
  let status: 'TRIAL' | 'ACTIVE' | 'EXPIRED' = 'ACTIVE';
  if (sub.trialEndsAt && !sub.endDate) status = sub.trialEndsAt > now ? 'TRIAL' : 'EXPIRED';
  else if (sub.endDate && sub.endDate <= now) status = 'EXPIRED';
  const updated = await prisma.subscription.update({ where: { tenantId: req.params.id }, data: { status } });
  res.json(updated);
});

router.post('/tenants/:id/invoice', async (req, res) => {
  const contract = await prisma.contract.findFirst({ where: { tenantId: req.params.id }, orderBy: { signedAt: 'desc' } });
  if (!contract) return res.status(400).json({ error: 'لا يوجد عقد لهذه المنشأة. أكّد الاشتراك وأنشئ العقد أولاً.' });
  const invoice = await issueServiceInvoice(contract.leadId, { ...req.body, tenantId: req.params.id });
  if (!invoice) return res.status(404).json({ error: 'الطلب غير موجود' });
  res.status(201).json(invoice);
});

// PATCH /api/owner/tenants/:id/subscription — activate / extend / cancel
// body: { status: 'ACTIVE'|'TRIAL'|'EXPIRED'|'CANCELLED', trialEndsAt?, endDate?, plan? }
router.patch('/tenants/:id/subscription', async (req, res) => {
  const { status, trialEndsAt, endDate, plan } = req.body;
  const sub = await prisma.subscription.update({
    where: { tenantId: req.params.id },
    data: {
      ...(status && { status }),
      ...(trialEndsAt && { trialEndsAt: new Date(trialEndsAt) }),
      ...(endDate && { endDate: new Date(endDate) }),
      ...(plan && { plan }),
      ...(status === 'ACTIVE' && { startDate: new Date() }),
    },
  });
  res.json(sub);
});

// ---- Revenue dashboard ----
// GET /api/owner/revenue — active/trial tenant counts + annualized revenue
router.get('/revenue', async (_req, res) => {
  const subs = await prisma.subscription.findMany({ include: { tenant: true } });
  const payments = await prisma.payment.findMany({ include: { tenant: true }, orderBy: { receivedAt: 'desc' } });
  const active = subs.filter((s) => s.status === 'ACTIVE');
  const trial = subs.filter((s) => s.status === 'TRIAL');
  const activeIds = new Set(active.map((s) => s.tenantId));
  const booked = payments.filter((p) => activeIds.has(p.tenantId));
  const annualRevenue = booked.reduce((s, p) => s + Number(p.amount), 0);

  res.json({
    totalTenants: subs.length,
    activeCount: active.length,
    trialCount: trial.length,
    annualRevenue,
    byPlan: {
      BASIC: active.filter((s) => s.plan === 'BASIC').length,
      ADVANCED: active.filter((s) => s.plan === 'ADVANCED').length,
    },
    totalReceived: annualRevenue,
    payments: booked.map((p) => ({ id: p.id, companyName: p.tenant.companyName, amount: Number(p.amount), receivedAt: p.receivedAt, reference: p.reference })),
    tenants: subs.map((s) => ({
      companyName: s.tenant.companyName,
      plan: s.plan,
      status: s.status,
      priceAtSignup: s.priceAtSignup,
      trialEndsAt: s.trialEndsAt,
      endDate: s.endDate,
    })),
  });
});

export default router;
