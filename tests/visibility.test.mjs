import assert from "node:assert/strict";
import test from "node:test";
import { isRotundaEligible, normalizeTags, normalizeVisibilityPolicy } from "../src/data/visibility.js";

test("normalizes tags by trimming, lowercasing, and removing duplicates", () => {
    assert.deepEqual(normalizeTags([" Gore ", "gore", "VORE", "", null]), ["gore", "vore"]);
});

test("rotunda eligibility honors public false and exact excluded tags", () => {
    const policy = normalizeVisibilityPolicy({ rotunda: { excluded_tags: ["gore"] } });
    assert.equal(isRotundaEligible({ tags: ["soft-gore"], public: true }, policy), true);
    assert.equal(isRotundaEligible({ tags: [" gore "], public: true }, policy), false);
    assert.equal(isRotundaEligible({ tags: [], public: false }, policy), false);
    assert.equal(isRotundaEligible({}, policy), true);
});

test("search metadata stays present even when rotunda policy excludes the work", () => {
    const hidden = { slug: "hidden", tags: ["gore"], public: false };
    assert.equal(isRotundaEligible(hidden, { rotunda: { excluded_tags: ["gore"] } }), false);
    assert.deepEqual(normalizeTags(hidden.tags), ["gore"]);
});
