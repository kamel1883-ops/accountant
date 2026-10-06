import dotenv from 'dotenv';
dotenv.config();

import { app } from './app';
import { startZatcaNightlyRetry } from './modules/zatca/guard';
import { alignAllTenants } from './utils/perpetual';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL غير معرّف في backend/.env');
  process.exit(1);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET يجب أن يكون نصاً عشوائياً بطول 16 حرفاً على الأقل في backend/.env');
  process.exit(1);
}

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`جداره للمحاسبة API يعمل على المنفذ ${port}`);
  startZatcaNightlyRetry();
  alignAllTenants().catch((error) => console.error('تعذّر مواءمة الجرد المستمر', error));
});
