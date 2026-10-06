// الوعاء الزكوي بطريقة "مصادر الأموال" (الطريقة غير المباشرة) المعتمدة من
// هيئة الزكاة والضريبة والجمارك للمكلَّفين الذين يحتفظون بدفاتر تجارية.
// المرجع: منشورات ZATCA عن المفاهيم الزكوية ولائحة قواعد حساب الزكاة.
//
// الوعاء = الإضافات - الحسميات
// الإضافات: رأس المال + الاحتياطيات + الأرباح المرحّلة + القروض طويلة الأجل + صافي الربح المعدّل
// الحسميات: صافي الأصول الثابتة (بعد خصم مجمع الإهلاك) + الاستثمارات طويلة الأجل وما في حكمها
//
// This is intentionally a pure function: it takes plain balances in, and returns
// numbers out, so it's easy to unit test and to extend with more excluded/included
// line items as your real chart of accounts grows (e.g. investments in subsidiaries,
// pre-operating/formation expenses).

export interface ZakatInputs {
  capital: number;
  reserves: number;
  retainedEarnings: number;
  longTermLoans: number;
  netProfit: number;
  fixedAssetsNet: number;
  longTermInvestments?: number;
}

export interface ZakatResult {
  additions: number;
  deductions: number;
  zakatBase: number;
  zakatDueHijri: number; // 2.5%
  zakatDueGregorian: number; // ~2.5779%
}

export const ZAKAT_RATE_HIJRI = 0.025;
export const ZAKAT_RATE_GREGORIAN = 0.025779;

export function calcZakatBase(inputs: ZakatInputs): ZakatResult {
  const additions =
    inputs.capital + inputs.reserves + inputs.retainedEarnings + inputs.longTermLoans + inputs.netProfit;
  const deductions = inputs.fixedAssetsNet + (inputs.longTermInvestments ?? 0);
  const zakatBase = Math.max(additions - deductions, 0);
  return {
    additions,
    deductions,
    zakatBase,
    zakatDueHijri: Math.round(zakatBase * ZAKAT_RATE_HIJRI * 100) / 100,
    zakatDueGregorian: Math.round(zakatBase * ZAKAT_RATE_GREGORIAN * 100) / 100,
  };
}
