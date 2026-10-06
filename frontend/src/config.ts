// مسار بوابة المالك. غيّره من VITE_OWNER_PATH إن أردت مساراً لا يعرفه غيرك (مثلاً /portal-x7k2).
// لا يوجد رابط لهذا المسار في صفحة الهبوط عمداً — تكتبه في المتصفح بنفسك.
export const OWNER_PATH = ((import.meta as any).env?.VITE_OWNER_PATH || '/owner-portal').replace(/\/$/, '');
