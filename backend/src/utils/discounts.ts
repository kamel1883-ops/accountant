import { prisma } from '../config/db';
import { PLANS, PlanCode } from '../modules/documents/plans';

export const normalizeCode = (c: unknown) => String(c || '').trim().toUpperCase().replace(/\s+/g, '');

export type DiscountResult =
  | { ok: true; id: string; code: string; amount: number; label: string }
  | { ok: false; error: string };

// يتحقق من الكود ويحسب قيمة الخصم على سعر الباقة (قبل الضريبة). لا يستهلك الكود — الاستهلاك عند التسجيل الفعلي.
export async function resolveDiscount(codeRaw: unknown, plan: PlanCode): Promise<DiscountResult> {
  const code = normalizeCode(codeRaw);
  if (!code) return { ok: false, error: 'أدخل كود الخصم' };
  const d = await prisma.discountCode.findUnique({ where: { code } });
  const invalid = { ok: false as const, error: 'كود الخصم غير صحيح أو غير متاح' };
  if (!d || !d.active) return invalid;
  const now = new Date();
  if (d.validFrom && d.validFrom > now) return { ok: false, error: 'كود الخصم لم يبدأ سريانه بعد' };
  if (d.validUntil && d.validUntil < now) return { ok: false, error: 'انتهت صلاحية كود الخصم' };
  if (d.maxUses !== null && d.usedCount >= d.maxUses) return { ok: false, error: 'تم استهلاك هذا الكود بالكامل' };
  if (d.plan && d.plan !== plan) return { ok: false, error: `هذا الكود خاص بالباقة ${PLANS[d.plan].nameAr}` };

  const price = PLANS[plan].price;
  const raw = d.type === 'PERCENT' ? (price * Number(d.value)) / 100 : Number(d.value);
  const amount = Math.min(price, Math.round(raw * 100) / 100);
  return { ok: true, id: d.id, code: d.code, amount, label: d.type === 'PERCENT' ? `${Number(d.value)}٪` : `${Number(d.value)} ر.س` };
}
