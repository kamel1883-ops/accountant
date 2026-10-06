import { prisma } from '../../config/db';
import { zatcaApi } from './client';
import { stampInvoice, newUuid, pad2 } from './sign';
import { FIRST_PIH } from './env';
import { calcVat } from '../../utils/vatCalculator';
import { prorateDiscountedLines } from '../../utils/saleDiscount';
import { usesStandardClearance, dummyBuyerVat } from './compliance';
import { isKsaVatNumber } from './entity';
import { loadZatcaDevice } from './secrets';

function sellerFrom(device: any) {
  return {
    name: device.orgName,
    vat: device.vatNumber,
    crn: device.crNumber || device.vatNumber,
    street: device.street,
    building: device.buildingNumber,
    city: device.cityName,
    postal: device.postalZone,
    district: device.district,
  };
}

async function linesFor(tenantId: string, invoiceId: string, inv: any) {
  const doc = await prisma.salesDoc.findFirst({
    where: { tenantId, linkedInvoiceId: invoiceId },
    include: { lines: true },
  });
  if (!doc?.lines?.length) {
    return {
      typeCode: (inv.type === 'CREDIT_NOTE' ? '381' : '388') as '388' | '381',
      ksaCode: (inv.zatcaKind || 'SIMPLIFIED').toUpperCase() === 'STANDARD' ? '0100000' : '0200000',
      buyer: { name: inv.party },
      billingRef: inv.type === 'CREDIT_NOTE' ? 'PREV' : undefined,
      lines: [{
        name: inv.descAr || 'Sale',
        qty: 1,
        price: Number(inv.subtotal),
        lineNet: Number(inv.subtotal),
        vat: Number(inv.vat),
        lineGross: Number(inv.total),
      }],
    };
  }
  const products = await prisma.product.findMany({ where: { id: { in: doc.lines.map((l) => l.productId) } } });
  const nameOf = (id: string) => products.find((p) => p.id === id)?.nameAr || 'صنف';
  let lines = doc.lines.map((l) => {
    const lineNet = Number(l.lineTotal);
    const { vat, total } = calcVat(lineNet);
    return { name: nameOf(l.productId), qty: Number(l.quantity), price: Number(l.unitPrice), lineNet, vat, lineGross: total };
  });
  if (Number(doc.discount) > 0.004) {
    lines = prorateDiscountedLines(lines, Number(inv.subtotal), Number(inv.vat));
  }
  return {
    typeCode: (doc.type === 'RETURN' || inv.type === 'CREDIT_NOTE' ? '381' : '388') as '388' | '381',
    ksaCode: (doc.zatcaKind || inv.zatcaKind || 'SIMPLIFIED').toUpperCase() === 'STANDARD' ? '0100000' : '0200000',
    buyer: { name: doc.customer, vat: doc.customerVat || undefined },
    billingRef: doc.returnOfId || undefined,
    lines,
  };
}

export async function submitExistingInvoice(tenantId: string, invoiceId: string) {
  const device = await loadZatcaDevice(tenantId);
  if (!device || device.status !== 'ACTIVE' || !device.pcsidToken || !device.pcsidSecret) {
    return { skipped: true, reason: 'جهاز فاتورة غير مفعّل بعد — أكمل خطوات الربط أولاً' };
  }
  const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
  if (!inv) return { skipped: true, reason: 'الفاتورة غير موجودة' };
  if (inv.type === 'PURCHASE') return { skipped: true, reason: 'فواتير المشتريات لا تُرسل للهيئة' };
  if (inv.zatcaStatus === 'CLEARED' || inv.zatcaStatus === 'REPORTED') {
    return { skipped: true, reason: 'الفاتورة وصلت إلى الهيئة مسبقاً' };
  }
  const priorOk = await prisma.zatcaSubmission.findFirst({
    where: { tenantId, invoiceId, status: 'OK' },
    select: { id: true },
  });
  if (priorOk) return { skipped: true, reason: 'الفاتورة وصلت إلى الهيئة مسبقاً' };

  const extra = await linesFor(tenantId, invoiceId, inv);
  const buyerName = extra.buyer?.name || inv.party || 'Customer';
  const enteredVat = isKsaVatNumber(extra.buyer?.vat);
  const sellerVat = String(device.vatNumber || '').replace(/\s/g, '');
  const usableVat = enteredVat && enteredVat !== sellerVat ? enteredVat : '';
  if (usesStandardClearance(device.invoiceType)) {
    extra.ksaCode = '0100000';
    if (usableVat) extra.buyer = { name: buyerName, vat: usableVat };
    else if (device.environment === 'sandbox') extra.buyer = { name: buyerName, vat: dummyBuyerVat(sellerVat) };
    else {
      const reason = 'الفاتورة القياسية تحتاج الرقم الضريبي للمشتري (15 رقماً يبدأ وينتهي بـ 3) قبل الإرسال';
      await prisma.invoice.update({ where: { id: inv.id }, data: { zatcaStatus: 'SKIPPED', zatcaMessage: reason } });
      return { skipped: true, reason };
    }
  } else if (usableVat && device.invoiceType !== '0100') {
    extra.ksaCode = '0100000';
    extra.buyer = { name: buyerName, vat: usableVat };
  } else {
    extra.ksaCode = '0200000';
    extra.buyer = { name: buyerName };
  }
  const icv = device.icv + 1;
  const date = inv.date;
  const uuid = inv.uuid || newUuid();
  const kind = extra.ksaCode.startsWith('01') ? 'STANDARD' : 'SIMPLIFIED';
  const sealed = await stampInvoice({
    privateKeyPem: device.privateKeyPem,
    sellerName: device.orgName,
    vatNumber: device.vatNumber,
    certificateToken: device.pcsidToken,
    doc: {
      id: `INV-${date.getFullYear()}-${String(icv).padStart(6, '0')}`,
      uuid,
      issueDate: date.toISOString().slice(0, 10),
      issueTime: `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`,
      typeCode: extra.typeCode,
      ksaCode: extra.ksaCode,
      currency: 'SAR',
      icv,
      pih: device.previousHash || FIRST_PIH,
      seller: sellerFrom(device),
      buyer: extra.buyer,
      billingRef: extra.billingRef,
      lines: extra.lines,
      subtotal: Number(inv.subtotal),
      vat: Number(inv.vat),
      total: Number(inv.total),
    },
  });

  const apiCall = kind === 'STANDARD' ? zatcaApi.clear : zatcaApi.report;
  const result = await apiCall(device.environment, device.pcsidToken, device.pcsidSecret, sealed.payload);

  await prisma.zatcaSubmission.create({
    data: {
      tenantId, invoiceId, kind: kind === 'STANDARD' ? 'CLEARANCE' : 'REPORTING',
      uuid, invoiceHash: sealed.invoiceHash, xml: sealed.xml,
      httpStatus: result.status, response: result.raw.slice(0, 20000),
      status: result.ok ? 'OK' : 'FAILED',
    },
  });

  const zatcaStatus = result.ok ? (kind === 'STANDARD' ? 'CLEARED' : 'REPORTED') : 'FAILED';
  let message = result.ok ? 'تم الإرسال للهيئة' : JSON.stringify(result.data).slice(0, 2000);
  await prisma.invoice.update({
    where: { id: inv.id },
    data: {
      uuid, invoiceHash: sealed.invoiceHash, zatcaQr: sealed.qr, zatcaXml: sealed.xml,
      zatcaKind: kind, zatcaStatus, zatcaMessage: message, icv,
    },
  });
  if (result.ok) {
    await prisma.zatcaDevice.update({
      where: { id: device.id },
      data: { previousHash: sealed.invoiceHash, icv, lastError: null },
    });
  } else {
    await prisma.zatcaDevice.update({ where: { id: device.id }, data: { lastError: `فاتورة ${inv.id}: HTTP ${result.status}` } });
  }
  return { skipped: false, ok: result.ok, status: zatcaStatus, httpStatus: result.status, data: result.data };
}

export function queueZatcaSubmit(tenantId: string, invoiceId: string) {
  setImmediate(() => {
    submitExistingInvoice(tenantId, invoiceId).catch((e) => console.error('zatca submit', e));
  });
}
