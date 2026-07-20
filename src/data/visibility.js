const defaultPolicy = { version: 1, rotunda: { excluded_tags: ["gore", "vore"] } };

export const TAG_SEPARATOR = ",";

export function normalizeTag(tag) {
    return String(tag ?? "").trim().toLowerCase();
}

export function normalizeTags(tags) {
    const values = Array.isArray(tags) ? tags : [];
    return [...new Set(values.map(normalizeTag).filter(Boolean))];
}

export function normalizeWorkMetadata(work = {}) {
    return {
        ...work,
        tags: normalizeTags(work.tags),
        public: work.public === false ? false : true
    };
}

export function normalizeVisibilityPolicy(policy = {}) {
    return {
        version: Number(policy.version) || 1,
        rotunda: {
            excluded_tags: normalizeTags(policy.rotunda?.excluded_tags)
        }
    };
}

export function isRotundaEligible(work = {}, policy = defaultPolicy) {
    const metadata = normalizeWorkMetadata(work);
    if (metadata.public === false) return false;
    const excluded = new Set(normalizeVisibilityPolicy(policy).rotunda.excluded_tags);
    return metadata.tags.every(tag => !excluded.has(tag));
}

export async function loadVisibilityPolicy(fetcher = globalThis.fetch) {
    if (typeof fetcher !== "function") return normalizeVisibilityPolicy(defaultPolicy);
    try {
        const response = await fetcher(`/src/data/visibility-policy.json?v=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return normalizeVisibilityPolicy(await response.json());
    } catch (_error) {
        return normalizeVisibilityPolicy(defaultPolicy);
    }
}
