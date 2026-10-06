import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/** يحذف منشأة وكل ما يتبعها حتى يتحرر الرقم الموحّد. لا يمس طلبات التسجيل. */
export async function wipeTenant(tx: Tx, tenantId: string) {
  const tickets = await tx.supportTicket.findMany({ where: { tenantId }, select: { id: true } });
  const ticketIds = tickets.map((t) => t.id);
  if (ticketIds.length) {
    const messages = await tx.supportMessage.findMany({ where: { ticketId: { in: ticketIds } }, select: { id: true } });
    const messageIds = messages.map((m) => m.id);
    if (messageIds.length) await tx.supportAttachment.deleteMany({ where: { messageId: { in: messageIds } } });
    await tx.supportMessage.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await tx.supportTicket.deleteMany({ where: { tenantId } });
  }

  const counts = await tx.stockCount.findMany({ where: { tenantId }, select: { id: true } });
  if (counts.length) await tx.stockCountLine.deleteMany({ where: { countId: { in: counts.map((c) => c.id) } } });
  await tx.stockCount.deleteMany({ where: { tenantId } });
  await tx.stockMovement.deleteMany({ where: { tenantId } });

  const products = await tx.product.findMany({ where: { tenantId }, select: { id: true } });
  if (products.length) await tx.stockBalance.deleteMany({ where: { productId: { in: products.map((p) => p.id) } } });

  const sales = await tx.salesDoc.findMany({ where: { tenantId }, select: { id: true } });
  if (sales.length) await tx.salesDocLine.deleteMany({ where: { docId: { in: sales.map((s) => s.id) } } });
  await tx.salesDoc.deleteMany({ where: { tenantId } });

  const purchases = await tx.purchaseDoc.findMany({ where: { tenantId }, select: { id: true } });
  if (purchases.length) await tx.purchaseDocLine.deleteMany({ where: { docId: { in: purchases.map((p) => p.id) } } });
  await tx.purchaseDoc.deleteMany({ where: { tenantId } });

  await tx.voucher.deleteMany({ where: { tenantId } });
  await tx.treasury.deleteMany({ where: { tenantId } });

  const entries = await tx.journalEntry.findMany({ where: { tenantId }, select: { id: true } });
  if (entries.length) await tx.journalLine.deleteMany({ where: { entryId: { in: entries.map((e) => e.id) } } });
  await tx.journalEntry.deleteMany({ where: { tenantId } });

  await tx.zatcaSubmission.deleteMany({ where: { tenantId } });
  await tx.zatcaAudit.deleteMany({ where: { tenantId } });
  await tx.zatcaDevice.deleteMany({ where: { tenantId } });
  await tx.invoice.deleteMany({ where: { tenantId } });
  await tx.payment.deleteMany({ where: { tenantId } });
  await tx.saleDiscountCode.deleteMany({ where: { tenantId } });
  await tx.product.deleteMany({ where: { tenantId } });
  await tx.warehouse.deleteMany({ where: { tenantId } });
  await tx.unit.deleteMany({ where: { tenantId } });
  await tx.productCategory.deleteMany({ where: { tenantId } });
  await tx.fiscalYear.deleteMany({ where: { tenantId } });
  await tx.account.deleteMany({ where: { tenantId } });

  const users = await tx.user.findMany({ where: { tenantId }, select: { id: true } });
  if (users.length) await tx.userEmailHistory.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await tx.auditLog.deleteMany({ where: { tenantId } });
  await tx.user.deleteMany({ where: { tenantId } });
  await tx.branch.deleteMany({ where: { tenantId } });
  await tx.subscription.deleteMany({ where: { tenantId } });
  await tx.tenant.delete({ where: { id: tenantId } });
}
