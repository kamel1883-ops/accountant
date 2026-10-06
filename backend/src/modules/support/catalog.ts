export const TICKET_CATEGORIES = [
  { id: 'PRINT', label: 'عدم طباعة الفواتير أو المستندات' },
  { id: 'SALES', label: 'مشاكل المبيعات أو نقطة البيع' },
  { id: 'PURCHASES', label: 'مشاكل المشتريات' },
  { id: 'INVENTORY', label: 'المخزون أو الجرد أو المستودعات' },
  { id: 'ACCOUNTING', label: 'القيود اليومية أو القوائم أو ميزان المراجعة' },
  { id: 'VAT', label: 'الضريبة أو الزكاة أو الفوترة الإلكترونية' },
  { id: 'LOGIN', label: 'الدخول أو الصلاحيات أو المستخدمين' },
  { id: 'BILLING', label: 'الاشتراك أو الباقة أو الفوترة علينا' },
  { id: 'OTHER', label: 'مشكلة أخرى' },
] as const;

export function categoryLabel(id: string) {
  return TICKET_CATEGORIES.find((c) => c.id === id)?.label || id;
}

export const REQUEST_KINDS = [
  { id: 'documents', label: 'إرفاق مستندات' },
  { id: 'screenshot', label: 'إرفاق صورة للخلل' },
  { id: 'info', label: 'تزويدنا بمعلومات إضافية' },
] as const;

export function requestKindLabel(id?: string | null) {
  if (!id) return null;
  return REQUEST_KINDS.find((k) => k.id === id)?.label || id;
}
