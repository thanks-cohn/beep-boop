# EDIT.md

## Ghost-text background repair

### Files changed
- `src/main.js`
  - Starts the ghost-text system during app boot before route rendering so the layer is app/body-level instead of landing-only.
- `src/effects/ghost_text.js`
  - New vanilla JS ghost-text module that reads `src/data/text_behind.json`, creates one global `.site-ghost-text-layer`, and emits short-lived atmospheric phrase spans.
- `src/page/landing.js`
  - Removed the old landing-only ghost-text import, emitter, interval, and inline layer markup.
  - Kept the existing landing header, search mount, rotunda mount, ticker, and blocks startup sequence.
- `src/styles/landing.css`
  - Added defensive fixed-position ghost layer styles, non-interactive faint phrase styling, drift/fade animation, reader side-rail behavior, and mobile reader suppression.
- `EDIT.md` and `AUDIT.md`
  - Updated documentation for the cause, fix, preservation notes, limitations, and next cleanup recommendations.

### Ghost-text bug cause
The previous ghost-text code lived inside `src/page/landing.js` and inserted `.site-ghost-text-layer` as normal landing markup. The stylesheet no longer contained the required fixed/absolute ghost styles, so generated phrase spans from `text_behind.json` could participate in document flow and appear as ordinary readable text at the top of the page. Because the reader can be opened inside the landing shell, that landing-owned layer also created confusing reader-mode behavior.

### What was fixed
- The ghost layer is now global and created under `document.body`, not inside the landing template.
- The layer is forced to be fixed, viewport-sized, `aria-hidden`, presentation-only, and `pointer-events: none`.
- Phrase spans are absolutely positioned, faint, small, blurred, low-opacity, and removed after their drift/fade lifetime.
- Reader mode uses `body.reader-active` to switch placement to safe side-rail slots only: left rail near `0vw`-`18vw` and right rail near `82vw`-`100vw`.
- Mobile/narrow reader mode hides the ghost layer so manga pages and controls cannot be covered.
- The landing-only ghost system was removed, leaving a single ghost-text system.

### What was preserved
- `src/data/text_behind.json` remains in place and remains the source of ghost phrases.
- The ghost-text concept is preserved as a subtle atmospheric background effect.
- Homepage, search, rotunda, blocks, reader rendering, chapter selector, image loading, `fetch.json`, and storage/manifest resolution code were not redesigned or migrated.

### Limitations
- The manual browser verification in this environment used DOM/CSS checks through a local Vite server rather than a full visual screenshot tool, because Playwright/Puppeteer are not installed.
- Reader-side ghost placement is intentionally conservative and slot-based; if the reader column width is redesigned later, keep the `18vw`/`82vw` exclusion rule or replace it with measured reader-column bounds.
