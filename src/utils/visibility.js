/**
 * Rotunda visibility helpers.
 *
 * Tag normalization contract shared with scripts/ingest-work.py:
 * convert to string, trim, lowercase, collapse internal whitespace to a
 * single hyphen, drop empty values, and remove duplicates in first-seen order.
 * `public` means eligible for public rotunda presentation; it is not access
 * control and must not affect search or direct reader URLs.
 */
export function normalizeTag(value) {
    return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "-");
}

export function normalizeTags(values) {
    const input = Array.isArray(values) ? values : [];
    const seen = new Set();
    const output = [];
    for (const value of input) {
        const tag = normalizeTag(value);
        if (!tag || seen.has(tag)) continue;
        seen.add(tag);
        output.push(tag);
    }
    return output;
}

export function normalizeCandidate(candidate = {}) {
    return {
        ...candidate,
        tags: normalizeTags(candidate.tags),
        public: candidate.public !== false
    };
}

export function normalizeVisibilityPolicy(policy) {
    const excluded = policy?.rotunda?.excluded_tags;
    return {
        version: 1,
        rotunda: {
            excluded_tags: normalizeTags(excluded)
        }
    };
}

export function isRotundaEligible(candidate, policy) {
    const normalized = normalizeCandidate(candidate);
    if (!normalized.public) return false;
    const excluded = new Set(normalizeVisibilityPolicy(policy).rotunda.excluded_tags);
    return normalized.tags.every(tag => !excluded.has(tag));
}

export function filterRotundaCandidates(candidates, policy) {
    if (!Array.isArray(candidates)) return [];
    return candidates.map(normalizeCandidate).filter(candidate => isRotundaEligible(candidate, policy));
}
