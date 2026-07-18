import { getSupabase } from "./discussion/supabase.js";
import { TagPreferences } from "./preferences.js";

let started = false;
let currentSession = null;
let currentUserId = null;
const listeners = new Set();
const cacheClearers = new Set();

const safeSnapshot = () => ({ session: currentSession, userId: currentUserId, ready: started });
const publish = () => { const snap = safeSnapshot(); queueMicrotask(() => listeners.forEach(fn => fn(snap))); };

function handleAuthEvent(event, session) {
  const nextUserId = session?.user?.id || null;
  const userChanged = nextUserId !== currentUserId;
  currentSession = session || null;
  currentUserId = nextUserId;
  if (userChanged || event === "SIGNED_OUT") {
    for (const clear of cacheClearers) clear(nextUserId);
    if (!nextUserId) TagPreferences.clear();
  }
  if (import.meta.env.DEV) console.info("auth", { event, hasSession: Boolean(session), userChanged });
  publish();
}

export const AuthState = {
  async start() {
    if (started) return safeSnapshot();
    started = true;
    const db = await getSupabase();
    if (!db) { publish(); return safeSnapshot(); }
    db.auth.onAuthStateChange((event, session) => handleAuthEvent(event, session));
    const { data } = await db.auth.getSession();
    handleAuthEvent("INITIAL_SESSION", data?.session || null);
    return safeSnapshot();
  },
  subscribe(fn) { listeners.add(fn); queueMicrotask(() => fn(safeSnapshot())); return () => listeners.delete(fn); },
  snapshot: safeSnapshot,
  onUserChangeClear(fn) { cacheClearers.add(fn); return () => cacheClearers.delete(fn); }
};
