import { COMPANY } from './company';
import { PLANS, PlanCode, usersText, priceBreakdown } from './plans';
import { money, ymd, durationText } from './format';
import { render, LOGO_SVG, esc } from './template';

export interface ServiceInvoiceInput {
  invoiceNumber: string;
  issuedAt: Date;
  plan: PlanCode;
  months: number;
  amount: number;
  discount?: number;
  discountCode?: string | null;
  client: { name: string; unifiedNumber: string; phone: string; email: string; contact?: string };
}

export function buildServiceInvoiceHtml(inv: ServiceInvoiceInput) {
  const plan = PLANS[inv.plan];
  const pb = priceBreakdown(inv.amount, inv.discount || 0);
  const discountRow = pb.discount > 0
    ? `<tr><td class="lbl">الخصم${inv.discountCode ? ` (كود «${esc(inv.discountCode)}»)` : ''}</td><td class="val">- ${money(pb.discount)} ريال</td></tr>`
    : '';
  return render('service-invoice.html', {
    invoiceNumber: inv.invoiceNumber,
    issueDate: ymd(inv.issuedAt),
    logo: LOGO_SVG,
    brand: COMPANY.brandAr,
    brandSubtitle: COMPANY.brandSubtitleAr,
    companyName: COMPANY.legalNameAr,
    companyUnified: COMPANY.unifiedNumber,
    supportEmail: COMPANY.supportEmail,
    clientName: inv.client.name,
    clientUnified: inv.client.unifiedNumber,
    clientContact: inv.client.contact || '—',
    clientPhone: inv.client.phone,
    clientEmail: inv.client.email,
    planName: plan.nameAr,
    usersText: usersText(plan.users),
    durationText: durationText(inv.months),
    amountBefore: money(pb.base),
    discountRow,
    amountTotal: money(pb.total),
  });
}
