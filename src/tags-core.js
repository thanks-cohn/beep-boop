export const normalizeTag = value => String(value || "").toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ").trim();
const uniqueSorted = values => [...new Set((values || []).map(value => String(value || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
export function buildTagIndex(data = { labels: {}, tags: {} }) {
  const labels = data?.labels || {};
  const sourceTags = data?.tags || {};
  const forward = new Map();
  const reverse = new Map();
  const labelMap = new Map();
  for (const [rawTag, rawWorks] of Object.entries(sourceTags)) {
    const tag = normalizeTag(rawTag); if (!tag) continue;
    if (!forward.has(tag)) forward.set(tag, new Set());
    for (const slug of rawWorks || []) {
      const workSlug = String(slug || "").trim(); if (!workSlug) continue;
      forward.get(tag).add(workSlug);
      if (!reverse.has(workSlug)) reverse.set(workSlug, new Set());
      reverse.get(workSlug).add(tag);
    }
  }
  for (const [rawTag, label] of Object.entries(labels)) { const tag = normalizeTag(rawTag); if (tag && String(label || "").trim()) labelMap.set(tag, String(label).trim()); }
  return { forward: new Map([...forward.entries()].map(([tag, works]) => [tag, uniqueSorted([...works])])), reverse, labels: labelMap };
}
