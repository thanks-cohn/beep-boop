import test from 'node:test';
import assert from 'node:assert/strict';
import { retryOperation, createRetrySession, fetchJsonWithRetry, isPermanentHttpStatus } from '../src/utils/retry.js';

function installOnline() {
  const listeners = new Map();
  global.navigator = { onLine: true };
  global.window = {
    addEventListener: (n, f) => (listeners.get(n) || listeners.set(n, new Set()).get(n)).add(f),
    removeEventListener: (n, f) => listeners.get(n)?.delete(f),
    dispatchEvent: e => listeners.get(e.type)?.forEach(f => f(e)),
  };
  return listeners;
}

for (const successAttempt of [1, 5, 10]) {
  test(`foreground recovery succeeds on attempt ${successAttempt} without assisted UI`, async () => {
    installOnline(); let calls = 0; const states = [];
    const value = await retryOperation(async () => { calls++; if (calls < successAttempt) throw Object.assign(new Error('HTTP 503'), { status: 503 }); return 'ok'; }, { retries: 10, profile: Array(10).fill(0), jitter: 0, onRetry: (_e, _a, state) => states.push(state) });
    assert.equal(value, 'ok'); assert.equal(calls, successAttempt); assert.ok(!states.includes('assisted-recovery'));
  });
}

test('assisted recovery appears only after foreground limit and background can succeed', async () => {
  installOnline(); let calls = 0; const session = createRetrySession();
  await assert.rejects(retryOperation(async () => { calls++; throw Object.assign(new Error('HTTP 503'), { status: 503 }); }, { session, retries: 3, profile: [0,0,0], jitter: 0 }));
  assert.equal(session.state, 'assisted-recovery');
  session.attempts = 0;
  const recovered = await retryOperation(async () => { calls++; return 'ok'; }, { session, retries: 1, profile: [0], jitter: 0 });
  assert.equal(recovered, 'ok'); assert.equal(session.attempts, 0);
});

test('dedupe prevents overlapping requests for same resource', async () => {
  installOnline(); let calls = 0; let release;
  global.fetch = async () => { calls++; await new Promise(r => { release = r; }); return { ok: true, json: async () => ({ ok: true }), headers: new Map() }; };
  const a = fetchJsonWithRetry('/same.json', { profile: [0], retries: 1 });
  const b = fetchJsonWithRetry('/same.json', { profile: [0], retries: 1 });
  await new Promise(resolve => setImmediate(resolve));
  release();
  assert.deepEqual(await a, { ok: true }); assert.deepEqual(await b, { ok: true }); assert.equal(calls, 1);
});

test('Retry-After delays are honored for 429', async () => {
  installOnline(); let waited = 0; const session = createRetrySession(); session.wait = async ms => { waited = ms; };
  let calls = 0;
  const value = await retryOperation(async () => { calls++; if (calls === 1) throw Object.assign(new Error('HTTP 429'), { status: 429, retryAfter: '2' }); return 'ok'; }, { session, retries: 2, profile: [0,0] });
  assert.equal(value, 'ok'); assert.equal(waited, 2000);
});

test('permanent errors stop retries', async () => {
  installOnline(); let calls = 0;
  await assert.rejects(retryOperation(async () => { calls++; throw Object.assign(new Error('HTTP 404'), { status: 404 }); }, { retries: 10, profile: Array(10).fill(0) }));
  assert.equal(calls, 1); assert.equal(isPermanentHttpStatus(404), true);
});

