/**
 * تجربة حية على بوابة المطوّرين (developer-portal) بـ OTP التجريبي 123345.
 * لا تحتاج حساب فاتورة للمنشأة. شغّل من مجلد backend:
 *   npx ts-node --transpile-only scripts/zatca-sandbox-smoke.ts
 */
import { randomUUID } from 'crypto';
import 'dotenv/config';
import { generateCsr } from '../src/modules/zatca/csr';
import { zatcaApi } from '../src/modules/zatca/client';
import { stampInvoice, newUuid, pad2 } from '../src/modules/zatca/sign';
import { FIRST_PIH } from '../src/modules/zatca/env';

const VAT = '399999999900003';
const OTP = '123345';
const ORG = 'Jadara Finance Sandbox';

async function main() {
  const serial = `1-Jadara|2-EGS|3-${randomUUID()}`;
  console.log('1) CSR...');
  const csr = await generateCsr({
    vatNumber: VAT,
    orgName: ORG,
    orgUnit: 'Riyadh Branch',
    commonName: 'TSTZATCA-Code-Signing',
    serialNumber: serial,
    registeredAddress: 'Riyadh',
    businessCategory: 'Supply activities',
    invoiceType: '1000',
    environment: 'sandbox',
  });
  const csrB64 = Buffer.from(csr.csrPem, 'utf8').toString('base64');

  console.log('2) CCSID OTP', OTP);
  const ccsid = await zatcaApi.complianceCsid('sandbox', csrB64, OTP);
  console.log('   HTTP', ccsid.status, ccsid.ok ? 'OK' : JSON.stringify(ccsid.data).slice(0, 800));
  if (!ccsid.ok) process.exit(2);

  const token = ccsid.data.binarySecurityToken;
  const secret = ccsid.data.secret;
  const reqId = String(ccsid.data.requestID || ccsid.data.requestId || '');

  const types: { typeCode: '388' | '381' | '383'; ksaCode: string; label: string }[] = [
    { typeCode: '388', ksaCode: '0100000', label: 'standard-invoice' },
    { typeCode: '381', ksaCode: '0100000', label: 'standard-credit' },
    { typeCode: '383', ksaCode: '0100000', label: 'standard-debit' },
  ];

  console.log('3) compliance invoices...');
  let pih = FIRST_PIH;
  let icv = 0;
  let allOk = true;
  for (const t of types) {
    icv += 1;
    const now = new Date();
    const sealed = await stampInvoice({
      privateKeyPem: csr.privateKeyPem,
      sellerName: ORG,
      vatNumber: VAT,
      certificateToken: token,
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
          name: ORG, vat: VAT, crn: '1010010000',
          street: 'King Fahd Rd', building: '1234', city: 'Riyadh', postal: '12345', district: 'Al Olaya',
        },
        buyer: { name: 'Compliance Buyer', vat: t.ksaCode.startsWith('01') ? '399999999800003' : undefined },
        billingRef: t.typeCode === '388' ? undefined : 'CMP-PREV',
        lines: [{ name: 'Compliance item', qty: 1, price: 100, lineNet: 100, vat: 15, lineGross: 115 }],
        subtotal: 100, vat: 15, total: 115,
      },
    });
    const r = await zatcaApi.complianceInvoice('sandbox', token, secret, sealed.payload);
    console.log('  ', t.label, r.status, r.ok ? 'OK' : JSON.stringify((r.data && r.data.validationResults) || r.data).slice(0, 1200));
    if (!r.ok) allOk = false;
    else pih = sealed.invoiceHash;
  }
  if (!allOk) process.exit(3);

  console.log('4) PCSID requestId', reqId);
  const pcsid = await zatcaApi.productionCsid('sandbox', token, secret, reqId);
  console.log('   HTTP', pcsid.status, pcsid.ok ? 'OK' : JSON.stringify(pcsid.data).slice(0, 800));
  if (!pcsid.ok) process.exit(4);

  console.log('5) clearance test invoice...');
  const now = new Date();
  icv += 1;
  const sealed = await stampInvoice({
    privateKeyPem: csr.privateKeyPem,
    sellerName: ORG,
    vatNumber: VAT,
    certificateToken: pcsid.data.binarySecurityToken,
    doc: {
      id: `TST-${now.getFullYear()}-${String(icv).padStart(6, '0')}`,
      uuid: newUuid(),
      issueDate: now.toISOString().slice(0, 10),
      issueTime: `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}:${pad2(now.getUTCSeconds())}`,
      typeCode: '388',
      ksaCode: '0100000',
      currency: 'SAR',
      icv,
      pih,
      seller: {
        name: ORG, vat: VAT, crn: '1010010000',
        street: 'King Fahd Rd', building: '1234', city: 'Riyadh', postal: '12345', district: 'Al Olaya',
      },
      buyer: { name: 'Compliance Buyer', vat: '399999999800003' },
      lines: [{ name: 'Test item', qty: 1, price: 100, lineNet: 100, vat: 15, lineGross: 115 }],
      subtotal: 100, vat: 15, total: 115,
    },
  });
  const cleared = await zatcaApi.clear('sandbox', pcsid.data.binarySecurityToken, pcsid.data.secret, sealed.payload);
  console.log('   HTTP', cleared.status, cleared.ok ? 'CLEARED' : JSON.stringify(cleared.data).slice(0, 800));
  if (!cleared.ok) process.exit(5);

  console.log('\nSANDBOX_OK — CCSID + 3 standard compliance + PCSID + clearance');
}

main().catch((e) => { console.error(e); process.exit(1); });
