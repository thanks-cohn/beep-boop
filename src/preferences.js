import tagPolicy from "./data/tag-policy.json";
import { getSupabase, session } from "./discussion/supabase.js";

const normalizeTag = value => String(value || "").toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ").trim();
const unique = values => [...new Set((values || []).map(normalizeTag).filter(Boolean))].sort();
const defaults = unique(tagPolicy.defaultExcludedTags);
let snapshot = { userId: null, personalExcluded: [], allowedDefaults: [], effective: defaults };
let inflight = null;
const listeners = new Set();

export const TagPreferences = {
  normalizeTag,
  defaults: () => defaults.slice(),
  allowDefaultOverrides: () => tagPolicy.allowDefaultOverrides !== false,
  snapshot: () => structuredClone(snapshot),
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  clear() { snapshot = { userId: null, personalExcluded: [], allowedDefaults: [], effective: defaults }; inflight = null; listeners.forEach(fn => fn(TagPreferences.snapshot())); },
  isExcluded(tags) { const set = new Set(snapshot.effective); return unique(tags).some(tag => set.has(tag)); },
  effective(personalExcluded = snapshot.personalExcluded, allowedDefaults = snapshot.allowedDefaults) {
    const allowed = new Set(unique(allowedDefaults));
    return unique([...defaults.filter(tag => !allowed.has(tag)), ...unique(personalExcluded)]);
  },
  async loadForCurrentUser() {
    if (inflight) return inflight;
    inflight = (async () => {
      const s = await session().catch(() => null);
      if (!s?.user?.id) { TagPreferences.clear(); return snapshot; }
      const db = await getSupabase();
      const { data, error } = await db.from("user_tag_preferences").select("excluded_tags, allowed_default_tags").eq("user_id", s.user.id).maybeSingle();
      if (error) throw error;
      snapshot = { userId: s.user.id, personalExcluded: unique(data?.excluded_tags), allowedDefaults: unique(data?.allowed_default_tags), effective: TagPreferences.effective(data?.excluded_tags, data?.allowed_default_tags) };
      listeners.forEach(fn => fn(TagPreferences.snapshot()));
      return snapshot;
    })().finally(() => { inflight = null; });
    return inflight;
  },
  async save({ personalExcluded = snapshot.personalExcluded, allowedDefaults = snapshot.allowedDefaults }) {
    const s = await session();
    if (!s?.user?.id) throw new Error("Sign in before saving preferences.");
    const db = await getSupabase();
    const row = { user_id: s.user.id, excluded_tags: unique(personalExcluded), allowed_default_tags: unique(allowedDefaults), updated_at: new Date().toISOString() };
    const { error } = await db.from("user_tag_preferences").upsert(row, { onConflict: "user_id" });
    if (error) throw error;
    snapshot = { userId: s.user.id, personalExcluded: row.excluded_tags, allowedDefaults: row.allowed_default_tags, effective: TagPreferences.effective(row.excluded_tags, row.allowed_default_tags) };
    listeners.forEach(fn => fn(TagPreferences.snapshot()));
    return TagPreferences.snapshot();
  }
};
