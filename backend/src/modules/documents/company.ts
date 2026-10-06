// بيانات الطرف الأول (الشركة المالكة للمنصة) — تُستخدم في عرض السعر والعقد.
// كل قيمة يمكن تجاوزها من ملف .env دون تعديل الكود.
export const COMPANY = {
  brandAr: 'جداره Finance',
  brandSubtitleAr: 'للمحاسبة المالية',
  legalNameAr: process.env.COMPANY_LEGAL_NAME || 'شركة مدى الإنجاز الحديث',
  unifiedNumber: process.env.COMPANY_UNIFIED_NUMBER || '7054695650',
  generalManager: process.env.COMPANY_GM_NAME || 'وليد حسن القروص',
  supportEmail: process.env.SUPPORT_EMAIL || 'info@jadara-finance.com',
  phone: process.env.COMPANY_PHONE || '0594700782',
  bank: {
    nameAr: process.env.BANK_NAME_AR || 'بنك إس تي سي STC Bank',
    beneficiary: process.env.BANK_BENEFICIARY || 'شركة مدى الإنجاز الحديث',
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || '1324441685',
    iban: process.env.BANK_IBAN || 'SA0778000000001324441685',
  },
};
