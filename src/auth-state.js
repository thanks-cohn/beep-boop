import { getSupabase } from "./discussion/supabase.js";

export function createAuthState({ getClient = getSupabase, clearPreferences = () => {}, dev = false } = {}) {
  let initPromise = null;
  let subscribed = false;
  let subscription = null;
  let currentSession = null;
  let currentUserId = null;
  let ready = false;
  let failed = false;
  let lastSignature = "loading:null:false";
  const listeners = new Set();
  const cacheClearers = new Set();

  const snapshot = () => ({ session: currentSession, userId: currentUserId, ready, failed, loading: !ready && !failed });
  const signatureFor = () => `${ready}:${currentUserId || ""}:${Boolean(currentSession)}:${failed}`;
  const publish = (force = false) => {
    const sig = signatureFor();
    if (!force && sig === lastSignature) return false;
    lastSignature = sig;
    const snap = snapshot();
    queueMicrotask(() => listeners.forEach(fn => fn(snap)));
    return true;
  };
  const clearUserCaches = nextUserId => {
    for (const clear of cacheClearers) clear(nextUserId);
    if (!nextUserId) clearPreferences();
  };
  const applySession = (event, session, { force = false } = {}) => {
    const nextUserId = session?.user?.id || null;
    const userChanged = nextUserId !== currentUserId;
    currentSession = session || null;
    currentUserId = nextUserId;
    failed = false;
    if (userChanged || event === "SIGNED_OUT") clearUserCaches(nextUserId);
    if (dev) console.info("auth", { event, hasSession: Boolean(session), userChanged, ready, failed });
    return publish(force || userChanged || event === "SIGNED_OUT");
  };
  const installSubscription = async client => {
    if (subscribed || !client) return;
    subscribed = true;
    const result = client.auth.onAuthStateChange((event, session) => {
      if (["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED", "SIGNED_OUT"].includes(event)) {
        ready = true;
        applySession(event, event === "SIGNED_OUT" ? null : session);
      }
    });
    subscription = result?.data?.subscription || result?.subscription || null;
  };
  return {
    async start({ retry = false } = {}) {
      if (retry && failed) { initPromise = null; failed = false; ready = false; publish(true); }
      if (initPromise) return initPromise;
      initPromise = (async () => {
        try {
          const client = await getClient();
          await installSubscription(client);
          if (!client) { ready = true; currentSession = null; currentUserId = null; publish(true); return snapshot(); }
          const { data, error } = await client.auth.getSession();
          if (error) throw error;
          ready = true;
          applySession("INITIAL_SESSION", data?.session || null, { force: true });
          return snapshot();
        } catch (error) {
          ready = true; failed = true; currentSession = null; currentUserId = null; clearUserCaches(null);
          if (dev) console.info("auth", { event: "INITIAL_SESSION", hasSession: false, userChanged: true, ready, failed });
          publish(true);
          return snapshot();
        }
      })();
      return initPromise;
    },
    retry() { return this.start({ retry: true }); },
    subscribe(fn) { listeners.add(fn); queueMicrotask(() => fn(snapshot())); return () => listeners.delete(fn); },
    snapshot,
    onUserChangeClear(fn) { cacheClearers.add(fn); return () => cacheClearers.delete(fn); },
    _subscriptionCount() { return subscribed ? 1 : 0; },
    _subscription() { return subscription; }
  };
}

export const AuthState = createAuthState({ dev: import.meta.env?.DEV, clearPreferences: () => import("./preferences.js").then(({ TagPreferences }) => TagPreferences.clear()).catch(() => {}) });
