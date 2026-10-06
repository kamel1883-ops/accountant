import { prisma } from '../../config/db';
import crypto from 'crypto';

const PREFIX = 'j1.';

function keyBuf() {
  const s = process.env.ZATCA_SECRETS_KEY || process.env.JWT_SECRET || 'jadara-zatca-local';
  return crypto.createHash('sha256').update(s).digest();
}

export function protect(plain?: string | null) {
  if (!plain) return plain ?? null;
  if (plain.startsWith(PREFIX)) return plain;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyBuf(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

export function reveal(stored?: string | null) {
  if (!stored) return stored ?? null;
  if (!stored.startsWith(PREFIX)) return stored;
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', keyBuf(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

const SECRET_KEYS = ['privateKeyPem', 'ccsidSecret', 'pcsidSecret', 'ccsidToken', 'pcsidToken'] as const;

export function protectDevice(data: Record<string, any>) {
  const out: Record<string, any> = { ...data };
  for (const k of SECRET_KEYS) {
    if (out[k]) out[k] = protect(out[k]);
  }
  return out;
}

export function revealDevice(d: Record<string, any>) {
  const out: Record<string, any> = { ...d };
  for (const k of SECRET_KEYS) {
    if (out[k]) out[k] = reveal(out[k]);
  }
  return out;
}

export async function loadZatcaDevice(tenantId: string) {
  const d = await prisma.zatcaDevice.findUnique({ where: { tenantId } });
  return d ? revealDevice(d) : null;
}

export async function loadZatcaDeviceById(id: string) {
  const d = await prisma.zatcaDevice.findUnique({ where: { id } });
  return d ? revealDevice(d) : null;
}
