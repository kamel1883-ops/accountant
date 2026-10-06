const DUMMY_VAT = new Set(['399999999800003', '399999999900003']);

/** رقم ضريبي سعودي صالح للإرسال: 15 رقماً، يبدأ وينتهي بـ 3. */
export function isKsaVatNumber(raw: unknown) {
  const v = String(raw || '').replace(/\s/g, '');
  return /^\d{15}$/.test(v) && v.startsWith('3') && v.endsWith('3') ? v : '';
}
const BAD_UNIT = /^(main branch|riyadh branch)$/i;
const BAD_STREET = /king fahd/i;

export type TaxpayerInput = {
  environment?: string;
  vatNumber?: string;
  orgName?: string;
  orgUnit?: string;
  cityName?: string;
  district?: string;
  street?: string;
  buildingNumber?: string;
  postalZone?: string;
  businessCategory?: string;
  crNumber?: string;
  registeredAddress?: string;
};

export function parseTaxpayer(b: TaxpayerInput, env: string) {
  const vat = String(b.vatNumber || '').replace(/\s/g, '');
  const orgName = String(b.orgName || '').trim();
  const orgUnit = String(b.orgUnit || '').trim();
  const cityName = String(b.cityName || '').trim();
  const district = String(b.district || '').trim();
  const street = String(b.street || '').trim();
  const buildingNumber = String(b.buildingNumber || '').trim();
  const postalZone = String(b.postalZone || '').trim();
  const businessCategory = String(b.businessCategory || '').trim();
  const crNumber = b.crNumber ? String(b.crNumber).trim() : '';
  const fail = (error: string) => ({ ok: false as const, error });

  if (!/^\d{15}$/.test(vat)) return fail('الرقم الضريبي يجب أن يكون 15 رقماً');
  if (!/^3/.test(vat)) return fail('الرقم الضريبي السعودي يبدأ بـ 3');
  if (env !== 'sandbox' && DUMMY_VAT.has(vat)) {
    return fail('لا يُستخدم الرقم الضريبي التجريبي إلا في ساندبوكس المطوّرين');
  }
  if (!orgName) return fail('أدخل الاسم القانوني للمنشأة كما في الهيئة');
  if (!orgUnit) return fail('أدخل اسم الفرع أو وحدة الفوترة الحقيقي');
  if (BAD_UNIT.test(orgUnit)) return fail('لا تستخدم Main Branch — اكتب اسم الفرع الفعلي');
  if (!cityName) return fail('أدخل المدينة كما في العنوان الوطني');
  if (!district) return fail('أدخل الحي');
  if (!street) return fail('أدخل اسم الشارع');
  if (BAD_STREET.test(street) && (buildingNumber === '1234' || !buildingNumber)) {
    return fail('لا تستخدم عنوان الشارع الافتراضي — أدخل عنوان المنشأة الوطني');
  }
  if (!buildingNumber) return fail('أدخل رقم المبنى في العنوان الوطني');
  if (!/^\d{5}$/.test(postalZone)) return fail('الرمز البريدي يجب أن يكون 5 أرقام');
  if (postalZone === '12345' && BAD_STREET.test(street)) {
    return fail('أكمل العنوان الوطني الحقيقي قبل توليد الشهادة');
  }
  if (!businessCategory) return fail('أدخل نشاط المنشأة');

  return {
    ok: true as const,
    vat,
    orgName,
    orgUnit,
    cityName,
    district,
    street,
    buildingNumber,
    postalZone,
    businessCategory,
    crNumber: crNumber || null,
    registeredAddress: String(b.registeredAddress || cityName).trim(),
  };
}

export function requireOtp(env: string, raw: unknown): { ok: true; otp: string } | { ok: false; error: string } {
  const otp = String(raw || '').trim();
  if (env === 'sandbox' && !otp) return { ok: true, otp: '123345' };
  if (env !== 'sandbox' && (otp === '123345' || otp === '123456')) {
    return { ok: false, error: 'رمز التجربة لا يُستخدم في المحاكاة أو الإنتاج. أدخل OTP من بوابة فاتورة لهذه المنشأة.' };
  }
  if (!otp) return { ok: false, error: 'أدخل رمز OTP من بوابة المكلف / منصة فاتورة. الرمز لمرة واحدة ولا يُحفظ.' };
  return { ok: true, otp };
}
