import QRCode from 'qrcode';
import { prisma } from '../../config/db';
import { render, LOGO_SVG, esc } from './template';
import { COMPANY } from './company';
import { money } from './format';
import { round2 } from '../../utils/accounting';
import { buildZatcaTlvBase64 } from '../../utils/zatcaQr';
import { htmlToPdf } from './pdf';
import { logoDataUrl } from '../auth/logo';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
type Lang = 'ar' | 'en';
const KIND_LABEL: Record<string, [string, string]> = {
  NORMAL: ['قيد يومية', 'Journal Voucher'], OPENING: ['أرصدة أول المدة', 'Opening Balances'], CLOSING: ['قيد إقفال ختامي', 'Closing Entry'],
};
// نصوص المستندات المطبوعة بلغتين
const V: Record<string, [string, string]> = {
  no: ['رقم القيد', 'Voucher no.'], date: ['التاريخ', 'Date'], desc: ['البيان', 'Description'],
  kind: ['نوع القيد', 'Entry type'], source: ['المصدر', 'Source'],
  auto: ['ترحيل تلقائي', 'Auto-posted'], manual: ['إدخال يدوي', 'Manual entry'],
  seq: ['م', '#'], accCode: ['رقم الحساب', 'Account code'], accName: ['اسم الحساب', 'Account name'],
  lineDesc: ['البيان', 'Line description'], debit: ['مدين', 'Debit'], credit: ['دائن', 'Credit'],
  total: ['الإجمالي', 'Total'], diff: ['فرق الميزان', 'Difference'],
  ok: ['القيد متوازن ✓', 'Entry is balanced ✓'], bad: ['تحذير: القيد غير متوازن', 'Warning: entry is not balanced'],
  accountant: ['المحاسب', 'Accountant'], reviewer: ['المراجع', 'Reviewer'], cfo: ['المدير المالي', 'Finance Manager'],
  unified: ['الرقم الموحّد', 'Unified no.'], vatNo: ['الرقم الضريبي', 'VAT no.'],
  cr: ['السجل التجاري', 'Commercial registration'], branch: ['الفرع', 'Branch'],
  address: ['العنوان الوطني', 'National address'], building: ['مبنى', 'Bldg'],
  item: ['الصنف / الوصف', 'Item / Description'], qty: ['الكمية', 'Quantity'], price: ['سعر الوحدة', 'Unit price'],
  lineTotal: ['الإجمالي', 'Amount'], subtotal: ['الإجمالي قبل الضريبة', 'Subtotal (excl. VAT)'],
  sku: ['رقم الصنف', 'Item no.'], itemName: ['اسم الصنف', 'Item name'], unit: ['الوحدة', 'Unit'],
  netUnit: ['صافي سعر الوحدة قبل الضريبة', 'Net unit price before tax'], unitIncl: ['سعر الوحدة شامل الضريبة', 'Unit price incl. tax'],
  before: ['المبلغ قبل الخصم', 'Amount before discount'], discount: ['الخصم', 'Discount'],
  after: ['المبلغ بعد الخصم', 'Amount after discount'],
  vat: ['ضريبة القيمة المضافة 15٪', 'VAT 15%'], grand: ['الإجمالي شامل الضريبة', 'Total incl. VAT'],
  qrCap: ['رمز الاستجابة السريعة وفق متطلبات هيئة الزكاة والضريبة والجمارك', 'QR code as required by ZATCA'],
  sign: ['التوقيع', 'Signature'], seller: ['المورّد', 'Seller'], buyer: ['العميل', 'Buyer'], entity: ['المنشأة', 'Entity'],
};
const tx = (k: string, l: Lang) => V[k][l === 'en' ? 1 : 0];

/* ============ مستند قيد اليومية ============ */
export async function journalVoucherPdf(tenantId: string, entryId: string, lang: Lang = 'ar') {
  const entry = await prisma.journalEntry.findFirst({ where: { id: entryId, tenantId }, include: { lines: true } });
  if (!entry) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const accounts = await prisma.account.findMany({ where: { tenantId }, select: { code: true, nameAr: true, nameEn: true } });
  const names = Object.fromEntries(accounts.map((a) => [a.code, lang === 'en' ? a.nameEn || a.nameAr : a.nameAr]));

  const totalDebit = round2(entry.lines.reduce((s, l) => s + Number(l.debit), 0));
  const totalCredit = round2(entry.lines.reduce((s, l) => s + Number(l.credit), 0));
  const rowsHtml = entry.lines.map((l, i) => `<tr>
      <td>${i + 1}</td><td class="ltr">${esc(l.accountCode)}</td><td>${esc(names[l.accountCode] || '')}</td>
      <td>${esc(l.descAr || '')}</td>
      <td class="num">${Number(l.debit) ? money(Number(l.debit)) : '—'}</td>
      <td class="num">${Number(l.credit) ? money(Number(l.credit)) : '—'}</td>
    </tr>`).join('');

  const html = render(lang === 'en' ? 'voucher.html' : 'voucher.html', {
    dir: lang === 'ar' ? 'rtl' : 'ltr', lang,
    lNo: tx('no', lang), lDate: tx('date', lang), lDesc: tx('desc', lang), lKind: tx('kind', lang), lSource: tx('source', lang),
    lSeq: tx('seq', lang), lAccCode: tx('accCode', lang), lAccName: tx('accName', lang), lLineDesc: tx('lineDesc', lang),
    lDebit: tx('debit', lang), lCredit: tx('credit', lang), lTotal: tx('total', lang), lDiff: tx('diff', lang),
    lAccountant: tx('accountant', lang), lReviewer: tx('reviewer', lang), lCfo: tx('cfo', lang), lUnified: tx('unified', lang),
    docTitle: (KIND_LABEL[entry.kind] || KIND_LABEL.NORMAL)[lang === 'en' ? 1 : 0],
    number: entry.number ?? entry.id.slice(0, 8),
    date: ymd(entry.date),
    logo: LOGO_SVG,
    companySide: companySideCell(tenant, tx('unified', lang)),
    brand: COMPANY.brandAr,
    companyName: tenant?.companyName || COMPANY.legalNameAr,
    companyUnified: tenant?.unifiedNumber || COMPANY.unifiedNumber,
    descAr: entry.descAr,
    kindLabel: (KIND_LABEL[entry.kind] || KIND_LABEL.NORMAL)[lang === 'en' ? 1 : 0],
    sourceLabel: entry.isAuto ? `${tx('auto', lang)} (${entry.sourceRef || '—'})` : tx('manual', lang),
    rowsHtml,
    totalDebit: money(totalDebit),
    totalCredit: money(totalCredit),
    difference: money(round2(totalDebit - totalCredit)),
    balanceNote: Math.abs(totalDebit - totalCredit) < 0.005 ? tx('ok', lang) : tx('bad', lang),
  });
  return { number: entry.number ?? entry.id.slice(0, 8), pdf: await htmlToPdf(html) };
}

function companySideCell(tenant: { companyName?: string | null; unifiedNumber?: string | null; logoMime?: string | null; logoData?: Buffer | Uint8Array | null } | null, unifiedLabel: string) {
  const name = tenant?.companyName?.trim() || '';
  const unified = tenant?.unifiedNumber?.trim() || '';
  const src = logoDataUrl(tenant?.logoMime, tenant?.logoData);
  if (!name && !unified && !src) return '';
  const img = src ? `<img src="${src}" alt="" style="height:44px;width:auto;max-width:110px;object-fit:contain">` : '';
  const text = `<div style="font-weight:700">${esc(name)}</div>${unified ? `<div class="muted" style="font-size:11px">${esc(unifiedLabel)}: <span class="ltr">${esc(unified)}</span></div>` : ''}`;
  return `<td style="vertical-align:middle;text-align:left;direction:ltr"><div style="float:left;direction:ltr"><table dir="ltr" style="width:auto;margin:0"><tr><td style="width:74px;vertical-align:middle;padding:0">${img}</td><td style="vertical-align:middle;text-align:left;padding:0 0 0 8px">${text}</td></tr></table></div></td>`;
}

function numLine(label: string, value: string) {
  if (!value) return '';
  return `<br><span class="muted">${esc(label)}:</span> <span class="ltr">${esc(value)}</span>`;
}
function textLine(label: string, value: string) {
  if (!value) return '';
  return `<br><span class="muted">${esc(label)}:</span> ${esc(value)}`;
}

/** بيانات البائع من سجل هيئة الزكاة نفسه. العنوان الافتراضي غير المعبّأ لا يُطبع. */
async function salesSeller(tenantId: string, lang: Lang) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const device = await prisma.zatcaDevice.findUnique({ where: { tenantId } });
  const legal = device?.orgName?.trim() || tenant?.companyName || COMPANY.legalNameAr;
  const vat = device?.vatNumber?.trim() || tenant?.vatNumber || '—';
  const branch = device?.orgUnit && !/^(main branch|riyadh branch)$/i.test(device.orgUnit) ? device.orgUnit.trim() : '';
  const placeholder = !!device && /king fahd/i.test(device.street || '') && (device.buildingNumber === '1234' || !device.buildingNumber);
  let address = '';
  if (device && !placeholder && device.street?.trim() && device.buildingNumber?.trim()) {
    const district = device.district && !/^al olaya$/i.test(device.district) ? device.district.trim() : '';
    address = [
      device.street.trim(),
      `${tx('building', lang)} ${device.buildingNumber.trim()}`,
      district,
      device.cityName?.trim() || '',
      device.postalZone?.trim() || '',
    ].filter(Boolean).join('، ');
  }
  const extra = [
    numLine(tx('unified', lang), tenant?.unifiedNumber?.trim() || ''),
    numLine(tx('cr', lang), device?.crNumber?.trim() || ''),
    textLine(tx('branch', lang), branch),
    textLine(tx('address', lang), address),
  ].join('');
  return { tenant, legal, vat, extra };
}

/* ============ فاتورة مبيعات/مشتريات ============ */
export async function salesDocPdf(tenantId: string, docId: string, lang: Lang = 'ar') {
  const doc = await prisma.salesDoc.findFirst({ where: { id: docId, tenantId }, include: { lines: true } });
  if (!doc) return null;
  const seller = await salesSeller(tenantId, lang);
  const titles: Record<string, [string, string]> = {
    QUOTATION: ['عرض سعر', 'Quotation'], ORDER: ['أمر بيع', 'Sales order'],
    INVOICE: ['فاتورة ضريبية', 'Tax Invoice'], RETURN: ['إشعار دائن (مرتجع مبيعات)', 'Credit Note'],
  };
  const isTax = doc.type === 'INVOICE' || doc.type === 'RETURN';
  const qr = isTax
    ? buildZatcaTlvBase64({
        sellerName: seller.legal, vatNumber: seller.vat === '—' ? '' : seller.vat,
        timestampIso: doc.date.toISOString(), totalWithVat: Number(doc.total), vatAmount: Number(doc.vat),
      })
    : null;

  return buildInvoicePdf({
    titles: titles[doc.type], number: doc.id.slice(0, 8).toUpperCase(), date: doc.date, tenant: seller.tenant,
    sellerName: seller.legal, sellerVat: seller.vat, sellerExtra: seller.extra,
    buyerName: doc.customer, buyerVat: doc.customerVat?.trim() || '—', sellerLabel: tx('seller', lang), buyerLabel: tx('buyer', lang), lang,
    hideTopVat: true,
    companyOnSide: true,
    taxTable: isTax,
    lines: doc.lines, subtotal: Number(doc.subtotal), vat: Number(doc.vat), total: Number(doc.total),
    discount: Number(doc.discount), discountPercent: Number(doc.discountPercent), discountCode: doc.discountCode, qr, tenantId,
  });
}

export async function purchaseDocPdf(tenantId: string, docId: string, lang: Lang = 'ar') {
  const doc = await prisma.purchaseDoc.findFirst({ where: { id: docId, tenantId }, include: { lines: true } });
  if (!doc) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const incoming = doc.type === 'INVOICE' || doc.type === 'RETURN';
  const titles: Record<string, [string, string]> = {
    REQUEST: ['طلب شراء', 'Purchase request'], ORDER: ['أمر شراء', 'Purchase order'],
    INVOICE: ['فاتورة مورد واردة', 'Supplier invoice'], RETURN: ['مرتجع مشتريات', 'Purchase return'],
  };
  const receipt = doc.receiptStatus === 'PARTIAL' ? (lang === 'ar' ? 'استلام جزئي' : 'Partial receipt') : (lang === 'ar' ? 'استلام كامل' : 'Fully received');
  const payment = doc.paymentStatus === 'PAID' ? (lang === 'ar' ? 'مدفوع' : 'Paid') : (lang === 'ar' ? 'آجل' : 'On credit');
  return buildInvoicePdf({
    titles: titles[doc.type],
    number: incoming ? (doc.supplierInvoiceNo || '—') : doc.id.slice(0, 8).toUpperCase(),
    numberLabel: incoming ? (lang === 'ar' ? 'رقم فاتورة المورد' : 'Supplier invoice no.') : (lang === 'ar' ? 'رقم المستند' : 'Document no.'),
    date: doc.date, tenant,
    sellerName: doc.supplier, sellerVat: doc.supplierVat || '—', sellerExtra: `${textLine(lang === 'ar' ? 'مرجع الأمر' : 'Order ref', doc.orderRef || '')}${incoming ? textLine(lang === 'ar' ? 'الاستلام' : 'Receipt', receipt) : ''}${incoming ? textLine(lang === 'ar' ? 'السداد' : 'Payment', payment) : ''}`,
    buyerName: tenant?.companyName || COMPANY.legalNameAr,
    buyerVat: tenant?.vatNumber || '—', sellerLabel: tx('seller', lang), buyerLabel: tx('entity', lang), lang,
    companyOnSide: true,
    lines: doc.lines, subtotal: Number(doc.subtotal), vat: Number(doc.vat), total: Number(doc.total), qr: null, tenantId,
  });
}

function totalsBody(a: any, lang: Lang) {
  const discount = Number(a.discount) || 0;
  const net = Number(a.subtotal) || 0;
  if (!a.taxTable && discount <= 0.004) {
    return `<tr><td>${tx('subtotal', lang)}</td><td class="v">${money(net)}</td></tr>`;
  }
  const gross = Math.round((net + discount) * 100) / 100;
  const pct = Number(a.discountPercent) || 0;
  const mark = lang === 'ar' ? '٪' : '%';
  const rate = discount > 0.004 && pct ? ` (${pct}${mark})` : '';
  const discountLabel = lang === 'ar' ? 'الخصم' : 'Discount';
  const afterLabel = lang === 'ar' ? 'الإجمالي بعد الخصم' : 'Total after discount';
  return `<tr><td>${tx('subtotal', lang)}</td><td class="v">${money(gross)}</td></tr>
    <tr><td>${discountLabel}${rate}</td><td class="v">${money(discount)}</td></tr>
    <tr><td>${afterLabel}</td><td class="v">${money(net)}</td></tr>`;
}

async function buildInvoicePdf(a: any) {
  const lang: Lang = a.lang || 'ar';
  const products = await prisma.product.findMany({
    where: { tenantId: a.tenantId },
    select: { id: true, nameAr: true, nameEn: true, sku: true, unit: { select: { nameAr: true, nameEn: true } } },
  });
  const byId: any = Object.fromEntries(products.map((p) => [p.id, p]));
  const th = (ar: string, en: string) => `<th>${esc(lang === 'en' ? en : ar)}<small>${esc(lang === 'en' ? ar : en)}</small></th>`;
  const itemsHead = a.taxTable
    ? `${th('رقم الصنف', 'Item no.')}${th('اسم الصنف', 'Item name')}${th('الوحدة', 'Unit')}${th('الكمية', 'Quantity')}${th('سعر الوحدة قبل الضريبة', 'Unit price before tax')}${th('سعر الوحدة شامل الضريبة', 'Unit price incl. tax')}`
    : `<th style="width:8%">${tx('seq', lang)}</th><th>${tx('item', lang)}</th><th style="width:12%">${tx('qty', lang)}</th><th style="width:16%">${tx('price', lang)}</th><th style="width:16%">${tx('lineTotal', lang)}</th>`;
  const itemsHtml = a.lines.map((l: any, i: number) => {
    const p = byId[l.productId];
    const qty = Number(l.quantity);
    const unitExcl = Number(l.unitPrice);
    const lineExcl = Number(l.lineTotal);
    if (!a.taxTable) {
      const pname = p ? `${lang === 'en' ? p.nameEn || p.nameAr : p.nameAr} (${p.sku})` : l.productId;
      return `<tr><td>${i + 1}</td><td>${esc(pname)}</td>
        <td class="num">${qty}</td><td class="num">${money(unitExcl)}</td><td class="num">${money(lineExcl)}</td></tr>`;
    }
    const name = p ? (lang === 'en' ? p.nameEn || p.nameAr : p.nameAr) : l.productId;
    const unitName = p?.unit ? (lang === 'en' ? p.unit.nameEn || p.unit.nameAr : p.unit.nameAr) : '—';
    const unitIncl = round2(unitExcl * 1.15);
    return `<tr><td class="ltr">${esc(p?.sku || '—')}</td><td>${esc(name)}</td><td>${esc(unitName)}</td>
      <td class="num">${qty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</td>
      <td class="num">${money(unitExcl)}</td><td class="num">${money(unitIncl)}</td></tr>`;
  }).join('');

  const qrBlock = a.qr
    ? `<div class="qr"><img src="${await QRCode.toDataURL(a.qr, { margin: 1, width: 224 })}"><div class="cap">${tx('qrCap', lang)}</div></div>`
    : '';

  const html = render('invoice.html', {
    dir: lang === 'ar' ? 'rtl' : 'ltr', lang,
    lNo: a.numberLabel || tx('no', lang), lDate: tx('date', lang), lVatNo: tx('vatNo', lang), lUnified: tx('unified', lang),
    lSeq: tx('seq', lang), lItem: tx('item', lang), lQty: tx('qty', lang), lPrice: tx('price', lang), lLineTotal: tx('lineTotal', lang),
    lVat: tx('vat', lang), lGrand: tx('grand', lang), lSign: tx('sign', lang),
    docTitle: lang === 'en' ? a.titles[1] : a.titles[0], docTitleEn: lang === 'en' ? a.titles[0] : a.titles[1],
    number: a.number, date: ymd(a.date),
    vatNumberLine: !a.hideTopVat && a.tenant?.vatNumber ? `<br>${tx('vatNo', lang)}: <span class="ltr">${esc(a.tenant.vatNumber)}</span>` : '',
    logo: LOGO_SVG, brand: COMPANY.brandAr,
    brandExtra: a.companyOnSide ? '' : `<div class="muted">${esc(a.tenant?.companyName || COMPANY.legalNameAr)} — ${esc(tx('unified', lang))}: <span class="ltr">${esc(a.tenant?.unifiedNumber || COMPANY.unifiedNumber)}</span></div>`,
    companySide: a.companyOnSide ? companySideCell(a.tenant, tx('unified', lang)) : '',
    companyName: a.tenant?.companyName || COMPANY.legalNameAr,
    companyUnified: a.tenant?.unifiedNumber || COMPANY.unifiedNumber,
    sellerLabel: a.sellerLabel, buyerLabel: a.buyerLabel,
    sellerName: a.sellerName, sellerVat: a.sellerVat, sellerExtra: a.sellerExtra || '',
    buyerName: a.buyerName, buyerVat: a.buyerVat,
    itemsClass: a.taxTable ? 'items tax' : 'items',
    itemsHead, itemsHtml, totalsBody: totalsBody(a, lang),
    vat: money(a.vat), total: money(a.total),
    qrBlock,
    signBlock: a.taxTable ? '' : `<div class="foot"><div class="sline">${tx('sign', lang)}</div></div>`,
  });
  return { number: a.number, pdf: await htmlToPdf(html) };
}
