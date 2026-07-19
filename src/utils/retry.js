export const FOREGROUND_RETRY_DELAYS = [0, 500, 1000, 2000, 4000, 8000, 12000, 16000, 20000, 30000];
const DEFAULTS = { retries: 10, baseDelay: 500, maxDelay: 30000, jitter: 0.12, reconnectAfter: 3, backgroundDelay: 45000 };
const inflight = new Map();
const sessions = new Map();
export class RetryCancelledError extends Error { constructor(){ super('Retry operation cancelled'); this.name='RetryCancelledError'; } }
export function isPermanentHttpStatus(status){ return status >= 400 && status < 500 && ![408,409,425,429].includes(status); }
export function retryAfterDelay(value){
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}
export function retryDelay(attempt, options = {}){
  const o = { ...DEFAULTS, ...options };
  const profile = o.profile || FOREGROUND_RETRY_DELAYS;
  const raw = profile[attempt - 1] ?? Math.min(o.maxDelay, o.baseDelay * (2 ** Math.max(0, attempt - 1)));
  const rand = typeof o.random === 'function' ? o.random() : Math.random();
  const factor = raw === 0 ? 1 : 1 + ((rand * 2 - 1) * o.jitter);
  return Math.max(0, Math.round(Math.min(o.maxDelay, raw * factor)));
}
export function createRetrySession(){
  const timers = new Set(); const controllers = new Set(); const onlineListeners = new Set(); const offlineListeners = new Set(); let cancelled = false; let state = 'idle'; let attempts = 0; let inRequest = false;
  const clear = () => { cancelled = true; state = 'disposed'; timers.forEach(clearTimeout); timers.clear(); controllers.forEach(c=>c.abort()); controllers.clear(); onlineListeners.forEach(fn=>window.removeEventListener('online',fn)); onlineListeners.clear(); offlineListeners.forEach(fn=>window.removeEventListener('offline',fn)); offlineListeners.clear(); };
  const wait = ms => new Promise((resolve,reject)=>{ if (cancelled) return reject(new RetryCancelledError()); const finish = () => { timers.delete(id); cancelled ? reject(new RetryCancelledError()) : resolve(); }; const id = setTimeout(finish, ms); timers.add(id); });
  const waitOnline = () => new Promise((resolve,reject)=>{ if (cancelled) return reject(new RetryCancelledError()); if (typeof navigator === 'undefined' || navigator.onLine !== false) return resolve(); state = 'offline-paused'; const on = () => { onlineListeners.delete(on); window.removeEventListener('online', on); resolve(); }; onlineListeners.add(on); window.addEventListener('online', on, { once:true }); });
  const controller = () => { const c = new AbortController(); controllers.add(c); c.signal.addEventListener('abort',()=>controllers.delete(c),{once:true}); return c; };
  return { get cancelled(){return cancelled;}, get state(){return state;}, set state(v){state=v;}, get attempts(){return attempts;}, set attempts(v){attempts=v;}, get inRequest(){return inRequest;}, set inRequest(v){inRequest=v;}, timers, wait, waitOnline, controller, cancel: clear, reset(){ attempts = 0; state = 'recovered'; } };
}
function classifyRetry(error, attempt, options = {}){
  if (options.shouldRetry && options.shouldRetry(error, attempt) === false) return false;
  if (error?.name === 'SyntaxError') return attempt < (options.invalidJsonRetries ?? 2);
  return !isPermanentHttpStatus(error?.status);
}
export async function retryOperation(fn, options = {}){
  const o = { ...DEFAULTS, ...options }; const session = o.session || createRetrySession(); let last;
  session.state = 'loading';
  while (!session.cancelled && session.attempts < o.retries) {
    await session.waitOnline(); session.attempts += 1; session.state = session.attempts > o.reconnectAfter ? 'reconnecting' : 'loading';
    try { session.inRequest = true; const value = await fn({ attempt: session.attempts, signal: o.signal }); session.reset(); return value; }
    catch (e) { last = e; if (!classifyRetry(e, session.attempts, o)) { session.state = 'permanent-failure'; throw e; } o.onRetry?.(e, session.attempts, session.state); if (session.attempts >= o.retries) break; const ra = retryAfterDelay(e?.retryAfter); await session.wait(ra ?? retryDelay(session.attempts + 1, o)); }
    finally { session.inRequest = false; }
  }
  if (session.cancelled) throw new RetryCancelledError(); session.state = 'assisted-recovery'; throw last;
}
export function getRecoverySession(key, options = {}) { if (sessions.has(key)) return sessions.get(key); const s = createRetrySession(); sessions.set(key, s); const old = s.cancel; s.cancel = () => { old(); sessions.delete(key); }; return s; }
function responseError(response){ const err = new Error(`HTTP ${response.status}`); err.status = response.status; err.retryAfter = response.headers?.get?.('Retry-After'); return err; }
export function fetchJsonWithRetry(url, options = {}){
  const key = options.dedupeKey || url; if (options.dedupe !== false && inflight.has(key)) return inflight.get(key);
  const session = options.session || getRecoverySession(key);
  const promise = retryOperation(async () => { const c = session.controller(); const response = await fetch(url, { ...options.fetchOptions, signal: options.signal || c.signal }); if (!response.ok) throw responseError(response); return response.json(); }, { ...options, session }).finally(()=>{ if (inflight.get(key) === promise) inflight.delete(key); });
  if (options.dedupe !== false) inflight.set(key, promise); return promise;
}
export function fetchTextWithRetry(url, options = {}){
  const key = options.dedupeKey || url; if (options.dedupe !== false && inflight.has(key)) return inflight.get(key);
  const session = options.session || getRecoverySession(key);
  const promise = retryOperation(async () => { const c = session.controller(); const r = await fetch(url, { ...options.fetchOptions, signal: options.signal || c.signal }); if(!r.ok) throw responseError(r); return r.text(); }, { ...options, session }).finally(()=>{ if (inflight.get(key) === promise) inflight.delete(key); });
  if (options.dedupe !== false) inflight.set(key, promise); return promise;
}
