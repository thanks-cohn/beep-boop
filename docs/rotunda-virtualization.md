# Rotunda virtualization

The rotunda mounts at most 20 unique logical works: the active work, the visible
three works on either side, then alternating nearest-first buffered works. Buffered
cards preload but are hidden from rendering, accessibility, pointer input, and the
tab order. Work resolution runs through four workers, is aborted on navigation,
and is guarded by a render generation. Metadata and first-page thumbnail caches
are LRU-bounded at 40 entries.

## Development verification

Run `node --test tests/rotunda_window.test.mjs` for empty, one-item, small,
20-item, larger, 500-item, and bidirectional wrap calculations. In a development
build, run `window.__rotundaDiagnostics()` after rapid arrow/swipe navigation,
failed-image simulation, and repeated `Rotunda.start()` calls. DOM cards and active
image sources must remain at or below 20; cache sizes must remain at or below 40.

## Massive-catalog boundary

Virtualizing DOM and requests does not make the statically imported
`src/data/rotunda.json` suitable for hundreds of millions of entries: the browser
still downloads and parses that complete index. A genuinely massive catalog needs
server-side or build-time pagination, chunked rotunda index files, cursor-based
fetching, a total-count endpoint, stable work IDs, and page-sized metadata fetching
around the active cursor. This repository has no applicable paging API, so this
change intentionally does not invent a backend.
