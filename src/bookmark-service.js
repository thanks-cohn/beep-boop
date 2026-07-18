import catalog from "./data/work-catalog.json";
import { getSupabase, session, ensureAnonymousSession } from "./discussion/supabase.js";
import { getTagsForWorkSlug, labelForTag } from "./tags.js";

export const PAGE_SIZE = 24;
const invalid = new Set(["", "null", "undefined"]);
export function normalizeBookmarkId(value) {
  const id = String(value ?? "").trim();
  return invalid.has(id) ? null : id;
}
export function metadataForBookmarkId(id) {
  return catalog.by_parent_work_id?.[String(id)] || null;
}
export function tagsForWork(work) { return [...getTagsForWorkSlug(work?.slug)].map(labelForTag); }

export async function fetchBookmarkPage({ from = 0, to = PAGE_SIZE - 1 } = {}) {
  const s = await session();
  if (!s?.user?.id) return { rows: [], hasMore: false, nextFrom: 0 };
  const db = await getSupabase();
  const limitEnd = from + PAGE_SIZE;
  const { data, error } = await db.from("bookmarks")
    .select("work_id,created_at,user_id")
    .eq("user_id", s.user.id)
    .order("created_at", { ascending: false })
    .order("work_id", { ascending: true })
    .range(from, limitEnd);
  if (error) throw error;
  const seen = new Set();
  const validRows = [];
  for (const row of data || []) {
    const id = normalizeBookmarkId(row.work_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    validRows.push(row);
  }
  return { rows: validRows.slice(0, PAGE_SIZE), hasMore: (data || []).length > PAGE_SIZE, nextFrom: from + PAGE_SIZE };
}
export async function getBookmarkState(workId) {
  const id = normalizeBookmarkId(workId); if (!id) return { active: false, unavailable: true };
  const s = await session(); if (!s?.user?.id) return { active: false };
  const db = await getSupabase();
  const { data, error } = await db.from("bookmarks").select("work_id").eq("user_id", s.user.id).eq("work_id", id).maybeSingle();
  if (error) throw error;
  return { active: Boolean(data) };
}
export async function setBookmark(workId, active) {
  const id = normalizeBookmarkId(workId); if (!id) throw new Error("This work does not have a valid bookmark identity yet.");
  const db = await getSupabase(); if (!db) throw new Error("Bookmarks require Supabase configuration.");
  const s = await ensureAnonymousSession();
  const query = db.from("bookmarks");
  const result = active ? await query.upsert({ user_id: s.user.id, work_id: id }, { onConflict: "user_id,work_id" }) : await query.delete().eq("user_id", s.user.id).eq("work_id", id);
  if (result.error) throw result.error;
}
export async function toggleBookmark(workId, wasActive) { await setBookmark(workId, !wasActive); return !wasActive; }
