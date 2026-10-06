const assert = require('assert');
const { sessionStillValid } = require('../dist/middleware/sessionCheck.js');

const user = { id: 'u1', tenantId: 't1', tokenVersion: 0 };

assert.strictEqual(sessionStillValid({ userId: 'u1', tenantId: 't1', tokenVersion: 0 }, user), true);
assert.strictEqual(sessionStillValid({ userId: 'u1', tenantId: 't1' }, user), true);
assert.strictEqual(sessionStillValid({ userId: 'u1', tenantId: 't2', tokenVersion: 0 }, user), false);
assert.strictEqual(sessionStillValid({ userId: 'u2', tenantId: 't1', tokenVersion: 0 }, user), false);
assert.strictEqual(sessionStillValid({ userId: 'u1', tenantId: 't1', tokenVersion: 0 }, null), false);
assert.strictEqual(sessionStillValid({ userId: 'u1', tenantId: 't1', tokenVersion: 1 }, { ...user, tokenVersion: 2 }), false);
assert.strictEqual(sessionStillValid({ tenantId: 't1' }, user), false);

console.log('session-check ok');
