import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouteLifecycle } from '../src/route-lifecycle.js';
import { createFiniteRailSession } from '../src/components/rail-session.js';
import { retryDelay, withRetry } from '../src/utils/retry.js';

test('route lifecycle disposes exactly once, aborts work, and cleans late initializers', () => {
  const lifecycle = createRouteLifecycle();
  let disposed = 0;
  const first = lifecycle.next('landing', () => disposed++);
  let cleanup = 0;
  first.addCleanup(() => cleanup++);
  const second = lifecycle.next('reader', () => disposed++);
  assert.equal(first.disposed, true);
  assert.equal(first.signal.aborted, true);
  assert.equal(disposed, 1);
  assert.equal(cleanup, 1);
  first.addCleanup(() => cleanup++);
  assert.equal(cleanup, 2);
  second.dispose(); second.dispose();
  assert.equal(disposed, 2);
});

test('bounded retry behavior stops on non-retryable failures', async () => {
  let attempts = 0;
  const err = new Error('deterministic 404');
  err.retryable = false;
  await assert.rejects(() => withRetry(async () => { attempts++; throw err; }, { retries: 10, initialDelay: 0 }), /deterministic/);
  assert.equal(attempts, 1);
  assert.equal(retryDelay(10), 4500);
});

test('finite rail session keeps block and iframe identity stable over many cycles and disposes', () => {
  const listeners = new Map();
  globalThis.window = { innerHeight: 600, scrollY: 0, addEventListener: (t, f) => listeners.set(t, f), removeEventListener: t => listeners.delete(t), requestAnimationFrame: fn => { fn(); return 1; }, cancelAnimationFrame(){} };
  globalThis.document = { documentElement: { scrollHeight: 4000 } };
  globalThis.requestAnimationFrame = window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
  globalThis.getComputedStyle = () => ({ rowGap: '0', gap: '0' });
  globalThis.ResizeObserver = class { constructor(fn){ this.fn = fn; this.count = 0; } observe(){ this.count++; } disconnect(){ this.count = 0; } };
  const makeNode = (tag = 'section') => ({ tagName: tag.toUpperCase(), style: { removeProperty(k){ delete this[k]; } }, dataset: {}, attrs: new Map(), children: [], classList: { add(){}, remove(){} }, querySelectorAll(sel){ const out=[]; const walk=n=>{ for(const c of n.children||[]){ if(sel === 'iframe' && c.tagName === 'IFRAME') out.push(c); walk(c); } }; walk(this); return out; }, closest(sel){ return sel === '.reader-block-layout' ? layout : side; }, getBoundingClientRect(){ return { height: 200 }; }, getAttribute(n){ return this.attrs.has(n) ? this.attrs.get(n) : null; }, setAttribute(n,v){ this.attrs.set(n,String(v)); }, removeAttribute(n){ this.attrs.delete(n); }, hasAttribute(n){ return this.attrs.has(n); } });
  const side = makeNode('aside'); const layout = makeNode('div'); layout.getBoundingClientRect = () => ({ height: 3000 });
  const rail = makeNode('div'); rail.closest = sel => sel === '.reader-block-side' ? side : layout;
  const iframes = [];
  for (let i=0;i<4;i++){ const block = makeNode(); const iframe = makeNode('iframe'); iframe.src = `https://example.test/${i}`; block.children.push(iframe); rail.children.push(block); iframes.push(iframe); }
  const dispose = createFiniteRailSession({ left: rail });
  for (let i=0;i<200;i++){ window.scrollY = i * 500; listeners.get('scroll')?.(); }
  assert.equal(rail.children.length, 4);
  assert.deepEqual(rail.querySelectorAll('iframe'), iframes);
  assert.deepEqual(rail.querySelectorAll('iframe').map(f => f.src), iframes.map((_, i) => `https://example.test/${i}`));
  dispose(); dispose();
  assert.equal(listeners.has('scroll'), false);
});
