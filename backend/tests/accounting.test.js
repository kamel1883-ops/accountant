// اختبار محرّك الحسابات على بيانات وهمية: يتحقق من توازن الميزان والمعادلة المحاسبية والقوائم
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const COA = require('./coa.json');
const isDebitNature = (type, subtype) => {
  if (subtype === 'CONTRA_ASSET') return false;
  if (subtype === 'DRAWINGS') return true;
  if (subtype === 'SALES_RETURNS') return true;
  if (subtype === 'PURCHASE_RETURNS') return false;
  return type === 'ASSET' || type === 'PURCHASES';
};
const meta = Object.fromEntries(COA.map(a => [a.code, a]));

// قيود اختبار
const entries = [
  { d: '2026-01-01', k: 'OPENING', lines: [['1101', 50000, 0], ['1102', 200000, 0], ['1105', 80000, 0], ['1202', 150000, 0], ['1290', 0, 30000], ['2101', 0, 40000], ['2201', 0, 100000], ['3101', 0, 300000], ['3103', 0, 10000]] },
  { d: '2026-03-10', lines: [['1103', 11500, 0], ['4101', 0, 10000], ['2102', 0, 1500]] },
  { d: '2026-03-15', lines: [['5101', 6000, 0], ['1106', 900, 0], ['2101', 0, 6900]] },
  { d: '2026-04-01', lines: [['5201', 12000, 0], ['5202', 5000, 0], ['5203', 800, 0], ['5204', 300, 0], ['1101', 0, 18100]] },
  { d: '2026-04-20', lines: [['1102', 11500, 0], ['1103', 0, 11500]] },
  { d: '2026-05-05', lines: [['4201', 500, 0], ['2102', 75, 0], ['1103', 0, 575]] },
  { d: '2026-06-01', lines: [['5210', 3000, 0], ['1290', 0, 3000]] },
  { d: '2026-06-15', lines: [['1101', 23000, 0], ['4103', 0, 20000], ['2102', 0, 3000]] },
  { d: '2026-07-01', lines: [['3105', 5000, 0], ['1101', 0, 5000]] },
  { d: '2026-08-01', lines: [['1202', 40000, 0], ['1102', 0, 40000]] },
];

let fail = 0;
const check = (name, cond, extra='') => { console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (extra ? ' | ' + extra : '')); if (!cond) fail++; };

// 1) كل قيد متوازن
entries.forEach((e, i) => {
  const d = round2(e.lines.reduce((s, l) => s + l[1], 0)), c = round2(e.lines.reduce((s, l) => s + l[2], 0));
  check(`القيد ${i + 1} متوازن`, Math.abs(d - c) < 0.005, `مدين ${d} دائن ${c}`);
});

// 2) بناء الأرصدة
const bal = {};
for (const a of COA) bal[a.code] = { d: 0, c: 0 };
for (const e of entries) for (const [code, d, c] of e.lines) { bal[code].d += d; bal[code].c += c; }
const balance = code => { const m = meta[code], b = bal[code]; return round2((b.d - b.c) * (isDebitNature(m.type, m.subtype) ? 1 : -1)); };
const sumSub = (...subs) => round2(COA.filter(a => subs.includes(a.subtype)).reduce((s, a) => s + balance(a.code), 0));
const CONTRA = ['CONTRA_ASSET','SALES_RETURNS','PURCHASE_RETURNS'];
const sumType = t => round2(COA.filter(a => a.type === t && !a.group).reduce((s, a) => s + (CONTRA.includes(a.subtype) ? -balance(a.code) : balance(a.code)), 0));
const sumEquity = () => round2(COA.filter(a => a.type === 'EQUITY' && !a.group).reduce((s, a) => s + (a.subtype === 'DRAWINGS' ? -balance(a.code) : balance(a.code)), 0));

const td = round2(Object.values(bal).reduce((s, b) => s + b.d, 0)), tc = round2(Object.values(bal).reduce((s, b) => s + b.c, 0));
check('ميزان المراجعة متوازن', Math.abs(td - tc) < 0.01, `مدين ${td} = دائن ${tc}`);

// 3) قائمة الدخل
const sales = sumSub('SALES_REVENUE'), salesRet = sumSub('SALES_RETURNS'), netSales = round2(sales - salesRet);
const cogs = round2(sumSub('PURCHASES_COST') - sumSub('PURCHASE_RETURNS'));
const gross = round2(netSales - cogs);
const opex = sumSub('OPERATING_EXPENSE', 'DEPRECIATION');
const netProfit = round2(gross - opex + sumSub('OTHER_INCOME') - sumSub('OTHER_EXPENSE'));
check('صافي المبيعات', netSales === 29500, `${sales} - ${salesRet} = ${netSales}`);
check('مجمل الربح', gross === round2(29500 - 6000), `${gross}`);
check('المصروفات التشغيلية', opex === 21100, `${opex}`);
check('صافي الربح', netProfit === round2(23500 - 21100), `${netProfit}`);
check('صافي الربح = الإيرادات - المصروفات', netProfit === round2(sumType('SALES') - sumType('PURCHASES')));

// 4) المركز المالي
const assets = sumType('ASSET'), liab = sumType('LIABILITY'), eqPosted = sumEquity();
const equity = round2(eqPosted + netProfit);
check('معادلة المركز المالي: الأصول = الخصوم + حقوق الملكية',
  Math.abs(assets - (liab + equity)) < 0.01, `${assets} = ${liab} + ${equity}`);

// 5) التدفقات النقدية
const cashNow = sumSub('CASH');
const openingCash = 250000;
const depreciation = balance('5210');
const wcAssets = -round2(balance('1103') + balance('1105') + balance('1106') + balance('1107') + balance('1108') - 80000);
const wcLiab = round2(sumSub('CURRENT_LIABILITY') - 40000);
const operating = round2(netProfit + depreciation + wcAssets + wcLiab);
const investing = round2(-(sumSub('NON_CURRENT_ASSET') - 150000));
const financing = round2((sumSub('CAPITAL') - 300000) + (sumSub('NON_CURRENT_LIABILITY') - 100000) - sumSub('DRAWINGS'));
const netChange = round2(operating + investing + financing);
check('التدفقات النقدية تطابق حركة النقدية الفعلية',
  Math.abs(netChange - round2(cashNow - openingCash)) < 0.01, `محسوب ${netChange} فعلي ${round2(cashNow - openingCash)}`);

// 6) الإقفال يصفّر المبيعات والمشتريات
const closing = [];
for (const a of COA.filter(a => !a.group && (a.type === 'SALES' || a.type === 'PURCHASES'))) {
  const b = balance(a.code); if (Math.abs(b) < 0.005) continue;
  const dn = a.type === 'PURCHASES' ? a.subtype !== 'PURCHASE_RETURNS' : a.subtype === 'SALES_RETURNS';
  closing.push(dn ? [a.code, 0, b] : [a.code, b, 0]);
}
closing.push(netProfit >= 0 ? ['3104', 0, netProfit] : ['3104', -netProfit, 0]);
const cd = round2(closing.reduce((s, l) => s + l[1], 0)), cc = round2(closing.reduce((s, l) => s + l[2], 0));
check('قيد الإقفال متوازن', Math.abs(cd - cc) < 0.01, `مدين ${cd} دائن ${cc}`);
for (const [code, d, c] of closing) { bal[code].d += d; bal[code].c += c; }
const afterSales = sumType('SALES'), afterPurch = sumType('PURCHASES');
check('حسابات المبيعات صُفِّرت بعد الإقفال', Math.abs(afterSales) < 0.01, `${afterSales}`);
check('حسابات المشتريات صُفِّرت بعد الإقفال', Math.abs(afterPurch) < 0.01, `${afterPurch}`);
check('الأرباح رُحِّلت لحقوق الملكية', Math.abs(sumEquity() - equity) < 0.01, `${sumEquity()} = ${equity}`);
const td2 = round2(Object.values(bal).reduce((s, b) => s + b.d, 0)), tc2 = round2(Object.values(bal).reduce((s, b) => s + b.c, 0));
check('الميزان متوازن بعد الإقفال', Math.abs(td2 - tc2) < 0.01);
check('المعادلة المحاسبية سليمة بعد الإقفال', Math.abs(sumType('ASSET') - (sumType('LIABILITY') + sumEquity())) < 0.01, `${sumType('ASSET')} = ${sumType('LIABILITY')} + ${sumEquity()}`);

console.log(fail === 0 ? '\n✅ كل الاختبارات نجحت' : `\n❌ ${fail} اختبار فشل`);
process.exit(fail ? 1 : 0);
