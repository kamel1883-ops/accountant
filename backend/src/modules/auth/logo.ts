const MAX_BYTES = 400 * 1024;

/** يقبل PNG أو JPEG أو WEBP فقط، بعد مطابقة نوع الملف مع البايتات. */
export function parseLogo(input: unknown): { mime: string; bytes: Buffer } | { error: string } {
  const raw = String(input || '').trim();
  const m = raw.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!m) return { error: 'اختر صورة PNG أو JPG أو WEBP من جهازك.' };
  const mime = m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase();
  let bytes: Buffer;
  try { bytes = Buffer.from(m[2].replace(/\s/g, ''), 'base64'); }
  catch { return { error: 'تعذّر قراءة الصورة.' }; }
  if (bytes.length < 32 || bytes.length > MAX_BYTES) return { error: 'حجم الشعار يجب أن يكون أقل من 400 ك.ب.' };
  if (!matches(mime, bytes)) return { error: 'الملف ليس صورة صالحة.' };
  return { mime, bytes };
}

function matches(mime: string, b: Buffer) {
  if (mime === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (mime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === 'image/webp') return b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP';
  return false;
}

export function logoDataUrl(mime?: string | null, data?: Buffer | Uint8Array | null) {
  if (!mime || !data || !data.length) return null;
  return `data:${mime};base64,${Buffer.from(data).toString('base64')}`;
}
