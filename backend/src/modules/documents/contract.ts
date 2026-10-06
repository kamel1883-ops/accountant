import { COMPANY } from './company';
import { PLANS, PlanCode, usersText, priceBreakdown, TRIAL_DAYS } from './plans';
import { money, hijri, gregorianLong, ymd, addMonths, durationText } from './format';
import { render, assetDataUri, LOGO_SVG, esc } from './template';

export interface ContractInput {
  contractNumber: string;
  signedAt: Date;
  plan: PlanCode;
  months: number;          // مدة العقد بالأشهر (الافتراضي 12)
  amountAgreed: number;    // قيمة الاشتراك المتفق عليها
  discount?: number;
  discountCode?: string | null;
  trialDays?: number;      // فترة التجربة والاسترداد بالأيام (الافتراضي 14)
  client: { name: string; representative: string; unifiedNumber: string; commercialRegister?: string; phone: string; email: string };
}

export function buildContractHtml(c: ContractInput) {
  const plan = PLANS[c.plan];
  const pb = priceBreakdown(c.amountAgreed, c.discount || 0);
  const discountLine = pb.discount > 0
    ? `، الخصم${c.discountCode ? ` بموجب كود «${esc(c.discountCode)}»` : ''}: <b>- ${money(pb.discount)} ر.س</b>`
    : '';
  return render('contract.html', {
    contractNumber: c.contractNumber,
    hijriDate: hijri(c.signedAt),
    gregorianDate: gregorianLong(c.signedAt),
    startDate: ymd(c.signedAt),
    endDate: ymd(addMonths(c.signedAt, c.months)),
    logo: LOGO_SVG,
    brand: COMPANY.brandAr,
    brandSubtitle: COMPANY.brandSubtitleAr,
    companyName: COMPANY.legalNameAr,
    companyUnified: COMPANY.unifiedNumber,
    gmName: COMPANY.generalManager,
    supportEmail: COMPANY.supportEmail,
    clientName: c.client.name,
    clientRep: c.client.representative,
    clientUnified: c.client.unifiedNumber,
    clientCr: c.client.commercialRegister || '—',
    clientPhone: c.client.phone,
    clientEmail: c.client.email,
    planName: plan.nameAr,
    usersText: usersText(plan.users),
    users: plan.users,
    annualPrice: money(pb.base),
    discountLine,
    netPrice: money(pb.net),
    vatAmount: money(pb.vat),
    firstYearTotal: money(pb.total),
    durationText: durationText(c.months),
    trialDays: c.trialDays ?? TRIAL_DAYS,
    stampImg: assetDataUri('stamp.png'),
  });
}
