import { randomUUID } from 'crypto';
import { buildUnsignedUblInvoice, UblDoc } from './xml';
import { fatooraSignAndRequest } from './sdk';

export function pad2(n: number) { return String(n).padStart(2, '0'); }

export async function stampInvoice(opts: {
  privateKeyPem: string;
  sellerName: string;
  vatNumber: string;
  certificateToken?: string | null;
  doc: UblDoc;
}) {
  if (!opts.certificateToken) {
    throw new Error('ZATCA certificate is required to sign with the official SDK');
  }
  const unsignedXml = buildUnsignedUblInvoice(opts.doc);
  const signed = await fatooraSignAndRequest({
    unsignedXml,
    certificateToken: opts.certificateToken,
    privateKeyPem: opts.privateKeyPem,
  });
  return {
    xml: signed.xml,
    invoiceHash: signed.invoiceHash,
    qr: signed.qr,
    uuid: signed.uuid || opts.doc.uuid,
    payload: signed.payload,
  };
}

export function newUuid() { return randomUUID(); }
