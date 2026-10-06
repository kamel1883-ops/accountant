import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/db';
import { requireCustomerAuth } from '../../middleware/customerAuth';
import { sendMail, emails, notifyOwnerNewLead } from '../../utils/mailer';
import { nextDocNumber, quotePdf, contractPdf } from '../documents/service';
import { PLANS, PlanCode, priceBreakdown } from '../documents/plans';
import { money } from '../documents/format';
import { COMPANY } from '../documents/company';
import { resolveDiscount } from '../../utils/discounts';
import { rateLimit } from '../../utils/rateLimit';
import { normalizeUnified } from '../../utils/unifiedNumber';
import { parseCrImage } from '../../utils/crImage';
import { dropPendingByIdentity, unifiedBlock } from '../../utils/leadLifecycle';

const router = Router();

const ownerEmail = () => String(process.env.OWNER_EMAIL || process.env.OWNER_SEED_EMAIL || '').trim().toLowerCase();

// POST /api/customer/validate-code { code, plan } — معاينة الخصم قبل إنشاء الحساب
router.post('/validate-code', rateLimit({ max: 20, windowMs: 10 * 60 * 1000 }), async (req, res) => {
  const plan: PlanCode = req.body.plan === 'ADVANCED' ? 'ADVANCED' : 'BASIC';
  const r = await resolveDiscount(req.body.code, plan);
  if (!r.ok) return res.status(400).json({ error: r.error });
  const pb = priceBreakdown(PLANS[plan].price, r.amount);
  res.json({ code: r.code, label: r.label, discount: r.amount, net: pb.net, vat: pb.vat, total: pb.total });
});

// POST /api/customer/register — إنشاء حساب + طلب تجربة/اشتراك + توليد عرض السعر وإرساله بالبريد
router.post('/register', rateLimit({ max: 10, windowMs: 60 * 60 * 1000 }), async (req, res) => {
  const b = req.body;
  const email = String(b.email || '').trim().toLowerCase();
  const required = ['companyName', 'unifiedNumber', 'phone', 'contactName', 'password'];
  if (!email || required.some((k) => !String(b[k] || '').trim())) return res.status(400).json({ error: 'أكمل جميع الحقول المطلوبة' });
  if (String(b.password).length < 8) return res.status(400).json({ error: 'كلمة المرور 8 أحرف على الأقل' });
  const unified = normalizeUnified(b.unifiedNumber);
  if (!unified.ok) return res.status(400).json({ error: unified.error });
  const cr = parseCrImage(b.crImage, b.crFilename);
  if ('error' in cr) return res.status(400).json({ error: cr.error });

  const plan: PlanCode = b.plan === 'ADVANCED' ? 'ADVANCED' : 'BASIC';
  const requestType = b.requestType === 'trial' ? 'trial' : 'subscribe';

  if (email === ownerEmail()) return res.status(409).json({ error: 'هذا البريد مسجّل مسبقاً، سجّل الدخول أو استعد كلمة المرور' });
  const held = await unifiedBlock(prisma, unified.value);
  if (held) return res.status(409).json({ error: held });
  const existingUser = await prisma.user.findFirst({ where: { email }, include: { tenant: { include: { subscription: true } } } });
  if (existingUser) {
    const msg = existingUser.tenant.subscription?.status === 'ACTIVE'
      ? 'بيانات هذا الحساب موجودة مسبقاً في منصة جداره، ولا يمكن إنشاء حساب جديد بهذا البريد.'
      : 'لديك حساب ببيانات هذه المنشأة. أرجو التواصل مع جداره Finance لتفعيل وتنشيط حسابك.';
    return res.status(409).json({ error: msg });
  }
  const existingCustomer = await prisma.customerAccount.findUnique({ where: { email }, include: { lead: { select: { status: true } } } });
  if (existingCustomer?.lead.status === 'converted') {
    return res.status(409).json({ error: 'بيانات هذا الحساب موجودة مسبقاً في منصة جداره، ولا يمكن إنشاء حساب جديد بهذا البريد.' });
  }

  let disc: { id: string; code: string; amount: number } | null = null;
  if (String(b.discountCode || '').trim()) {
    const r = await resolveDiscount(b.discountCode, plan);
    if (!r.ok) return res.status(400).json({ error: r.error });
    disc = { id: r.id, code: r.code, amount: r.amount };
  }
  const passwordHash = await bcrypt.hash(String(b.password), 10);
  const number = await nextDocNumber('quote');
  const { lead, customer, quote } = await prisma.$transaction(async (tx) => {
    await dropPendingByIdentity(tx, unified.value, email);
    const lead = await tx.lead.create({
      data: {
        companyName: b.companyName, unifiedNumber: unified.value, email, phone: b.phone, activity: b.activity,
        city: b.city, commercialRegister: b.commercialRegister, contactName: b.contactName, requestType, plan, discountCode: disc?.code,
        crMime: cr.mime, crFilename: cr.filename, crData: cr.bytes,
      },
    });
    const customer = await tx.customerAccount.create({ data: { leadId: lead.id, email, passwordHash, contactName: b.contactName } });
    const quote = await tx.quote.create({ data: { number, leadId: lead.id, plan, discount: disc?.amount || 0, discountCode: disc?.code } });
    if (disc) await tx.discountCode.update({ where: { id: disc.id }, data: { usedCount: { increment: 1 } } });
    return { lead, customer, quote };
  });

  // إرسال عرض السعر (PDF واحد فيه العرض + الآيبان + الشهادة) — لا يُفشل التسجيل إن تعثّر البريد
  (async () => {
    const q = await quotePdf(quote.id);
    if (requestType === 'trial') {
      const m = emails.receivedTrial(b.contactName, b.companyName);
      await sendMail({ to: email, ...m });
    } else {
      const m = emails.receivedSubscribe(b.contactName, b.companyName);
      await sendMail({
        to: email,
        ...m,
        attachments: q ? [{ filename: `${q.number}.pdf`, content: q.pdf, contentType: 'application/pdf' }] : undefined,
      });
      if (q) await prisma.quote.update({ where: { id: quote.id }, data: { emailedAt: new Date() } });
    }
    await notifyOwnerNewLead({
      companyName: b.companyName,
      contactName: b.contactName,
      email,
      phone: b.phone,
      unifiedNumber: unified.value,
      city: b.city,
      activity: b.activity,
      plan: PLANS[plan].nameAr,
      requestType,
      quoteNumber: q?.number,
      amount: q ? money(q.total) : undefined,
    }, q ? [{ filename: `${q.number}.pdf`, content: q.pdf, contentType: 'application/pdf' }] : undefined);
  })().catch((e) => console.error('post-register mail error', e));

  const token = jwt.sign({ customerId: customer.id, leadId: lead.id, scope: 'customer' }, process.env.JWT_SECRET as string, { expiresIn: '7d' });
  res.status(201).json({ token, customer: { id: customer.id, contactName: customer.contactName, email }, quoteNumber: quote.number });
});

router.use(requireCustomerAuth);

// GET /api/customer/me — حالة الطلب والمستندات
router.get('/me', async (req, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.customerAuth!.leadId }, include: { quotes: true, contracts: true } });
  if (!lead) return res.status(404).json({ error: 'الطلب غير موجود' });
  res.json({
    company: lead.companyName, plan: lead.plan, planName: PLANS[lead.plan].nameAr, requestType: lead.requestType, status: lead.status,
    supportEmail: COMPANY.supportEmail,
    bank: COMPANY.bank,
    quotes: lead.quotes.map((q) => ({ id: q.id, number: q.number, discountCode: q.discountCode, total: priceBreakdown(PLANS[q.plan].price, Number(q.discount)).total, issuedAt: q.issuedAt })),
    contracts: lead.contracts.map((c) => ({ id: c.id, number: c.number, signedAt: c.signedAt })),
  });
});

router.get('/quotes/:id/pdf', async (req, res) => {
  const q = await prisma.quote.findFirst({ where: { id: req.params.id, leadId: req.customerAuth!.leadId } });
  const out = q && (await quotePdf(q.id));
  if (!out) return res.status(404).json({ error: 'غير موجود' });
  res.type('application/pdf').set('Content-Disposition', `attachment; filename="${out.number}.pdf"`).send(out.pdf);
});

router.get('/contracts/:id/pdf', async (req, res) => {
  const c = await prisma.contract.findFirst({ where: { id: req.params.id, leadId: req.customerAuth!.leadId } });
  const out = c && (await contractPdf(c.id));
  if (!out) return res.status(404).json({ error: 'غير موجود' });
  res.type('application/pdf').set('Content-Disposition', `attachment; filename="${out.number}.pdf"`).send(out.pdf);
});

export default router;
