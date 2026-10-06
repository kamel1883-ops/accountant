export function digits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

/** الرقم الموحّد السعودي: 10 أرقام ويبدأ بـ 7. */
export function normalizeUnified(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const value = digits(raw);
  if (!/^7\d{9}$/.test(value)) {
    return { ok: false, error: 'الرقم الموحّد يجب أن يكون 10 أرقام ويبدأ بالرقم 7، بلا زيادة ولا نقص.' };
  }
  return { ok: true, value };
}

export const UNIFIED_TAKEN = 'بيانات هذا الحساب موجودة مسبقاً في منصة جداره، ولا يمكن إنشاء حساب جديد بهذا الرقم الموحّد.';
export const UNIFIED_HELD = 'لديك حساب ببيانات هذه المنشأة. أرجو التواصل مع جداره Finance لتفعيل وتنشيط حسابك.';
