import { prisma } from '../config/db';

// يحوّل الاشتراكات المنتهية إلى EXPIRED (تجربة انتهت مدتها، أو اشتراك فعّال انتهى عقده).
// تُستدعى عند دخول المستخدمين ولوحة المالك، فلا نحتاج مهمة مجدولة في هذه المرحلة.
export async function syncExpiry() {
  const now = new Date();
  await prisma.subscription.updateMany({ where: { status: 'TRIAL', trialEndsAt: { lt: now } }, data: { status: 'EXPIRED' } });
  await prisma.subscription.updateMany({ where: { status: 'ACTIVE', endDate: { lt: now } }, data: { status: 'EXPIRED' } });
}
