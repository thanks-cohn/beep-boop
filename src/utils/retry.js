const DEFAULTS = { retries: Infinity, baseDelay: 250, maxDelay: 8000, jitter: 0.25, reconnectAfter: 3 };
const inflight = new Map();
export class RetryCancelledError extends Error { constructor(){ super('Retry operation cancelled'); this.name='RetryCancelledError'; } }
export function isPermanentHttpStatus(status){ return status >= 400 && status < 500 && ![408,409,425,429].includes(status); }
export function retryDelay(attempt, options = {}){
  const o = { ...DEFAULTS, ...options };
  const raw = Math.min(o.maxDelay, o.baseDelay * (2 ** Math.max(0, attempt - 1)));
  const rand = typeof o.random === 'function' ? o.random() : Math.random();
  const factor = 1 + ((rand * 2 - 1) * o.jitter);
  return Math.max(0, Math.round(raw * factor));
}
export function createRetrySession(){
  const timers = new Set(); const controllers = new Set(); let cancelled = false; const onlineListeners = new Set();
  const clear = () => { cancelled = true; timers.forEach(clearTimeout); timers.clear(); controllers.forEach(c=>c.abort()); controllers.clear(); onlineListeners.forEach(fn=>window.removeEventListener('online',fn)); onlineListeners.clear(); };
  const wait = ms => new Promise((resolve,reject)=>{
    if (cancelled) return reject(new RetryCancelledError());
    const finish = () => { timers.delete(id); cancelled ? reject(new RetryCancelledError()) : resolve(); };
    const id = setTimeout(finish, ms); timers.add(id);
  });
  const waitOnline = () => new Promise((resolve,reject)=>{
    if (cancelled) return reject(new RetryCancelledError());
    if (typeof navigator === 'undefined' || navigator.onLine !== false) return resolve();
    const on = () => { onlineListeners.delete(on); window.removeEventListener('online', on); resolve(); };
    onlineListeners.add(on); window.addEventListener('online', on, { once:true });
  });
  const controller = () => { const c = new AbortController(); controllers.add(c); c.signal.addEventListener('abort',()=>controllers.delete(c),{once:true}); return c; };
  return { get cancelled(){return cancelled;}, wait, waitOnline, controller, cancel: clear };
}
export async function retryOperation(fn, options = {}){
  const o = { ...DEFAULTS, ...options }; const session = o.session || createRetrySession(); let attempt = 0; let last;
  while (!session.cancelled && attempt < o.retries) {
    await session.waitOnline(); attempt += 1;
    try { return await fn({ attempt, signal: o.signal }); }
    catch (e) {
      last = e; if (o.shouldRetry && !o.shouldRetry(e, attempt)) throw e;
      o.onRetry?.(e, attempt); if (attempt >= o.retries) break;
      await session.wait(retryDelay(attempt, o));
    }
  }
  if (session.cancelled) throw new RetryCancelledError(); throw last;
}
export function fetchJsonWithRetry(url, options = {}){
  const key = options.dedupeKey || url;
  if (options.dedupe !== false && inflight.has(key)) return inflight.get(key);
  const session = options.session || createRetrySession();
  const promise = retryOperation(async () => {
    const c = session.controller();
    const response = await fetch(url, { ...options.fetchOptions, signal: options.signal || c.signal });
    if (!response.ok) { const err = new Error(`HTTP ${response.status}`); err.status = response.status; throw err; }
    return response.json();
  }, { ...options, session, shouldRetry: e => !isPermanentHttpStatus(e.status) && options.shouldRetry?.(e) !== false }).finally(()=>{ if (inflight.get(key) === promise) inflight.delete(key); });
  if (options.dedupe !== false) inflight.set(key, promise); return promise;
}
export function fetchTextWithRetry(url, options = {}){
  return retryOperation(async () => { const r = await fetch(url, options.fetchOptions); if(!r.ok){ const e=new Error(`HTTP ${r.status}`); e.status=r.status; throw e;} return r.text(); }, { ...options, shouldRetry:e=>!isPermanentHttpStatus(e.status) });
}
