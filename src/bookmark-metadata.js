import catalog from "./data/work-catalog.json";
import { getTagsForWorkSlug, labelForTag } from "./tags.js";

export function metadataForBookmarkId(id) {
  return catalog.by_parent_work_id?.[String(id)] || null;
}
export function tagsForWork(work) { return [...getTagsForWorkSlug(work?.slug)].map(labelForTag); }
