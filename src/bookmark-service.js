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
  const { data, error } = await db.from("bookmarks").select("work_id,created_at").order("created_at", { ascending: false }).range(from, to + 1);
  if (error) throw error;
  const validRows = (data || []).filter(row => normalizeBookmarkId(row.work_id));
  return { rows: validRows.slice(0, PAGE_SIZE), hasMore: validRows.length > PAGE_SIZE, nextFrom: from + PAGE_SIZE };
}
export async function getBookmarkState(workId) {
  const id = normalizeBookmarkId(workId); if (!id) return { active: false, unavailable: true };
  const s = await session(); if (!s?.user?.id) return { active: false };
  const db = await getSupabase();
  const { data, error } = await db.from("bookmarks").select("work_id").eq("work_id", id).maybeSingle();
  if (error) throw error;
  return { active: Boolean(data) };
}
export async function setBookmark(workId, active) {
  const id = normalizeBookmarkId(workId); if (!id) throw new Error("This work does not have a valid bookmark identity yet.");
  const db = await getSupabase(); if (!db) throw new Error("Bookmarks require Supabase configuration.");
  const s = await ensureAnonymousSession();
  const query = db.from("bookmarks");
  const result = active ? await query.upsert({ user_id: s.user.id, work_id: id }, { onConflict: "user_id,work_id" }) : await query.delete().eq("work_id", id);
  if (result.error) throw result.error;
}
export async function toggleBookmark(workId, wasActive) { await setBookmark(workId, !wasActive); return !wasActive; }
