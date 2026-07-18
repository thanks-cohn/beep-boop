const invalid = new Set(["", "null", "undefined"]);
export const PAGE_SIZE = 24;
export function normalizeBookmarkId(value) {
  const id = String(value ?? "").trim();
  return invalid.has(id) ? null : id;
}
