import { ensureAnonymousSession, getSupabase, session } from "./supabase.js";

const PAGE_SIZE = 30;
const run = async promise => {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
};

export async function loadDiscussion(workId, cursor) {
    const db = await getSupabase();
    if (!db) return { comments: [], nextCursor: null };
    return run(db.rpc("get_work_discussion", {
        p_work_id: String(workId), p_before_created_at: cursor?.created_at || null,
        p_before_id: cursor?.id || null, p_limit: PAGE_SIZE
    }));
}

export async function createComment(workId, body, displayMode, parentId = null) {
    await ensureAnonymousSession();
    const db = await getSupabase();
    return run(db.rpc("create_comment", { p_work_id: String(workId), p_body: body, p_display_mode: displayMode, p_parent_id: parentId }));
}
export async function editComment(id, body) { const db = await getSupabase(); return run(db.rpc("edit_own_comment", { p_comment_id: id, p_body: body })); }
export async function deleteComment(id) { const db = await getSupabase(); return run(db.rpc("delete_own_comment", { p_comment_id: id })); }
export async function voteComment(id) { await ensureAnonymousSession(); const db = await getSupabase(); return run(db.rpc("vote_comment", { p_comment_id: id, p_value: 1 })); }
export async function reportComment(id, reason) { await ensureAnonymousSession(); const db = await getSupabase(); return run(db.rpc("report_comment", { p_comment_id: id, p_reason: reason })); }
export async function bookmarkState(workId) { const s = await session(); if (!s) return false; const db = await getSupabase(); const data = await run(db.from("bookmarks").select("work_id").eq("work_id", String(workId)).maybeSingle()); return Boolean(data); }
export async function toggleBookmark(workId, active) { await ensureAnonymousSession(); const db = await getSupabase(); if (active) await run(db.from("bookmarks").delete().eq("work_id", String(workId))); else await run(db.from("bookmarks").upsert({ work_id: String(workId) }, { onConflict: "user_id,work_id" })); return !active; }
