const assert = require('assert');
const { partyControl, canApply, vatTieOut, inventoryTieOut } = require('../dist/utils/partyControl');
const { bankPosition } = require('../dist/utils/reconcileMath');

const open = partyControl([
  { id: 'inv', party: 'هاني', kind: 'INVOICE', effect: 5000, date: '2026-10-01' },
  { id: 'rcpt', party: 'هاني', kind: 'SETTLEMENT', effect: -3000, date: '2026-10-02' },
]);
const hani = open.parties.find((p) => p.party === 'هاني');
assert.strictEqual(hani.net, 2000);
assert.strictEqual(hani.openInvoices[0].remaining, 5000);
assert.strictEqual(hani.settlements[0].unapplied, 3000);
assert.strictEqual(open.gl, 2000);
assert.strictEqual(open.tied, true);

assert.strictEqual(canApply(open.parties.flatMap(() => []), [], 'rcpt', 'inv', 3000), false);
const rows = [
  { id: 'inv', party: 'هاني', kind: 'INVOICE', effect: 5000, date: '2026-10-01' },
  { id: 'rcpt', party: 'هاني', kind: 'SETTLEMENT', effect: -3000, date: '2026-10-02' },
];
assert.strictEqual(canApply(rows, [], 'rcpt', 'inv', 3000), true);
const applied = partyControl(rows, [{ sourceId: 'rcpt', targetId: 'inv', amount: 3000 }]);
const after = applied.parties.find((p) => p.party === 'هاني');
assert.strictEqual(after.net, 2000);
assert.strictEqual(after.openInvoices[0].remaining, 2000);
assert.strictEqual(after.settlements[0].unapplied, 0);

const withLoose = partyControl([
  { id: 'a', party: 'عميل', kind: 'INVOICE', effect: 1000, date: '2026-10-01' },
  { id: 'b', party: null, kind: 'OTHER', effect: 250, date: '2026-10-01' },
]);
assert.strictEqual(withLoose.subledger, 1000);
assert.strictEqual(withLoose.unassigned, 250);
assert.strictEqual(withLoose.gl, 1250);
assert.strictEqual(withLoose.subledger + withLoose.unassigned, withLoose.gl);

const supplier = bankPosition({ bookBalance: 7500, externalClosing: 8000, book: [], external: [] });
assert.strictEqual(supplier.difference, -500);
assert.strictEqual(supplier.matched, false);

const stock = inventoryTieOut(20000, 19500);
assert.strictEqual(stock.difference, 500);
assert.strictEqual(stock.suggestion.debitAccount, '1105');
assert.strictEqual(stock.suggestion.creditAccount, '5302');
assert.strictEqual(stock.suggestion.amount, 500);
assert.strictEqual(stock.suggestion.posted, false);

const vat = vatTieOut({ outputGl: 1500, inputGl: 900, salesVat: 1500, purchaseVat: 900 });
assert.strictEqual(vat.tied, true);
assert.strictEqual(vat.net, 600);
const vatGap = vatTieOut({ outputGl: 1500, inputGl: 900, salesVat: 1400, purchaseVat: 900 });
assert.strictEqual(vatGap.outputDiff, 100);
assert.strictEqual(vatGap.tied, false);

console.log('party control tests ok');
