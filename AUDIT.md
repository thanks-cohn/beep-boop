# AUDIT.md

## Ghost-text audit after repair

### Old bug
The visible top-of-page text was caused by the atmospheric `text_behind.json` feature rendering without its required decorative layout CSS. The old implementation was tied to `src/page/landing.js`: it imported the JSON phrases, inserted `.site-ghost-text-layer` inside the landing app markup, and appended phrase spans there. After stylesheet cleanup, that layer no longer had reliable fixed positioning, zero layout footprint, pointer-event suppression, low-opacity styling, or animation cleanup. As a result, the phrase spans could appear as ugly normal inline/static document text and could be carried into in-app reader transitions through the landing shell.

### New global ghost layer
The repaired implementation keeps the feature but moves ownership to a single global module, `src/effects/ghost_text.js`. `src/main.js` starts it once during boot, before landing or reader route rendering. The module creates one `.site-ghost-text-layer` directly under `document.body`, marks it `aria-hidden` with `role="presentation"`, and emits short-lived `.site-ghost-text` spans from `src/data/text_behind.json`. CSS defensively forces the layer to be fixed, viewport-sized, non-layout, non-clickable, overflow-hidden, and visually transparent except for absolutely positioned ghost spans.

### Reader side-rail behavior
When `body.reader-active` is present, the emitter switches from homepage slots to reader rail slots only. Left-side positions are clamped around `3vw`-`16vw`, and right-side positions are clamped around `84vw`-`97vw`, preserving the requested `18vw` through `82vw` central exclusion zone. The reader pages and reader chrome have higher stacking than the ghost layer and opaque black page backgrounds, so ghost text cannot sit on top of manga pages or inside the central reader column. At `max-width: 900px`, reader-active mode hides the ghost layer entirely to protect mobile/narrow reading.

### Remaining CSS/JS conflicts
- The main stylesheet is still largely minified into one long line, which makes future targeted audits harder. A later formatting-only CSS pass would improve maintainability.
- In-app reader rendering still reuses `#blocks-root`/`#blocks-reader` from the landing blocks shell. Current hiding rules protect the reader, but this remains a coupling between landing layout and reader layout.
- Several reader-mode CSS rules (`body.reader-active .landing-header`, `.rotunda-layer`, `.ticker-layer`, `.blocks-side`, `#blocks-center`) are still compensating for that shared shell. They should be revisited if reader routing is made root-level.

### Recommended cleanup next
1. Format `src/styles/landing.css` into readable sections without changing behavior.
2. Decouple in-app reader navigation from the landing blocks shell by rendering reader mode into one explicit root.
3. Add a small browser smoke test that asserts `.site-ghost-text-layer` is fixed, `pointer-events: none`, `aria-hidden`, and that reader-active ghost spans never appear between `18vw` and `82vw`.
4. Keep `src/data/text_behind.json` as data-only content for the ghost module unless the atmospheric feature is intentionally retired in the future.
