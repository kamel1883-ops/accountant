const assert = require('assert');
const { splitAmounts, incomeRows } = require('../dist/utils/costCenterMath');

const parts = splitAmounts(10000, [
  { costCenterId: 'riyadh', percentage: 60 },
  { costCenterId: 'jeddah', percentage: 40 },
]);
assert.strictEqual(parts[0].amount, 6000);
assert.strictEqual(parts[1].amount, 4000);
assert.strictEqual(parts[0].amount + parts[1].amount, 10000);

const odd = splitAmounts(100, [
  { costCenterId: 'a', percentage: 33.33 },
  { costCenterId: 'b', percentage: 33.33 },
  { costCenterId: 'c', percentage: 33.34 },
]);
assert.strictEqual(Math.round((odd[0].amount + odd[1].amount + odd[2].amount) * 100) / 100, 100);

let threw = false;
try { splitAmounts(100, [{ costCenterId: 'a', percentage: 40 }, { costCenterId: 'b', percentage: 40 }]); }
catch (e) { threw = e.status === 400; }
assert.strictEqual(threw, true);

const rows = incomeRows([
  { centerId: 'riyadh', accountCode: '4101', subtype: 'SALES_REVENUE', debit: 0, credit: 150000 },
  { centerId: 'riyadh', accountCode: '5102', subtype: 'PURCHASES_COST', debit: 90000, credit: 0 },
  { centerId: 'riyadh', accountCode: '5201', subtype: 'OPERATING_EXPENSE', debit: 15000, credit: 0 },
  { centerId: 'riyadh', accountCode: '5202', subtype: 'OPERATING_EXPENSE', debit: 8000, credit: 0 },
  { centerId: 'jeddah', accountCode: '4101', subtype: 'SALES_REVENUE', debit: 0, credit: 100000 },
  { centerId: 'jeddah', accountCode: '5102', subtype: 'PURCHASES_COST', debit: 65000, credit: 0 },
  { centerId: 'jeddah', accountCode: '5201', subtype: 'OPERATING_EXPENSE', debit: 10000, credit: 0 },
  { centerId: 'jeddah', accountCode: '5202', subtype: 'OPERATING_EXPENSE', debit: 6000, credit: 0 },
  { centerId: 'riyadh', accountCode: '5290', subtype: 'OPERATING_EXPENSE', debit: 4000, credit: 0 },
  { centerId: 'jeddah', accountCode: '5290', subtype: 'OPERATING_EXPENSE', debit: 3000, credit: 0 },
]);
const riyadh = rows.find((r) => r.centerId === 'riyadh');
const jeddah = rows.find((r) => r.centerId === 'jeddah');
assert.strictEqual(riyadh.profit, 33000);
assert.strictEqual(jeddah.profit, 16000);
assert.strictEqual(riyadh.profit + jeddah.profit, 49000);

const transfer = incomeRows([
  { centerId: 'riyadh', accountCode: '1105', subtype: 'CURRENT_ASSET', debit: 0, credit: 5000 },
  { centerId: 'jeddah', accountCode: '1105', subtype: 'CURRENT_ASSET', debit: 5000, credit: 0 },
]);
assert.strictEqual(transfer.reduce((s, r) => s + r.profit, 0), 0);

console.log('cost-center tests ok');
