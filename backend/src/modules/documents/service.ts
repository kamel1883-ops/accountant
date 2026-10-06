import { prisma } from '../../config/db';
import { buildQuoteHtml } from './quote';
import { buildContractHtml } from './contract';
import { buildServiceInvoiceHtml } from './serviceInvoice';
import { htmlToPdf } from './pdf';
import { priceBreakdown, PLANS } from './plans';

export async function nextDocNumber(kind: 'quote' | 'contract' | 'invoice') {
  const prefix = kind === 'quote' ? 'JFQ' : kind === 'contract' ? 'JFC' : 'JFI';
  const base = prefix + new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = kind === 'quote'
    ? await prisma.quote.count({ where: { number: { startsWith: base } } })
    : kind === 'contract'
      ? await prisma.contract.count({ where: { number: { startsWith: base } } })
      : await prisma.serviceInvoice.count({ where: { number: { startsWith: base } } });
  return base + String(count + 1).padStart(3, '0');
}

export async function quotePdf(quoteId: string) {
  const q = await prisma.quote.findUnique({ where: { id: quoteId }, include: { lead: true } });
  if (!q) return null;
  const html = buildQuoteHtml({
    quoteNumber: q.number,
    issuedAt: q.issuedAt,
    plan: q.plan,
    discount: Number(q.discount),
    discountCode: q.discountCode,
    client: { name: q.lead.companyName, unifiedNumber: q.lead.unifiedNumber, phone: q.lead.phone, email: q.lead.email, city: q.lead.city || undefined, activity: q.lead.activity || undefined, contact: q.lead.contactName || undefined },
  });
  return { number: q.number, total: priceBreakdown(PLANS[q.plan].price, Number(q.discount)).total, pdf: await htmlToPdf(html) };
}

export async function contractPdf(contractId: string) {
  const c = await prisma.contract.findUnique({ where: { id: contractId }, include: { lead: true } });
  if (!c) return null;
  const html = buildContractHtml({
    contractNumber: c.number,
    signedAt: c.signedAt,
    plan: c.plan,
    months: c.months,
    amountAgreed: Number(c.amountAgreed),
    discount: Number(c.discount),
    discountCode: c.discountCode,
    trialDays: c.trialDays,
    client: { name: c.lead.companyName, representative: c.lead.contactName || c.lead.companyName, unifiedNumber: c.lead.unifiedNumber, commercialRegister: c.lead.commercialRegister || undefined, phone: c.lead.phone, email: c.lead.email },
  });
  return { number: c.number, pdf: await htmlToPdf(html) };
}

export async function serviceInvoicePdf(invoiceId: string) {
  const inv = await prisma.serviceInvoice.findUnique({ where: { id: invoiceId }, include: { lead: true } });
  if (!inv) return null;
  const html = buildServiceInvoiceHtml({
    invoiceNumber: inv.number,
    issuedAt: inv.issuedAt,
    plan: inv.plan,
    months: inv.months,
    amount: Number(inv.amount),
    discount: Number(inv.discount),
    discountCode: inv.discountCode,
    client: {
      name: inv.lead.companyName,
      unifiedNumber: inv.lead.unifiedNumber,
      phone: inv.lead.phone,
      email: inv.lead.email,
      contact: inv.lead.contactName || undefined,
    },
  });
  return { number: inv.number, pdf: await htmlToPdf(html) };
}
