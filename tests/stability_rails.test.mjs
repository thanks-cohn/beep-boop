import test from 'node:test';
import assert from 'node:assert/strict';
import { retryOperation, createRetrySession, RetryCancelledError } from '../src/utils/retry.js';
import { enhanceRail, railDiagnostics } from '../src/components/rail.js';
import { spawnSync } from 'node:child_process';

function installWindow() {
  const listeners = new Map();
  global.navigator = { onLine: true };
  global.document = { createElement: tag => ({ tag, className: "", setAttribute(){}, append(){}, classList:{ add(){} } }) };
  global.window = {
    innerHeight: 1000, scrollY: 0,
    addEventListener: (n, f) => (listeners.get(n) || listeners.set(n, new Set()).get(n)).add(f),
    removeEventListener: (n, f) => listeners.get(n)?.delete(f),
    dispatchEvent: e => listeners.get(e.type)?.forEach(f => f(e)),
  };
  global.requestAnimationFrame = fn => { fn(); return 1; };
  global.cancelAnimationFrame = () => {};
  return listeners;
}
function fakeRail() {
  const style = { writes: 0, values: {}, setProperty(k,v){ this.writes++; this.values[k]=v; }, removeProperty(k){ delete this.values[k]; } };
  const classList = { add(){}, remove(){} };
  const parentNode = { insertBefore(){} };
  const iframes = [{ src: 'https://ad.test/a', dataset:{}, parentNode, addEventListener(){} }, { src: 'https://ad.test/b', dataset:{}, parentNode, addEventListener(){} }];
  return { dataset:{}, classList, style, isConnected:true, children:[{}, {}, {}], querySelectorAll: sel => sel.includes('iframe') ? iframes : [] };
}

test('transient retry succeeds without duplicate operations', async () => {
  let calls = 0;
  const value = await retryOperation(async () => { calls++; if (calls < 2) throw new Error('temporary'); return 'ok'; }, { retries: 3, baseDelay: 1, maxDelay: 1, jitter: 0 });
  assert.equal(value, 'ok'); assert.equal(calls, 2);
});

test('backoff cancellation stops obsolete retry work', async () => {
  const session = createRetrySession(); let calls = 0;
  const promise = retryOperation(async () => { calls++; throw new Error('temporary'); }, { session, retries: 10, baseDelay: 50, jitter: 0 });
  session.cancel();
  await assert.rejects(promise, RetryCancelledError); assert.equal(calls, 1);
});

test('offline pause resumes on online event', async () => {
  const listeners = installWindow(); global.navigator.onLine = false;
  const session = createRetrySession(); let ran = false;
  const promise = retryOperation(async () => { ran = true; return 7; }, { session, retries: 1 });
  await new Promise(r => setTimeout(r, 5)); assert.equal(ran, false);
  global.navigator.onLine = true; window.dispatchEvent({ type: 'online' });
  assert.equal(await promise, 7); assert.equal(listeners.get('online').size, 0);
});

test('rail keeps constant nodes, iframe identity, srcs, and avoids same-threshold writes', () => {
  installWindow(); const rail = fakeRail(); const before = railDiagnostics(rail); const identities = rail.querySelectorAll('iframe');
  const cleanup = enhanceRail(rail); const afterInit = railDiagnostics(rail);
  assert.deepEqual(afterInit, before); assert.equal(rail.querySelectorAll('iframe')[0], identities[0]);
  const writes = rail.style.writes; window.scrollY = 100; window.dispatchEvent({ type: 'scroll' }); assert.equal(rail.style.writes, writes);
  for (const y of [900, 1800, 2700, 3600, 4500]) { window.scrollY = y; window.dispatchEvent({ type: 'scroll' }); }
  assert.equal(rail.children.length, before.blocks); assert.equal(rail.querySelectorAll('iframe').length, before.iframes);
  assert.deepEqual(rail.querySelectorAll('iframe').map(i => i.src), before.srcs); assert.equal(rail.querySelectorAll('iframe')[1], identities[1]);
  cleanup(); assert.equal(rail.dataset.railEnhanced, undefined);
});

test('reveal copy verification script builds copied index in temp tree', () => {
  const result = spawnSync('node', ['scripts/verify-reveal-copy.mjs'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /reveal\.html can be copied/);
});
