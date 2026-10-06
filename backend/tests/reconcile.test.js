const assert = require('assert');
const {
  autoMatch, bankPosition, bankSuggestions, cashPosition, cashSuggestion, parseStatementCsv, sumsMatch, ageBucket,
} = require('../dist/utils/reconcileMath');

const pairs = autoMatch(
  [{ id: 'b1', date: '2026-10-01', amount: 500, reference: 'TRX-9' }],
  [{ id: 'e1', date: '2026-10-02', amount: 500, reference: 'trx-9' }],
  3,
);
assert.strictEqual(pairs.length, 1);
assert.strictEqual(pairs[0].method, 'REF');

const fee = bankPosition({
  bookBalance: 10000,
  externalClosing: 9850,
  book: [],
  external: [{ id: 'fee', amount: -150, matched: false }],
});
assert.strictEqual(fee.rawDifference, 150);
assert.strictEqual(fee.unrecordedOut, 150);
assert.strictEqual(fee.adjustedBook, 9850);
assert.strictEqual(fee.adjustedExternal, 9850);
assert.strictEqual(fee.difference, 0);

const suggested = bankSuggestions([{ id: 'fee', amount: -150, description: 'رسوم بنك', matched: false }], '1102');
assert.strictEqual(suggested[0].debitAccount, '5301');
assert.strictEqual(suggested[0].creditAccount, '1102');
assert.strictEqual(suggested[0].amount, 150);
assert.strictEqual(suggested[0].amount, suggested.reduce((s, x) => s + x.amount, 0));

const after = bankPosition({
  bookBalance: 9850,
  externalClosing: 9850,
  book: [],
  external: [{ id: 'fee', amount: -150, matched: true }],
});
assert.strictEqual(after.difference, 0);
assert.strictEqual(after.matched, true);

const timing = bankPosition({
  bookBalance: 11000,
  externalClosing: 10000,
  book: [{ id: 'dep', amount: 1000, matched: false }],
  external: [],
});
assert.strictEqual(timing.depositsInTransit, 1000);
assert.strictEqual(timing.difference, 0);

const cash = cashPosition(500, 470);
assert.strictEqual(cash.shortage, 30);
const cashEntry = cashSuggestion(500, 470, '1101');
assert.strictEqual(cashEntry.debitAccount, '5302');
assert.strictEqual(cashEntry.creditAccount, '1101');
assert.strictEqual(cashEntry.amount, 30);

assert.strictEqual(sumsMatch([200, 300], [500]), true);
assert.strictEqual(sumsMatch([200], [150]), false);

const csv = parseStatementCsv('date,description,reference,amount\n2026-10-04,رسوم بنك,FEE,-150\n');
assert.strictEqual(csv[0].amount, -150);
assert.strictEqual(csv[0].reference, 'FEE');
const arabic = parseStatementCsv('التاريخ,البيان,مدين,دائن\n2026-10-04,رسوم,150,0\n');
assert.strictEqual(arabic[0].amount, -150);

assert.strictEqual(ageBucket('2026-09-01', '2026-10-04'), '31-60');

console.log('reconcile tests ok');
