import { COMPANY } from './company';
import { PLANS, PlanCode, usersText, priceBreakdown } from './plans';
import { money, ymd } from './format';
import { render, assetDataUri, LOGO_SVG, esc } from './template';

export interface QuoteInput {
  quoteNumber: string;
  issuedAt: Date;
  plan: PlanCode;
  discount?: number;
  discountCode?: string | null;
  client: { name: string; unifiedNumber: string; phone: string; email: string; city?: string; activity?: string; contact?: string };
}

export function buildQuoteHtml(q: QuoteInput) {
  const plan = PLANS[q.plan];
  const pb = priceBreakdown(plan.price, q.discount || 0);
  const featuresHtml = plan.features.map((f) => `<li>${esc(f)}</li>`).join('');
  const discountRow = pb.discount > 0
    ? `<tr><td class="lbl">الخصم${q.discountCode ? ` (كود «${esc(q.discountCode)}»)` : ''}</td><td class="val">- ${money(pb.discount)} ريال</td></tr>`
    : '';

  return render('quote.html', {
    quoteNumber: q.quoteNumber,
    issueDate: ymd(q.issuedAt),
    logo: LOGO_SVG,
    brand: COMPANY.brandAr,
    brandSubtitle: COMPANY.brandSubtitleAr,
    companyName: COMPANY.legalNameAr,
    companyUnified: COMPANY.unifiedNumber,
    clientName: q.client.name,
    clientCity: q.client.city || '—',
    clientPhone: q.client.phone,
    clientUnified: q.client.unifiedNumber,
    clientEmail: q.client.email,
    clientActivity: q.client.activity || '—',
    clientContact: q.client.contact || '—',
    planName: plan.nameAr,
    planTagline: plan.taglineAr,
    usersText: usersText(plan.users),
    featuresHtml,
    amountBefore: money(pb.base),
    amountNet: money(pb.net),
    amountVat: money(pb.vat),
    discountRow,
    amountTotal: money(pb.total),
    bankName: COMPANY.bank.nameAr,
    beneficiary: COMPANY.bank.beneficiary,
    accountNumber: COMPANY.bank.accountNumber,
    iban: COMPANY.bank.iban,
    supportEmail: COMPANY.supportEmail,
    gmName: COMPANY.generalManager,
    stampImg: assetDataUri('stamp.png'),
    ibanCertImg: assetDataUri('iban_certificate.png'),
  });
}
