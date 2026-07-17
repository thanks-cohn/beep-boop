import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

class FakeNode {
    constructor(kind, value = "") { this.kind = kind; this.value = value; this.children = []; }
    append(...nodes) { this.children.push(...nodes); }
    set textContent(value) { this.value = value; }
}
globalThis.document = { createTextNode: value => new FakeNode("text", value), createElement: kind => new FakeNode(kind) };
const { appendPlainTextWithLinks } = await import("../src/discussion/text.js");

test("plain text remains text while only HTTP(S) URLs become safe links", () => {
    const root = new FakeNode("root");
    appendPlainTextWithLinks(root, '<img src=x> javascript:alert(1) https://example.test/a?q=1');
    assert.equal(root.children.filter(node => node.kind === "a").length, 1);
    const link = root.children.find(node => node.kind === "a");
    assert.equal(link.rel, "nofollow ugc noopener noreferrer"); assert.equal(link.target, "_blank");
    assert.match(root.children.map(node => node.value).join(""), /<img src=x> javascript:/);
});

test("database migration contains the security invariants", () => {
    const sql = fs.readFileSync(new URL("../supabase/migrations/202607170001_discussion_mvp.sql", import.meta.url), "utf8");
    for (const required of ["enable row level security", "comment_authorship", "15 seconds", "Replies may only be one level deep", "Reply belongs to another work", "primary key(comment_id,user_id)", "primary key(comment_id,reporter_user_id)", "primary key(user_id,work_id)", "revoke all on public.comment_authorship", "limit least(greatest(p_limit,1),30)"]) assert.ok(sql.includes(required), required);
});

test("composer enforces the 2,000 character browser limit and lazy loading", () => {
    const source = fs.readFileSync(new URL("../src/discussion/discussion.js", import.meta.url), "utf8");
    assert.match(source, /textarea\.maxLength = 2000/); assert.match(source, /IntersectionObserver/); assert.match(source, /rootMargin: "700px 0px"/);
    assert.match(source, /sessionStorage/); assert.match(source, /disposed/);
});
