import tagsData from "./data/tags.json";
import { buildTagIndex, normalizeTag } from "./tags-core.js";
export { buildTagIndex, normalizeTag } from "./tags-core.js";

const index = buildTagIndex(tagsData);

export function knownTags() { return [...index.forward.keys()].sort((a, b) => a.localeCompare(b)); }
export function labelForTag(tag) { const normalized = normalizeTag(tag); return index.labels.get(normalized) || normalized; }
export function getWorksForTag(tag) { return (index.forward.get(normalizeTag(tag)) || []).slice(); }
export function getTagsForWorkSlug(slug) { return new Set(index.reverse.get(String(slug || "").trim()) || []); }
export function hasExcludedTag(slug, exclusions) {
  const excluded = new Set((exclusions || []).map(normalizeTag).filter(Boolean));
  for (const tag of getTagsForWorkSlug(slug)) if (excluded.has(tag)) return true;
  return false;
}
