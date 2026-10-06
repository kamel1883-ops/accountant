export const KSA_VAT_RATE = 0.15;

export function calcVat(subtotal: number) {
  const vat = Math.round(subtotal * KSA_VAT_RATE * 100) / 100;
  const total = Math.round((subtotal + vat) * 100) / 100;
  return { vat, total };
}

export function quarterOf(date: Date) {
  return Math.ceil((date.getMonth() + 1) / 3);
}
