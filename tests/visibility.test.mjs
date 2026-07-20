import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTag, normalizeTags, normalizeCandidate, normalizeVisibilityPolicy, isRotundaEligible, filterRotundaCandidates } from "../src/utils/visibility.js";

test("tag normalization trims lowercases whitespace and duplicates", () => {
  assert.equal(normalizeTag(" Gore "), "gore");
  assert.equal(normalizeTag("Dark Skin"), "dark-skin");
  assert.deepEqual(normalizeTags([" Gore ", "gore", "Dark   Skin", ""]), ["gore", "dark-skin"]);
});

test("eligibility uses exact normalized tags and public defaults", () => {
  assert.deepEqual(normalizeCandidate({}).tags, []);
  assert.equal(normalizeCandidate({}).public, true);
  assert.equal(isRotundaEligible({ tags: ["soft-gore"] }, { rotunda: { excluded_tags: ["gore"] } }), true);
  assert.equal(isRotundaEligible({ tags: ["netorarex"] }, { rotunda: { excluded_tags: ["netorare"] } }), true);
  assert.equal(isRotundaEligible({ public: false }, { rotunda: { excluded_tags: [] } }), false);
  assert.equal(isRotundaEligible({ tags: [" Gore "] }, { rotunda: { excluded_tags: ["gore"] } }), false);
  assert.equal(isRotundaEligible({ tags: ["romance"] }, { rotunda: { excluded_tags: ["gore"] } }), true);
});

test("malformed policy and candidate lists are safe", () => {
  assert.deepEqual(normalizeVisibilityPolicy({ rotunda: { excluded_tags: "gore" } }).rotunda.excluded_tags, []);
  assert.deepEqual(filterRotundaCandidates(null, null), []);
  assert.deepEqual(filterRotundaCandidates([{ slug: "a", tags: ["gore"] }], null).map(w => w.slug), ["a"]);
});

test("zero and one eligible candidates", () => {
  assert.deepEqual(filterRotundaCandidates([{ slug: "a", tags: ["gore"] }], { rotunda: { excluded_tags: ["gore"] } }), []);
  assert.deepEqual(filterRotundaCandidates([{ slug: "a" }], { rotunda: { excluded_tags: ["gore"] } }).map(w => w.slug), ["a"]);
});

test("policy-fetch failure fallback does not crash", async () => {
  const { VisibilityPolicyStore } = await import("../src/components/visibility_policy.js");
  const store = new VisibilityPolicyStore(() => Promise.reject(new Error("boom")));
  assert.deepEqual(await store.refresh(), { version: 1, rotunda: { excluded_tags: [] } });
});

test("repeated rotunda initialization is cleanup-first and policy-driven", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/components/rotunda.js", import.meta.url), "utf8"));
  assert.match(source, /Rotunda\.cleanup\?\.\(\)/);
  assert.match(source, /visibilityPolicyStore\.addEventListener\("change", policyChange\)/);
  assert.match(source, /visibilityPolicyStore\.removeEventListener\("change", policyChange\)/);
  assert.match(source, /filterRotundaCandidates\(rawWorks/);
});

test("hidden/excluded metadata is independent from existing Search code path", async () => {
  const fs = await import("node:fs/promises");
  const searchSource = await fs.readFile(new URL("../src/components/search.js", import.meta.url), "utf8");
  assert.match(searchSource, /\/data\/search\.index\.json/);
  assert.doesNotMatch(searchSource, /visibility-policy|excluded_tags|public/);
  const entries = JSON.parse(await fs.readFile(new URL("../public/data/search.index.json", import.meta.url), "utf8")).entries;
  assert.ok(entries.some(entry => entry.display && entry.normalized), "existing search index has searchable entries");
});
