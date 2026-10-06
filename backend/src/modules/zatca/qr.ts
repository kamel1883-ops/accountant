import crypto from 'crypto';

export function buildZatcaTlvBase64(fields: {
  sellerName: string;
  vatNumber: string;
  timestampIso: string;
  totalWithVat: number;
  vatAmount: number;
  invoiceHash?: string;
  signature?: Buffer;
  publicKey?: Buffer;
  certificate?: Buffer;
}) {
  const tag = (t: number, value: Buffer | string) => {
    const valueBytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
    return Buffer.concat([Buffer.from([t, valueBytes.length]), valueBytes]);
  };
  const parts = [
    tag(1, fields.sellerName),
    tag(2, fields.vatNumber),
    tag(3, fields.timestampIso),
    tag(4, fields.totalWithVat.toFixed(2)),
    tag(5, fields.vatAmount.toFixed(2)),
  ];
  if (fields.invoiceHash) parts.push(tag(6, Buffer.from(fields.invoiceHash, 'base64')));
  if (fields.signature) parts.push(tag(7, fields.signature));
  if (fields.publicKey) parts.push(tag(8, fields.publicKey));
  if (fields.certificate) parts.push(tag(9, fields.certificate));
  return Buffer.concat(parts).toString('base64');
}

export function sha256Base64(data: string | Buffer) {
  return crypto.createHash('sha256').update(data).digest('base64');
}

export function signHashIeee(privateKeyPem: string, hashBase64: string) {
  const hash = Buffer.from(hashBase64, 'base64');
  return crypto.sign(null, hash, { key: privateKeyPem, dsaEncoding: 'ieee-p1363' });
}
