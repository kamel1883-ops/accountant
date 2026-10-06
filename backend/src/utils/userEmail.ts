import { prisma } from '../config/db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: unknown) {
  return String(raw || '').trim().toLowerCase();
}

export function digits(raw: unknown) {
  return String(raw || '').replace(/\D/g, '');
}

/** يستبدل بريد مستخدم ويُبقيّه على نفس المنشأة. إن كان مديراً وطلب الاشتراك على نفس الرقم الموحّد، يُنقل بريده معه. */
export async function replaceUserEmail(userId: string, tenantId: string, nextRaw: unknown) {
  const email = normalizeEmail(nextRaw);
  if (!EMAIL_RE.test(email)) return { error: 'أدخل بريداً صحيحاً' as const };

  const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, include: { tenant: true } });
  if (!user) return { error: 'المستخدم غير موجود' as const };
  if (user.email === email) return { user, unchanged: true as const };

  const taken = await prisma.user.findFirst({ where: { tenantId, email, NOT: { id: user.id } } });
  if (taken) return { error: 'هذا البريد مسجّل لمستخدم آخر في نفس المنشأة' as const };

  const customer = user.role === 'ADMIN'
    ? await prisma.customerAccount.findUnique({ where: { email: user.email }, include: { lead: true } })
    : null;
  const sameCompany = !!(customer && digits(customer.lead.unifiedNumber) === digits(user.tenant.unifiedNumber));
  if (sameCompany && customer) {
    const other = await prisma.customerAccount.findUnique({ where: { email } });
    if (other && other.id !== customer.id) {
      return { error: 'هذا البريد مستخدم في طلب منشأة أخرى. اختر بريداً مختلفاً.' as const };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.userEmailHistory.create({ data: { userId: user.id, email: user.email } });
    await tx.user.update({
      where: { id: user.id },
      data: { email, resetTokenHash: null, resetTokenExpires: null },
    });
    if (sameCompany && customer) {
      await tx.customerAccount.update({
        where: { id: customer.id },
        data: { email, resetTokenHash: null, resetTokenExpires: null },
      });
      if (normalizeEmail(customer.lead.email) === user.email) {
        await tx.lead.update({ where: { id: customer.leadId }, data: { email } });
      }
    }
  });

  const updated = await prisma.user.findUnique({ where: { id: user.id } });
  return { user: updated! };
}
