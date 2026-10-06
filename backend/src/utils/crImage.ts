const MAX_BYTES = 4 * 1024 * 1024;

export function parseCrImage(input: unknown, filename?: unknown): { mime: string; bytes: Buffer; filename: string } | { error: string } {
  const raw = String(input || '').trim();
  const m = raw.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!m) return { error: 'أرفق صورة السجل التجاري (PNG أو JPG أو WEBP). بدونها لا يُقبل الطلب.' };
  const mime = m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase();
  let bytes: Buffer;
  try { bytes = Buffer.from(m[2].replace(/\s/g, ''), 'base64'); }
  catch { return { error: 'تعذّر قراءة صورة السجل التجاري.' }; }
  if (bytes.length < 32) return { error: 'صورة السجل التجاري غير صالحة.' };
  if (bytes.length > MAX_BYTES) return { error: 'صورة السجل التجاري أكبر من 4 ميجا.' };
  if (!matches(mime, bytes)) return { error: 'الملف ليس صورة صالحة للسجل التجاري.' };
  const name = String(filename || 'commercial-register').replace(/[^\w.\u0600-\u06FF-]+/g, '_').slice(0, 80);
  return { mime, bytes, filename: name || 'commercial-register' };
}

function matches(mime: string, b: Buffer) {
  if (mime === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (mime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === 'image/webp') return b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP';
  return false;
}
