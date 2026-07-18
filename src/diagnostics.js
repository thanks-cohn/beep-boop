const counters = new Map();
const active = new Map();
const timings = [];

const keyOf = (category, name = "default") => `${category}:${name}`;
const inc = (map, key, delta) => map.set(key, Math.max(0, (map.get(key) || 0) + delta));

export function diagnosticTrack(category, name = "default") {
  if (!import.meta.env.DEV) return () => {};
  const key = keyOf(category, name);
  inc(active, key, 1);
  return () => inc(active, key, -1);
}
export function diagnosticCount(category, name = "default", delta = 1) {
  if (!import.meta.env.DEV) return;
  inc(counters, keyOf(category, name), delta);
}
export function diagnosticTiming(name, ms) {
  if (!import.meta.env.DEV) return;
  timings.push({ name, ms: Math.round(ms * 10) / 10, at: Math.round(performance.now()) });
  if (timings.length > 80) timings.shift();
}
export function setDiagnosticRoute(route) {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  window.__beepBoopActiveRoute = route;
}
export function snapshotDiagnostics(extra = {}) {
  const doc = typeof document === "undefined" ? null : document;
  return {
    activeRoute: typeof window === "undefined" ? null : window.__beepBoopActiveRoute || null,
    domNodes: doc ? doc.querySelectorAll("*").length : 0,
    readerPlaceholders: doc ? doc.querySelectorAll(".reader-page").length : 0,
    liveImages: doc ? doc.images.length : 0,
    loadedImages: doc ? [...doc.images].filter(img => img.complete && img.naturalWidth > 0).length : 0,
    imagesWithSrc: doc ? [...doc.images].filter(img => img.currentSrc || img.getAttribute("src")).length : 0,
    liveIframes: doc ? doc.querySelectorAll("iframe").length : 0,
    activeRailBlocks: doc ? doc.querySelectorAll(".finite-reader-rail > .site-block:not([aria-hidden='true'])").length : 0,
    counters: Object.fromEntries(counters),
    active: Object.fromEntries(active),
    timings: timings.slice(),
    ...extra
  };
}
if (import.meta.env.DEV && typeof window !== "undefined") window.__beepBoopDiagnostics = () => snapshotDiagnostics();
