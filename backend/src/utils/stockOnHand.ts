/** يرفض إخراج كمية أكبر من رصيد المستودع. أمر الشراء وطلب الشراء لا يزيدان هذا الرصيد. */
export async function assertOnHand(tx: any, productId: string, warehouseId: string, quantity: number) {
  const row = await tx.stockBalance.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } });
  const onHand = Number(row?.quantity || 0);
  if (onHand + 0.0001 >= quantity) return onHand;
  const product = await tx.product.findUnique({ where: { id: productId }, select: { nameAr: true } });
  const error = new Error(`الكمية غير متوفرة في المستودع للصنف ${product?.nameAr || ''}. المتاح ${onHand} والمطلوب ${quantity}. الكمية تُضاف عند اعتماد فاتورة المشتريات فقط.`);
  (error as Error & { status?: number }).status = 400;
  throw error;
}
