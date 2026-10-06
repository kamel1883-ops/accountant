import { FIRST_PIH } from './env';
import { zatcaApi } from './client';
import { stampInvoice, newUuid, pad2 } from './sign';
import { prisma } from '../../config/db';

export type ComplianceKind = { typeCode: '388' | '381' | '383'; ksaCode: string; label: string };

export function invoiceTypeForEnv(env: string, requested?: string) {
  if (requested && ['1100', '1000', '0100'].includes(requested)) return requested;
  return env === 'sandbox' ? '1000' : '1100';
}

export function complianceTypesFor(invoiceType: string): ComplianceKind[] {
  const simplified: ComplianceKind[] = [
    { typeCode: '388', ksaCode: '0200000', label: 'simplified-invoice' },
    { typeCode: '381', ksaCode: '0200000', label: 'simplified-credit' },
    { typeCode: '383', ksaCode: '0200000', label: 'simplified-debit' },
  ];
  const standard: ComplianceKind[] = [
    { typeCode: '388', ksaCode: '0100000', label: 'standard-invoice' },
    { typeCode: '381', ksaCode: '0100000', label: 'standard-credit' },
    { typeCode: '383', ksaCode: '0100000', label: 'standard-debit' },
  ];
  if (invoiceType === '1000') return standard;
  if (invoiceType === '0100') return simplified;
  return [...simplified, ...standard];
}

export function dummyBuyerVat(sellerVat: string) {
  return sellerVat === '399999999900003' ? '399999999800003' : '399999999900003';
}

export function usesStandardClearance(invoiceType: string) {
  return invoiceType === '1000';
}

export async function sendComplianceInvoices(d: {
  id: string;
  tenantId: string;
  environment: string;
  privateKeyPem: string;
  orgName: string;
  vatNumber: string;
  crNumber: string | null;
  street: string;
  buildingNumber: string;
  cityName: string;
  postalZone: string;
  district: string;
  ccsidToken: string;
  ccsidSecret: string;
  invoiceType: string;
}) {
  const types = complianceTypesFor(d.invoiceType || '1000');
  const results: { label: string; ok: boolean; status: number; data: any }[] = [];
  let pih = FIRST_PIH;
  let icv = 0;
  for (const t of types) {
    icv += 1;
    const now = new Date();
    const sealed = await stampInvoice({
      privateKeyPem: d.privateKeyPem,
      sellerName: d.orgName,
      vatNumber: d.vatNumber,
      certificateToken: d.ccsidToken,
      doc: {
        id: `CMP-${t.label}-${icv}`,
        uuid: newUuid(),
        issueDate: now.toISOString().slice(0, 10),
        issueTime: `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}:${pad2(now.getUTCSeconds())}`,
        typeCode: t.typeCode,
        ksaCode: t.ksaCode,
        currency: 'SAR',
        icv,
        pih,
        seller: {
          name: d.orgName, vat: d.vatNumber, crn: d.crNumber || d.vatNumber,
          street: d.street, building: d.buildingNumber, city: d.cityName, postal: d.postalZone, district: d.district,
        },
        buyer: { name: 'Compliance Buyer', vat: t.ksaCode.startsWith('01') ? dummyBuyerVat(d.vatNumber) : undefined },
        billingRef: t.typeCode === '388' ? undefined : 'CMP-PREV',
        lines: [{ name: 'Compliance item', qty: 1, price: 100, lineNet: 100, vat: 15, lineGross: 115 }],
        subtotal: 100, vat: 15, total: 115,
      },
    });
    const r = await zatcaApi.complianceInvoice(d.environment, d.ccsidToken, d.ccsidSecret, sealed.payload);
    await prisma.zatcaSubmission.create({
      data: {
        tenantId: d.tenantId, kind: 'COMPLIANCE', uuid: sealed.uuid, invoiceHash: sealed.invoiceHash,
        xml: sealed.xml, httpStatus: r.status, response: r.raw.slice(0, 20000).replace(/"secret"\s*:\s*"[^"]*"/gi, '"secret":"[redacted]"').replace(/"binarySecurityToken"\s*:\s*"[^"]*"/gi, '"binarySecurityToken":"[redacted]"'), status: r.ok ? 'OK' : 'FAILED',
      },
    });
    results.push({ label: t.label, ok: r.ok, status: r.status, data: r.data });
    if (r.ok) pih = sealed.invoiceHash;
  }
  const allOk = results.every((x) => x.ok);
  await prisma.zatcaDevice.update({
    where: { id: d.id },
    data: { status: allOk ? 'COMPLIANCE' : 'CCSID', lastError: allOk ? null : 'بعض فواتير الامتثال رُفضت — راجع السجل' },
  });
  return { allOk, results };
}
