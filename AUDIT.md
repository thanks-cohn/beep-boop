# AnimePlex Minimal Extraction Audit

## Scope

This audit reviews the current minimal AnimePlex extraction without implementing fixes. It focuses on the visible text blob at the top of the homepage/reader, current file structure, unnecessary remaining CSS/JS, data-loading fragility, delete/keep candidates, reader side-column feasibility, and whether `/minimal` is clean enough to become the future base.

## Current structure

The current app is a Vite single-page frontend rooted in `index.html` and booted by `/src/main.js`.

- `index.html` provides a legacy three-column outer shell: `#left-sidebar`, `#reader-column`, `#reader-container`, `#right-sidebar`, and footer slots.
- `src/main.js` imports the minimal stylesheet, starts route selection through `Page.start()`, then starts the footer.
- `src/page/page.js` routes by URL parameters: if `work` and `chapter` exist it starts the reader; otherwise it starts the landing page.
- `src/page/landing.js` replaces `#reader-container` with the landing app: ghost-text layer, sticky header/search, rotunda mount, ticker mount, and `#blocks-root`.
- `src/components/blocks.js` replaces `#blocks-root` with a second three-column block shell containing `#blocks-left`, `#blocks-center`, `#blocks-reader`, and `#blocks-right`.
- `src/page/reader.js` can render in two ways:
  - Direct URL route: `Reader.start()` replaces `#reader-container`.
  - In-app click/search route: the `open-reader` listener renders into `#blocks-reader` if it exists, otherwise `#blocks-root`.

## Main finding: why the top of the page is filled with visible text

The visible text at the top is **ghost text** from the atmospheric `text_behind.json` feature, not debug output, JSON output, fallback text, or pasted instructions.

### Which file creates the text

`src/page/landing.js` creates the text. `startSiteGhostText()` imports `src/data/text_behind.json`, reads `textBehind.phrases`, creates `<span class="site-ghost-text">` elements, assigns each phrase as `textContent`, and appends those spans to `.site-ghost-text-layer`.

### Classification

The text is **ghost text that accidentally became visible as normal document text**.

It is not:

- **Debug text:** there is no debug renderer intentionally dumping state to the page.
- **JSON text:** the JSON is imported and phrase strings are assigned into individual spans; the raw JSON file is not printed.
- **Fallback text:** the reader fallback only shows small error boxes such as “Failed to load chapter” or “Unable to load page.”
- **Accidental pasted instructions:** the phrases come from the ghost-text data file and the ghost-text emitter.

### What CSS/JS caused it to become visible

The cause is a mismatch between remaining JS and removed CSS:

1. `Landing.start()` still inserts `<div class="site-ghost-text-layer" aria-hidden="true"></div>` into the landing markup.
2. `startSiteGhostText()` still appends phrase spans into that layer.
3. The minimal `src/styles/landing.css` no longer defines `.site-ghost-text-layer` or `.site-ghost-text` as fixed/absolute, transparent/low-opacity, pointer-events-none, and animated/removed from flow.
4. Because those selectors are missing, each `<span>` behaves like a normal inline element inside the top of `.app-root`, before the header. Inline style values like `left`, `top`, and CSS variables do not position a statically positioned inline span, so the browser lays the words out as visible inline text at the top.

This is a CSS cleanup exposure bug: the ghost-text JS survived the minimal extraction, but the CSS that made it ghost-like was removed.

## Why the same loading/text blob follows into the reader

When a user clicks a rotunda card or search result from the homepage, the app does not replace the entire `#reader-container`. Instead, the `open-reader` listener renders reader pages into `#blocks-reader` when that element exists. `#blocks-reader` is inside the landing `#blocks-root`, which remains inside `.app-root` along with the existing `.site-ghost-text-layer` and header/ticker/block shell.

Therefore:

- The text is inside shared landing layout HTML for in-app reader transitions because `.site-ghost-text-layer` remains in the same `.app-root`.
- The text is injected by shared landing JS (`startSiteGhostText()`), not by reader JS.
- It is from a ghost/helper decoration element, not a fallback/debug element.
- The direct reader route uses `#reader-container`, while the in-app reader route reuses the landing block/root area and renders into `#blocks-reader` or `#blocks-root`.
- CSS cleanup accidentally exposed the hidden helper text by removing the ghost-text styles and by not including a `body.reader-active .site-ghost-text-layer { display: none; }` guard.

`startSiteGhostText()` also keeps a timer running after reader mode. Its emitter returns early when `body.reader-active` is present, so it stops adding new phrases, but already-rendered spans can remain until their missing CSS animation would have ended. Because the animation CSS is gone, those existing spans do not receive an `animationend` event and may not remove themselves.

## Safest fix for the visible top text

The safest fix is to remove or disable the ghost-text feature in the minimal build, rather than attempting to preserve decorative behavior.

Recommended minimal fix:

1. Remove the `text_behind.json` import from `src/page/landing.js`.
2. Remove `startSiteGhostText()` and its call from `Landing.start()`.
3. Remove the `<div class="site-ghost-text-layer" aria-hidden="true"></div>` markup from the landing template.
4. Optionally keep a defensive CSS rule for future safety: `.site-ghost-text-layer { display: none; }`.

Why this is safest:

- It does not affect homepage structure, rotunda, reader, search, JSON loading, source resolution, chapter navigation, or image rendering.
- It removes the timer that continues after navigation.
- It avoids relying on decorative CSS/animation behavior that the minimal extraction intentionally does not need.
- It makes `src/data/text_behind.json` deletable after confirming no other imports remain.

Alternative if the feature should be retained: restore compact CSS for `.site-ghost-text-layer`, `.site-ghost-text`, keyframes, and `body.reader-active .site-ghost-text-layer { display: none; }`. This is less minimal and has more surface area than deleting the feature.

## Remaining unnecessary CSS

Potentially unnecessary or legacy CSS in `src/styles/landing.css`:

- `.blocks-side-rail` appears to have no current DOM producer in the minimal app.
- `.site-click-overlay`, `.site-ad-overlay-root`, and `.reader-ad-slot` are ad-era defensive selectors. They can stay as a harmless shield temporarily, but are not needed if ad code and markup are removed.
- `body.reader-active .blocks-side` and `body.reader-active #blocks-center` are only needed because the in-app reader is nested inside the landing block shell. If reader rendering is changed to replace `#reader-container`, these rules can be deleted.
- `.reader-nav-hidden` plus the autohide rules are functional, but should be reviewed because hiding the top bar quickly can make reader controls feel jumpy. Not a deletion candidate unless UX changes.
- Footer and legacy outer shell CSS is absent; if footer/sidebars are not used, the HTML structure can be simplified later instead of adding CSS for it.

## Remaining unnecessary JS

Potentially unnecessary or legacy JS:

- `startSiteGhostText()` in `src/page/landing.js` is unnecessary for the minimal core and is the direct source of the visible text bug.
- The `text_behind.json` import is unnecessary if ghost text is removed.
- `Footer.start()` is called in `src/main.js`, but the footer component should be audited separately. If it only fills legacy footer slots and is not part of minimal homepage/reader/search/rotunda, it may be removable.
- `appendHtml()` in `src/components/blocks.js` rehydrates scripts inside fetched block HTML. This is powerful and likely unnecessary for a minimal safe base unless block HTML intentionally needs scripts.
- Block support for arbitrary `embed`, `code`, `iframe`, and fetched HTML may be more than the minimal base needs. Images/text are safer and easier to reason about.
- The reader `open-reader` listener renders into `#blocks-reader`/`#blocks-root`, which couples reader mode to landing blocks. A cleaner minimal base would render reader mode into one explicit root.

## Fragile data loading

Data loading works, but several paths are fragile:

- Search fetches `/data/search.index.json` directly and assumes the response JSON has an `entries` array. There is no `response.ok` check, no schema guard, and no fallback UI if the index fails.
- Header ticker fetches `/header-ticker.json` with a `response.ok` check and catches failures, which is safer.
- Blocks import `src/data/blocks.json` at build time but fetch external HTML snippets at runtime. Missing snippets only warn per block, which is resilient, but arbitrary HTML/script loading increases risk.
- Reader manifest loading checks `response.ok`, but direct URL route failure replaces the reader with a generic error and does not offer retry/home controls.
- `Storage.manifest(source, work, chapter)` is trusted by both direct reader and event reader paths. Invalid work/chapter/source values can produce missing manifest URLs or fetch failures.
- `fetch.json`, `storage.json`, and `search.index.json` can drift because search index generation is a separate tool/process rather than enforced at build time.

Recommended guardrails before making `/minimal` the base:

- Add small runtime guards for search index shape.
- Add schema validation or a build-time check for `blocks.json`, `rotunda.json`, `storage.json`, `fetch.json`, and `search.index.json`.
- Decide whether block HTML/scripts are allowed in the minimal base; if not, restrict blocks to text/image/link entries.
- Make the reader render target explicit and consistent.

## Files that can still be deleted after the ghost-text fix

Likely deletable after confirming no imports/references remain:

- `src/data/text_behind.json` if ghost text is removed.
- Old standalone HTML files such as `placeholder.html`, `reveal.html`, `mobile.html`, and the verification-named HTML file if deployment no longer requires them.
- Documentation files that are not part of the future base, if the project wants a clean app-only tree. Keep them until decisions are made.
- Public block snippets under `public/blocks/` only if `src/data/blocks.json` no longer references them.
- `public/data/side_column_images_cycle.json` if no current component uses it.
- `Images/text.txt` if no current code or deployment process uses it.

Do not delete yet; these are audit candidates only.

## Files that must be kept for the current minimal app

Keep these for the current runtime path:

- `index.html`
- `package.json`, `package-lock.json`, `vite.config.js`
- `src/main.js`
- `src/page/page.js`
- `src/page/landing.js`
- `src/page/reader.js`
- `src/components/rotunda.js`
- `src/components/search.js`
- `src/components/blocks.js` while homepage blocks remain enabled
- `src/components/footer.js` while `Footer.start()` is called
- `src/storage/storage.js`
- `src/storage/manifest_resolver.js`
- `src/utils/normalize.js`
- `src/styles/landing.css`
- `src/styles/rotunda.css`
- `src/data/rotunda.json`
- `src/data/blocks.json` while blocks remain enabled
- `src/data/storage.json`
- `src/data/fetch.json`
- `public/data/search.index.json` because search fetches this URL
- `public/header-ticker.json` while the ticker remains enabled
- image/content assets referenced by JSON manifests or public block snippets

## Reader side columns and `blocks.js`

### Does `blocks.js` still exist?

Yes. `src/components/blocks.js` exists and currently renders the landing block shell.

### Does the reader view have left/right column containers?

There are two possible interpretations:

- The static `index.html` outer shell has `#left-sidebar` and `#right-sidebar`, each with top/middle/bottom divs. The current minimal JS does not populate them.
- The `blocks.js` shell creates current active side columns: `#blocks-left` and `#blocks-right` inside `.blocks-side` asides.

During in-app reader mode, `open-reader` renders into `#blocks-reader`, so the `blocks.js` shell can still exist. However, current CSS hides `.blocks-side` whenever `body.reader-active` is set. That means the side columns are present in the DOM but hidden in reader mode.

During direct reader URL mode, `Reader.start()` replaces `#reader-container` directly and does not create the `blocks.js` shell, so `#blocks-left`, `#blocks-right`, and `#blocks-reader` do not exist.

### Can reader side columns be populated through `blocks.js`?

Yes, but only after a small structural decision.

Current state:

- `blocks.js` can populate `#blocks-left` and `#blocks-right` from `blocksData.left` and `blocksData.right`.
- In-app reader renders into `#blocks-reader`, which is already between those columns.
- CSS currently hides the side columns in reader mode.
- Direct reader URLs bypass `blocks.js`, so side columns would not appear unless reader mode creates or requests a shell.

IDs/classes that would be needed:

- Existing option: `#blocks-root`, `#blocks-shell`, `#blocks-left`, `#blocks-reader`, `#blocks-right`, `.blocks-side`, `.blocks-main`.
- Cleaner reader-specific option: `#reader-layout`, `#reader-left`, `#reader-main`, `#reader-right`, with `.reader-side` and `.reader-main` classes.

### Can blocks load safely without slowing the reader?

Yes, if side blocks are loaded after or parallel to reader page setup and with strict limits:

- Render the reader immediately before side blocks.
- Lazy-load side images (`loading="lazy"` is already used).
- Avoid iframes/scripts in reader side columns.
- Prefer static images/text only.
- Do not await side blocks before manifest/page rendering.
- Hide side columns on small screens.

### Minimal implementation plan if reader side columns are desired

Safest plan:

1. Add a reader-specific shell in `reader.js` or refactor `Blocks.renderShell()` into a reusable function.
2. Render pages into an explicit main container such as `#reader-main`.
3. Populate left/right side rails from a new `blocksData.readerLeft` and `blocksData.readerRight`, or reuse `left`/`right` if duplication is acceptable.
4. Do not load arbitrary HTML/scripts in reader side rails; support only images/text/links.
5. CSS: show side rails only above a desktop breakpoint, keep manga pages centered, and never overlay side rails on pages.
6. For in-app and direct reader routes, use the same reader layout so behavior is consistent.

## Sticky reader search

A sticky reader search is possible and should reuse existing search logic rather than create a second independent index implementation.

### Best placement

Best minimal placement: inside the existing `.reader-home-bar`, preferably as a compact search control in the right group or as a second row below the navigation controls.

Reasons:

- The bar is already sticky and reader-specific.
- It avoids adding another overlay layer above manga pages.
- It keeps search close to Home/Previous/Next/Chapter controls.
- It can reuse the same result dropdown styles with reader-specific positioning.

### Mobile behavior

On mobile, the search should collapse into a full-width row within the sticky bar or into a button that expands the input. Results should be constrained to a max height and should not cover the entire viewport. The current mobile CSS already stacks reader bar content into one column, so a search row can fit naturally.

### Reuse existing search logic

Recommended refactor:

- Extract the reusable search mounting logic from `Search.start()` into a function such as `Search.mount(mountElement, options)`.
- Keep `Search.start()` as a landing wrapper that calls `Search.mount(document.querySelector(".landing-search"))`.
- Reader can call `Search.mount(readerSearchMount, { clearOnSelect: true })`.
- Keep a shared cached search-index promise so landing and reader do not fetch `/data/search.index.json` twice.

### Risk of covering manga pages

The risk is moderate if search is implemented as a separate fixed overlay. It is low if search lives in the existing sticky reader bar and the dropdown is constrained to the bar width with a max height. On mobile, the dropdown should push within the bar or stay compact rather than cover page content aggressively.

### Safest minimal implementation

1. Add a `<div class="reader-search"></div>` mount to the existing reader bar.
2. Refactor `Search` to expose reusable mount logic and cached index loading.
3. Add reader-specific CSS for `.reader-search` and constrain `.reader-search .search-results`.
4. Do not create a second fixed header.
5. Ensure selecting a result dispatches the existing `open-reader` event, so reader navigation remains consistent.

## Is `/minimal` clean enough to become the future base?

Not yet.

It is close because the core pieces are identifiable and mostly compact: landing, rotunda, search, reader, blocks, storage, and JSON data. However, the visible ghost text bug shows that minimal extraction removed CSS without removing the matching JS/markup. There is also still coupling between landing blocks and in-app reader rendering.

Before using it as the future base, fix these issues:

1. Remove or fully restyle ghost text.
2. Make reader rendering target consistent between direct URL and in-app navigation.
3. Decide whether blocks are a homepage-only feature or a shared layout feature.
4. Remove or constrain arbitrary block HTML/script loading.
5. Add guards around search/data loading.
6. Remove dead CSS selectors and unused public assets after reference checks.
7. Add smoke tests for homepage load, search result open, rotunda open, direct reader URL, and mobile layout.

## Recommended fix order

1. Remove ghost-text JS/markup/data or restore its CSS hiding behavior. Prefer removal for minimal.
2. Refactor reader mounting so in-app and direct reader routes use the same root/layout.
3. Refactor search into a reusable mount for future sticky reader search.
4. Decide the blocks policy: homepage only, reader side rails, or remove entirely.
5. Tighten data loading and schema checks.
6. Delete confirmed unused files/assets in a separate cleanup commit.
