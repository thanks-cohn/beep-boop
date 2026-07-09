# Purpose
Create a lean minimal build of the site by keeping only the CSS and JavaScript needed for the homepage, rotunda/carousel, reader, search, JSON loading, source resolution, chapter/page display, and mobile usability.

# Files Added
- `EDIT.md` — documents the extraction, cleanup decisions, preserved behavior, omissions, and before/after totals for future developers.

# Files Modified
- `src/styles/landing.css`
  - Rebuilt as a compact minimal stylesheet instead of carrying forward the prior large experimental stylesheet.
  - Keeps layout, header/search, ticker, JSON blocks, reader, and mobile rules.
  - Functionality changed only by removing premium/ad/ghost visual effects and obsolete layout styling.
- `src/styles/rotunda.css`
  - Rebuilt as a compact carousel stylesheet for the current rotunda DOM.
  - Keeps cover positioning, arrows, overlays, swipe-friendly sizing, and mobile behavior.
  - Functionality unchanged for the carousel; visual effects were simplified.
- `src/main.js`
  - Removed ad overlay startup and page advertisement installation.
  - Keeps page boot and footer startup.
  - Functionality changed by intentionally omitting advertising overlays from the minimal build.
- `src/page/reader.js`
  - Removed between-page advertisement lookup and insertion.
  - Keeps manifest resolution, page image rendering, chapter navigation, home/prev/next/last controls, and `open-reader` event handling.
  - Functionality changed only by omitting reader ads.
- `src/components/blocks.js`
  - Simplified JSON block rendering to images, text, HTML fragments, embeds, and iframes.
  - Removed sidebar refresh/rail logic and unused block variants.
  - Functionality changed by making side columns static instead of periodically refreshing.
- `src/page/page.js`
  - Removed a stale file-path comment.
  - No functionality changed.

# Files Deleted
- `src/components/ads.js`
  - Removed because advertisement providers, overlays, and reader ad slots are outside the minimal core.
  - Replaced by no-op omission; the minimal build does not render ads.
- `src/advertising/overlay.js`
  - Removed because click-through overlay advertising is outside the minimal core.
  - Replaced by no-op omission.
- `src/advertising/advertising.js`
  - Removed because legacy advertising code is unused by the minimal build.
  - Replaced by no-op omission.
- `src/styles/landing.css.bak`
  - Removed because it was a backup copy of old styling.
  - Replaced by the rebuilt `src/styles/landing.css`.
- `src/styles/landing.css.messy-backup`
  - Removed because it was an obsolete messy backup copy.
  - Replaced by the rebuilt `src/styles/landing.css`.

# CSS Cleanup
- Removed duplicate global/app-root/header/search patterns from the old landing stylesheet.
- Removed conflicting and excessive visual-effect rules, including premium background effects and ad overlay styling.
- Removed dead selectors for deleted ad/overlay systems and old layout experiments.
- Simplified mobile media queries to two breakpoints: tablet/narrow and small-phone.
- Rebuilt rotunda CSS around the actual classes emitted by `src/components/rotunda.js`.
- Approximate CSS lines removed: 1,328 original CSS lines reduced to 2 minified CSS lines, representing about 1,326 removed source lines before formatting/minification considerations.

# JavaScript Cleanup
- Removed ad overlay boot flow and advertisement slot rendering.
- Removed reader ad lookup/insertion helpers.
- Removed sidebar refresh timer logic, split rail rendering, and unused block branching.
- Removed stale commented file-path code.
- Remaining runtime flow:
  1. `src/main.js` imports CSS and starts `Page` and `Footer`.
  2. `Page` routes query-string chapter URLs to `Reader`; otherwise it starts `Landing`.
  3. `Landing` renders header/search, rotunda mount, ticker, and JSON block shell.
  4. `Search` loads `/data/search.index.json` and emits `open-reader` events.
  5. `Rotunda` loads `storage.json`/`rotunda.json`, fetches manifests, resolves sources, and opens reader chapters.
  6. `Reader` resolves manifests and renders chapter page images.

# Functionality Preserved
- Homepage: preserved.
- Rotunda/carousel: preserved.
- Reader: preserved.
- `storage.json`: preserved through `Storage` and rotunda source checks.
- `fetch.json`: preserved through reader chapter navigation.
- Image loading: preserved for block images, rotunda covers, thumbnails, and reader pages.
- Mobile: preserved with simplified responsive layout and reader controls.
- Search: retained and preserved.

# Known Limitations
- Advertising overlays, reader ads, and provider-script loading are intentionally omitted.
- Side columns no longer auto-refresh every 90 seconds.
- Premium/ambient visual effects were removed or simplified.
- The CSS is intentionally minimal and does not attempt to reproduce every prior decorative detail.

# Future Work
- Format rebuilt CSS into multi-line sections if long-term hand editing is preferred over compactness.
- Add a lightweight smoke test for opening a rotunda item and a search result.
- Add schema validation for `blocks.json`, `rotunda.json`, `storage.json`, and `fetch.json`.
- Consider generating the search index during build so it cannot drift from content metadata.

# Before/After
- CSS lines before/after: approximately 1,328 before / 2 after.
- JS lines before/after for touched runtime files: approximately 953 before / 716 after.
- Total files before/after: approximately 67 before / 63 after.
- Total project size before/after: approximately 24 MB before / 24 MB after, excluding `.git`, `node_modules`, and `dist`; deleted source files were small compared with image assets and lockfiles.
