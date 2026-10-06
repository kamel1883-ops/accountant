import { existsSync } from 'fs';
import nodemailer from 'nodemailer';
import { COMPANY } from '../modules/documents/company';

export interface MailAttachment { filename: string; content: Buffer; contentType?: string }

let transporter: nodemailer.Transporter | null = null;
let transportKind: 'smtp' | 'sendmail' | 'none' = 'none';

function getTransporter() {
  if (transporter) return transporter;
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    transportKind = 'smtp';
    return transporter;
  }
  const sendmailPath = process.env.SENDMAIL_PATH || '/usr/sbin/sendmail';
  if (existsSync(sendmailPath)) {
    transporter = nodemailer.createTransport({ sendmail: true, newline: 'unix', path: sendmailPath });
    transportKind = 'sendmail';
    return transporter;
  }
  transportKind = 'none';
  return null;
}

// SMTP إن وُجد، وإلا sendmail على السيرفر. بدون أي منهما يُطبع الملخص في السجل فقط.
export async function sendMail(opts: { to: string; subject: string; html: string; attachments?: MailAttachment[] }) {
  const t = getTransporter();
  if (!t) {
    console.warn(`[mail:unsent] لا SMTP ولا sendmail — إلى: ${opts.to} | ${opts.subject}`);
    return { sent: false };
  }
  try {
    const from = process.env.MAIL_FROM || `Jadara Finance <noreply@jadara-finance.com>`;
    const envelopeFrom = process.env.MAIL_ENVELOPE_FROM || 'noreply@jadara-finance.com';
    await t.sendMail({
      from,
      envelope: { from: envelopeFrom, to: opts.to },
      replyTo: COMPANY.supportEmail,
      to: opts.to,
      subject: opts.subject,
      html: wrap(opts.html),
      attachments: opts.attachments,
    });
    console.log(`[mail:sent] via ${transportKind} إلى: ${opts.to} | ${opts.subject}`);
    return { sent: true };
  } catch (e) {
    console.error(`[mail:error] via ${transportKind} إلى: ${opts.to} | ${opts.subject}`, e);
    return { sent: false };
  }
}

function esc(s: string) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

const MARK_URL = 'https://www.jadara-finance.com/favicon.png';

function signature() {
  const phone = COMPANY.phone;
  const email = COMPANY.supportEmail;
  return `<table dir="rtl" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:3px solid #C6A15B;font-family:Tahoma,Arial,sans-serif;color:#1E1B33">
  <tr>
    <td style="padding:14px 0 0 16px;vertical-align:middle">
      <img src="${MARK_URL}" width="56" height="56" alt="جداره Finance" style="display:block;border:0;border-radius:12px">
    </td>
    <td style="padding:14px 16px 0 0;vertical-align:middle;border-right:1px solid #E6E1D4">
      <div style="font-size:20px;font-weight:bold;color:#151340;line-height:1.2">جداره <span style="color:#C6A15B">Finance</span></div>
      <div style="font-size:13px;font-weight:bold;color:#8A7340;margin-top:2px">للمحاسبة المالية</div>
      <div style="font-size:14px;font-weight:bold;color:#1E1B4B;margin-top:8px">الإدارة العامة</div>
      <div style="font-size:13px;color:#3A3658;margin-top:4px">واتساب <span dir="ltr">${esc(phone)}</span>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="mailto:${esc(email)}" style="color:#1E1B4B;text-decoration:none">${esc(email)}</a></div>
    </td>
  </tr>
</table>`;
}

function wrap(inner: string) {
  return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9;color:#1E1B33;max-width:600px;margin:auto">
  ${inner}
  ${signature()}</div>`;
}

export const appUrl = () => (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

// إشعارات العمل (عروض الأسعار، طلبات الاشتراك، تذاكر الدعم) لصندوق info فقط.
// بريد دخول بوابة المالك يبقى في OWNER_EMAIL ولا تصله هذه النسخ.
export function ownerNotifyRecipients() {
  const email = String(COMPANY.supportEmail || 'info@jadara-finance.com').trim().toLowerCase();
  return [email.includes('@') ? email : 'info@jadara-finance.com'];
}

export type OwnerLeadNotice = {
  companyName: string;
  contactName?: string;
  email: string;
  phone?: string;
  unifiedNumber?: string;
  city?: string;
  activity?: string;
  plan: string;
  requestType: string;
  quoteNumber?: string;
  amount?: string;
};

export async function notifyOwnerNewLead(info: OwnerLeadNotice, attachments?: MailAttachment[]) {
  const portal = `${appUrl()}${process.env.OWNER_PATH || '/owner-portal'}`;
  const kind =
    info.requestType === 'trial' || info.requestType === 'تجربة' ? 'تجربة مجانية'
    : info.requestType === 'quote' || info.requestType === 'عرض' ? 'عرض سعر'
    : 'اشتراك / تسجيل';
  const subject = `طلب ${kind} جديد: ${info.companyName}`;
  const quoteLine = info.quoteNumber
    ? `<tr><td style="padding:4px 12px 4px 0;color:#6C6A82">عرض السعر</td><td><b>${esc(info.quoteNumber)}</b>${info.amount ? ` — ${esc(info.amount)} ريال` : ''}</td></tr>`
    : '';
  const html = `<p>عزيزنا مالك جداره،</p>
  <p>هناك عميل طلب <b>${esc(kind)}</b>، والباقة: <b>${esc(info.plan || '—')}</b>.</p>
  <table style="border-collapse:collapse">
    <tr><td style="padding:4px 12px 4px 0;color:#6C6A82">المنشأة</td><td><b>${esc(info.companyName)}</b></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6C6A82">المسؤول</td><td>${esc(info.contactName || '—')}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6C6A82">البريد</td><td><a href="mailto:${esc(info.email)}">${esc(info.email)}</a></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6C6A82">الجوال</td><td>${esc(info.phone || '—')}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6C6A82">الرقم الموحد</td><td>${esc(info.unifiedNumber || '—')}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6C6A82">المدينة</td><td>${esc(info.city || '—')}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6C6A82">النشاط</td><td>${esc(info.activity || '—')}</td></tr>
    ${quoteLine}
  </table>
  <p>آمل الدخول على حسابك في بوابة المالك لإجراء اللازم:<br><a href="${esc(portal)}">${esc(portal)}</a></p>`;
  const toList = ownerNotifyRecipients();
  await Promise.all(toList.map((to) => sendMail({
    to,
    subject,
    html,
    attachments: attachments?.map((a) => ({ ...a, content: Buffer.from(a.content) })),
  })));
}

function contactBlock() {
  return `<p>لأي استفسار، تواصل معنا عبر:</p>
  <ul>
    <li>البريد الإلكتروني: <a href="mailto:${COMPANY.supportEmail}">${COMPANY.supportEmail}</a></li>
    <li>واتساب: <span dir="ltr">${esc(COMPANY.phone)}</span></li>
  </ul>
  <p>مع التحية،<br><b>Jadara Finance — جداره للمحاسبة المالية</b><br>${COMPANY.legalNameAr}</p>`;
}

export async function notifySupportTicket(info: {
  companyName: string;
  opener?: string;
  email?: string;
  category: string;
  subject: string;
  body: string;
  filenames?: string[];
  kind: 'new' | 'reply';
}) {
  const portal = `${appUrl()}${process.env.OWNER_PATH || '/owner-portal'}`;
  const title = info.kind === 'reply' ? 'رد جديد على تذكرة دعم' : 'تذكرة دعم جديدة';
  const files = (info.filenames || []).filter(Boolean);
  const html = `<p>عزيزنا مالك جداره،</p>
  <p>هناك تذكرة دعم فني من منشأة <b>${esc(info.companyName)}</b>.</p>
  <table style="border-collapse:collapse">
    <tr><td style="padding:4px 12px 4px 0;color:#6C6A82">المرسل</td><td>${esc(info.opener || '—')}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6C6A82">البريد</td><td>${info.email ? `<a href="mailto:${esc(info.email)}">${esc(info.email)}</a>` : '—'}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6C6A82">النوع</td><td>${esc(info.category)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6C6A82">العنوان</td><td>${esc(info.subject)}</td></tr>
  </table>
  <p style="white-space:pre-wrap">${esc(info.body)}</p>
  ${files.length ? `<p>المرفقات: ${files.map((f) => esc(f)).join('، ')}</p>` : ''}
  <p>آمل الدخول على حسابك في بوابة المالك لإجراء المطلوب:<br><a href="${esc(portal)}">${esc(portal)}</a></p>`;
  const subject = `${title}: ${info.companyName}`;
  await Promise.all(ownerNotifyRecipients().map((to) => sendMail({ to, subject, html })));
}

export const emails = {
  quote(name: string, quoteNumber: string, total: string) {
    return {
      subject: `عرض السعر ${quoteNumber} — جداره للمحاسبة المالية`,
      html: `<p>مرحبًا ${esc(name)}،</p><p>تجد مرفقاً عرض السعر رقم <b>${esc(quoteNumber)}</b> (المبلغ المستحق للسنة الأولى: <b>${esc(total)} ريال</b>)، وفي الملف نفسه بيانات التحويل البنكي وشهادة الآيبان.</p>
      <p>بعد التحويل يرجى إرسال إيصال التحويل إلى <a href="mailto:${COMPANY.supportEmail}">${COMPANY.supportEmail}</a>، ويتم تفعيل الحساب خلال 24 ساعة في أيام العمل.</p>`,
    };
  },
  receivedTrial(name: string, company: string) {
    return {
      subject: 'تم استلام طلب تجربتك في جداره للمحاسبة المالية',
      html: `<p>مرحبًا ${esc(name)}،</p>
      <p>شكرًا لاهتمامك بـ <b>جداره للمحاسبة المالية</b>. تم استلام طلب التجربة لمنشأة:</p>
      <p><b>${esc(company)}</b></p>
      <p>سيقوم فريقنا بمراجعة طلبك وتفعيل الحساب، ثم ستصلك رسالة منفصلة تحتوي على بيانات الدخول.</p>
      <p>بعد التفعيل، تحصل على تجربة مجانية لمدة <b>14 يومًا</b> لتتعرف على مزايا الباقة، ومنها:</p>
      <ul>
        <li>إدارة المبيعات والمشتريات</li>
        <li>القيود اليومية والحسابات</li>
        <li>إدارة المنتجات والمخزون</li>
        <li>التقارير والقوائم المالية</li>
        <li>إدارة العملاء والموردين</li>
        <li>الفوترة الإلكترونية وإعدادات التكامل بحسب الباقة وحالة المنشأة</li>
      </ul>
      <p>لا يتطلب تفعيل التجربة دفعًا أو إدخال بيانات ضريبية حقيقية. كما أن تفعيل الربط الإنتاجي مع الفوترة الإلكترونية لا يتم تلقائيًا عند التسجيل؛ فهو يحتاج إعدادًا مستقلًا لكل منشأة عند رغبتها في الربط الفعلي.</p>
      ${contactBlock()}`,
    };
  },
  receivedSubscribe(name: string, company: string) {
    return {
      subject: 'تم استلام طلب الاشتراك في جداره للمحاسبة المالية',
      html: `<p>مرحبًا ${esc(name)}،</p>
      <p>شكرًا لطلب الاشتراك في <b>جداره للمحاسبة المالية</b> لمنشأة:</p>
      <p><b>${esc(company)}</b></p>
      <p>تم استلام طلبك، وسيصلك عرض السعر على بريدك الإلكتروني متضمنًا:</p>
      <ul>
        <li>الباقة المطلوبة</li>
        <li>قيمة الاشتراك</li>
        <li>مدة الاشتراك</li>
        <li>بيانات التحويل</li>
        <li>أي خدمات إضافية تم طلبها</li>
      </ul>
      <p>بعد إتمام التحويل، يرجى إرسال إيصال التحويل إلى:<br><a href="mailto:${COMPANY.supportEmail}">${COMPANY.supportEmail}</a></p>
      <p>بعد التحقق من التحويل، يتم تفعيل حساب منشأتك خلال مدة لا تتجاوز <b>24 ساعة</b> في أيام العمل.</p>
      <p>بعد التفعيل، تستطيع إدارة المبيعات والمشتريات والحسابات والمخزون والتقارير من مكان واحد، بحسب الباقة المشتركة.</p>
      ${contactBlock()}`,
    };
  },
  activated(name: string, company: string, plan: string, status: string, until: string) {
    const login = `${appUrl()}/login`;
    return {
      subject: 'تم تفعيل حساب منشأتك في جداره للمحاسبة المالية',
      html: `<p>مرحبًا ${esc(name)}،</p>
      <p>تم تفعيل حساب منشأتك بنجاح في <b>جداره للمحاسبة المالية</b>.</p>
      <p><b>اسم المنشأة:</b> ${esc(company)}<br>
      <b>الباقة:</b> ${esc(plan)}<br>
      <b>حالة الاشتراك:</b> ${esc(status)}<br>
      <b>تاريخ انتهاء التجربة أو الاشتراك:</b> ${esc(until)}</p>
      <p>يمكنك الآن تسجيل الدخول إلى النظام من خلال:<br><a href="${login}">${login.replace(/^https?:\/\//, '')}</a></p>
      <p>ننصحك بالبدء بالخطوات التالية:</p>
      <ol>
        <li>استكمال بيانات المنشأة.</li>
        <li>إضافة المستخدمين وتحديد الصلاحيات.</li>
        <li>إعداد أو مراجعة دليل الحسابات.</li>
        <li>إضافة المنتجات أو الخدمات والعملاء والموردين.</li>
        <li>بدء تسجيل المبيعات والمشتريات والقيود.</li>
        <li>استخدام قسم الفوترة الإلكترونية في وضع Sandbox إذا كنت تريد اختبارًا تقنيًا.</li>
        <li>لا تفعّل Production إلا عند رغبة المنشأة في الربط الفعلي، وباستخدام بياناتها وصلاحياتها الرسمية في منصة فاتورة.</li>
      </ol>
      <p>تسجيل الدخول بنفس البريد وكلمة المرور التي سجّلت بها.</p>
      ${contactBlock()}`,
    };
  },
  reset(link: string) {
    return {
      subject: `استعادة كلمة المرور — ${COMPANY.brandAr}`,
      html: `<p>وصلنا طلب لاستعادة كلمة المرور. اضغط الرابط التالي لتعيين كلمة مرور جديدة (صالح لمدة 30 دقيقة):</p><p><a href="${link}">${link}</a></p><p style="color:#6C6A82">إذا لم تطلب ذلك فتجاهل هذه الرسالة.</p>`,
    };
  },
  ownerNotice(company: string, plan: string, requestType: string) {
    return {
      subject: `طلب جديد: ${company}`,
      html: `<p>وصل طلب جديد من <b>${company}</b> — الباقة: ${plan} — النوع: ${requestType}. راجعه في بوابة المالك.</p>`,
    };
  },
};
