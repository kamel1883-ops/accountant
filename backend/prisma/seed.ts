import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

// حساب المالك الوحيد: يُنشأ من OWNER_EMAIL و OWNER_PASSWORD في .env فقط.
// أي مالك آخر موجود في قاعدة البيانات يُحذف، فلا يبقى في النظام إلا هذا البريد.
async function main() {
  const email = (process.env.OWNER_EMAIL || process.env.OWNER_SEED_EMAIL || '').trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD || process.env.OWNER_SEED_PASSWORD;
  if (!email || !password) {
    console.log('تخطّي إنشاء حساب المالك: عبّي OWNER_EMAIL و OWNER_PASSWORD في .env أولاً');
    return;
  }
  const existing = await prisma.owner.findUnique({ where: { email } });
  if (existing) {
    await prisma.owner.deleteMany({ where: { email: { not: email } } });
    console.log(`حساب المالك موجود مسبقاً — لم تُغيَّر كلمة المرور: ${email}`);
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.owner.create({ data: { email, passwordHash, name: 'مالك المنصة' } });
  const removed = await prisma.owner.deleteMany({ where: { email: { not: email } } });
  console.log(`حساب المالك جاهز: ${email}` + (removed.count ? ` (حُذف ${removed.count} حساب مالك آخر)` : ''));
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
