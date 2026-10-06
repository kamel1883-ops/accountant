import { Prisma } from '@prisma/client';
import { digits, UNIFIED_HELD, UNIFIED_TAKEN } from './unifiedNumber';

type Db = Prisma.TransactionClient | typeof import('../config/db').prisma;

export async function dropLead(tx: Db, leadId: string) {
  const lead = await tx.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  if (lead.discountCode) {
    const code = await tx.discountCode.findUnique({ where: { code: lead.discountCode } });
    if (code && code.usedCount > 0) {
      await tx.discountCode.update({ where: { id: code.id }, data: { usedCount: { decrement: 1 } } });
    }
  }
  await tx.quote.deleteMany({ where: { leadId } });
  await tx.contract.deleteMany({ where: { leadId } });
  await tx.serviceInvoice.deleteMany({ where: { leadId } });
  await tx.customerAccount.deleteMany({ where: { leadId } });
  await tx.lead.delete({ where: { id: leadId } });
}

/** طلب لم يُؤكَّد بعد لا يحجز الرقم الموحّد. يُحذف حتى يستطيع صاحبه التسجيل من جديد. */
export async function dropPendingByIdentity(tx: Db, unified: string, email: string) {
  const leads = await tx.lead.findMany({
    where: { status: { not: 'converted' } },
    select: { id: true, unifiedNumber: true, email: true },
  });
  for (const lead of leads) {
    if (digits(lead.unifiedNumber) === unified || lead.email.toLowerCase() === email) {
      await dropLead(tx, lead.id);
    }
  }
}

export async function unifiedBlock(tx: Db, unified: string): Promise<string | null> {
  const tenants = await tx.tenant.findMany({
    select: { unifiedNumber: true, subscription: { select: { status: true } } },
  });
  const hit = tenants.find((t) => digits(t.unifiedNumber) === unified);
  if (!hit) return null;
  return hit.subscription?.status === 'ACTIVE' ? UNIFIED_TAKEN : UNIFIED_HELD;
}
