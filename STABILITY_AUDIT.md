# Stability Audit

## 1. System Understanding (minimal)

This repository appears to be a Vite-powered static web reader for manga/comic works. The browser app renders either a landing/search experience or a direct reader view, using JSON data files for search/work metadata and external storage/CDN manifests for chapter pages.

Entry points only:

- `index.html` loads `/src/main.js` as the browser module entry point.
- `src/main.js` calls `Page.start()` and renders a generic page-level fallback if startup throws.
- `src/page/page.js` routes based on `work` and `chapter` query parameters:
  - with both parameters: `Reader.start(work, chapter)`.
  - otherwise: `Landing.start()`.
- `src/page/landing.js` creates the landing DOM and starts `Search.start()` and `Rotunda.start()` behind local warning-only error guards.
- `src/page/reader.js` fetches a chapter manifest and renders image pages.
- `src/tools/generate_search.py` is a build/support script that compiles `fetch.json` and `storage.json` into `search.index.json`.

## 2. Critical Failure Points

### 2.1 Storage profile lookup can throw before caller fallback is active

- **File path:** `src/storage/storage.js`
- **Function / module:** `Storage.profile()`, `Storage.source()`, `Storage.manifest()`
- **What triggers failure:** `storage.active` points to a missing profile, the active profile lacks `sources`, or a direct-reader URL supplies an unknown `source` query parameter.
- **Why it fails:** `Storage.profile()` returns `storage[this.active()]` without validation, and `Storage.source()` immediately dereferences `.sources[id]`. If the profile is missing, this becomes a synchronous `TypeError`; if the source ID is missing, it throws `Unknown storage source`. In `Reader.start()`, `Storage.manifest(source, work, chapter)` is called before the `try` block, so this error bypasses the reader-specific fallback and bubbles to the top-level boot handler.
- **Severity:** **HIGH**

### 2.2 Reader assumes manifest schema is valid

- **File path:** `src/page/reader.js`
- **Function / module:** `renderManifestInto(root, manifestUrl)`
- **What triggers failure:** A fetched manifest is valid JSON but omits `pages`, `base_url`, `padding`, or `extension`, or contains wrong types.
- **Why it fails:** The code only checks HTTP status before parsing JSON. It then loops with `i <= manifest.pages` and builds image URLs from unvalidated fields. Missing or non-numeric `pages` can render zero pages with no visible error; missing `base_url`, `padding`, or `extension` produces broken image URLs such as `undefined/001.undefined` rather than a thrown error.
- **Severity:** **HIGH**

### 2.3 Open-reader event handler assumes event detail shape

- **File path:** `src/page/reader.js`
- **Function / module:** global `window.addEventListener("open-reader", ...)`
- **What triggers failure:** Any code dispatches `open-reader` without a detail object, with `detail: null`, or with a result missing `manifest_url`.
- **Why it fails:** The handler reads `entry.manifest_url` without checking that `entry` is non-null. A missing detail causes a synchronous `TypeError` inside the async listener. If `manifest_url` is missing but `entry` exists, `renderManifestInto()` logs a warning and returns without changing the UI, so the click appears to do nothing.
- **Severity:** **MEDIUM**

### 2.4 Search index fetch does not check HTTP status or JSON shape

- **File path:** `src/components/search.js`
- **Function / module:** `Search.start()`
- **What triggers failure:** `/data/search.index.json` returns a 404/500 HTML page, invalid JSON, a partial response, or a JSON value that is not an object with `entries`.
- **Why it fails:** The code performs `fetch(SEARCH_INDEX_URL).then(r => r.json())` without checking `r.ok`. If parsing fails, `Search.start()` rejects and landing catches it as a warning, leaving the search DOM rendered but nonfunctional. If parsing succeeds but the JSON is `null`, input handling later evaluates `index.entries` and throws on each input event.
- **Severity:** **HIGH**

### 2.5 Search rendering assumes result container exists

- **File path:** `src/components/search.js`
- **Function / module:** `renderResults(container, results)`
- **What triggers failure:** The `.search-results` element is missing after `mount.innerHTML` is assigned, or external DOM mutation removes it before an input event.
- **Why it fails:** `renderResults()` calls `container.replaceChildren()` without a null check. This is not caught inside the input event callback and can surface as repeated runtime errors while typing.
- **Severity:** **MEDIUM**

### 2.6 Rotunda silently degrades to an empty carousel on network/storage failure

- **File path:** `src/components/rotunda.js`
- **Function / module:** `Rotunda.start()`
- **What triggers failure:** Any first-chapter manifest request fails, returns non-OK, returns invalid JSON, or references missing manifest fields.
- **Why it fails:** Each work is processed sequentially in a `try` block. Failures are logged and skipped. This avoids a full app crash, but if the storage origin, CORS policy, or manifest format is wrong for all works, the final DOM still renders an empty `.rotunda-track` with no user-facing failure state.
- **Severity:** **MEDIUM**

### 2.7 Rotunda injects data into `innerHTML` without escaping

- **File path:** `src/components/rotunda.js`
- **Function / module:** `Rotunda.start()` final `container.innerHTML`
- **What triggers failure:** `rotunda.works[].display`, manifest `base_url`, or derived image URL contains markup-significant characters or injected HTML.
- **Why it fails:** Card markup is built with template strings and assigned through `innerHTML`. Unlike search results, which use `textContent`, rotunda titles and image attributes are inserted as raw HTML. Bad data can break markup; malicious data in local JSON or remote manifest content could execute browser-parsed HTML behavior.
- **Severity:** **HIGH**

### 2.8 Fetch module uses a development source path that may not exist after build/deploy

- **File path:** `src/fetch/fetch.js`
- **Function / module:** `Fetch.load()`
- **What triggers failure:** Any runtime use of `Fetch.load()` in a production build where `/src/data/fetch.json` is not served as a public asset.
- **Why it fails:** The hardcoded URL is `/src/data/fetch.json`, while the public search file uses `/data/search.index.json`. Vite source files are bundled, but arbitrary `/src/data/*.json` paths are not guaranteed to be deployable static URLs. A 404 causes `Fetch.load()` to throw.
- **Severity:** **MEDIUM**

### 2.9 Fetch cache does not deduplicate concurrent loads

- **File path:** `src/fetch/fetch.js`
- **Function / module:** `Fetch.load()`
- **What triggers failure:** Multiple callers invoke `Fetch.load()` at nearly the same time before `#cache` is assigned.
- **Why it fails:** The cache stores only completed JSON data. It does not store an in-flight promise, so concurrent calls make duplicate network requests and can resolve with different outcomes if the file changes or one request fails.
- **Severity:** **LOW**

### 2.10 Advertising assumes full config shape and popup API availability

- **File path:** `src/advertising/advertising.js`
- **Function / module:** `Advertising.trigger()`
- **What triggers failure:** `advertisingConfig.popunder` is missing, `popunder.url` is absent, `cooldown_seconds` is absent/non-numeric, or `window.open` is blocked/unavailable.
- **Why it fails:** The module dereferences `advertisingConfig.popunder.url` directly and multiplies `cooldown_seconds` without validation. If `window.open` returns `null` due to popup blocking, the code still returns `true` after updating `lastAdvertisement`, causing state to report a successful ad display when none opened.
- **Severity:** **MEDIUM**

### 2.11 Blocks module targets a DOM ID not produced by the landing page

- **File path:** `src/blocks/blocks.js`
- **Function / module:** `Blocks.render()`, `Blocks.header()`, `Blocks.body()`
- **What triggers failure:** Any future/current caller invokes `Blocks.render()` on the landing DOM generated by `Landing.start()`.
- **Why it fails:** `Blocks.render()` requires `#landing-blocks`, but `Landing.start()` creates `#blocks-root`. `Blocks.render()` throws `Missing #landing-blocks`; `header()` and `body()` also assume the same element and would dereference `null` if called directly.
- **Severity:** **MEDIUM**

### 2.12 Search index generator writes URLs with unencoded path segments

- **File path:** `src/tools/generate_search.py`
- **Function / module:** `manifest_url()`, `safe_path_join()`, `build_index()`
- **What triggers failure:** Work slugs or chapter paths contain spaces, `#`, `?`, `%`, or other URL-significant characters.
- **Why it fails:** `reader_url()` URL-encodes query parameters, but `manifest_url()` uses `safe_path_join()` and does not percent-encode path segments. Generated `manifest_url` values can become invalid or point to the wrong storage object when clicked from search.
- **Severity:** **MEDIUM**

## 3. Edge Cases Not Handled

- **Direct reader with unknown source:** Breaks in `src/storage/storage.js` via `Storage.source()` and is triggered from `src/page/reader.js` before the local reader `try` block. Runtime result: top-level `main.js` error screen instead of the reader-specific chapter error.
- **Direct reader with missing `work` or `chapter`:** `src/page/page.js` only opens the reader if both are present. Runtime result: a partially specified URL silently loads the landing page rather than indicating an invalid reader URL.
- **Manifest HTTP failure:** `src/page/reader.js` throws `Manifest failed: <status>` and catches it in direct-reader/search-reader contexts. Runtime result: the target container is replaced with `Failed to load chapter`.
- **Manifest JSON parse failure:** `src/page/reader.js` catches parse failures in callers that wrap `renderManifestInto()`. Runtime result: the target container is replaced with `Failed to load chapter`.
- **Manifest missing `pages`:** `src/page/reader.js` renders the wrapper and anchor but no images because the `for` condition is never true. Runtime result: blank reader area with no error message.
- **Manifest missing `base_url`, `padding`, or `extension`:** `src/page/reader.js` creates image elements with malformed URLs. Runtime result: broken images rather than a thrown failure.
- **Very large `manifest.pages`:** `src/page/reader.js` creates one `img` element per page synchronously. Runtime result: slow rendering, high DOM/memory usage, and possible browser tab instability.
- **Search index unavailable:** `src/components/search.js` rejects from `Search.start()`, and `src/page/landing.js` logs `search failed`. Runtime result: search box remains visible but has no working input behavior.
- **Search index is JSON `null`:** `src/components/search.js` stores `index = null`; the input listener then crashes on `index.entries`. Runtime result: typing in search throws errors and no results render.
- **Search result missing `normalized`:** `src/components/search.js` uses optional chaining and treats it as non-match. Runtime result: the result is silently unsearchable.
- **Search result missing `display`:** `src/components/search.js` assigns `undefined` to `textContent`. Runtime result: a blank clickable result may appear.
- **Search result missing `manifest_url`:** `src/page/reader.js` receives the event, `renderManifestInto()` logs a missing `manifestUrl` warning, and returns. Runtime result: clicking the result appears to do nothing.
- **Rotunda work has no chapters:** `src/components/rotunda.js` logs and skips it. Runtime result: the work is absent from the rotunda.
- **Rotunda work has unknown source:** `src/components/rotunda.js` logs and skips it. Runtime result: the work is absent from the rotunda.
- **Rotunda all manifest requests fail:** `src/components/rotunda.js` renders an empty `.rotunda-track`. Runtime result: visually empty rotunda area with only console warnings.
- **Storage active profile missing in browser runtime:** `src/storage/storage.js` can throw when dereferencing `this.profile().sources`. Runtime result depends on caller; direct reader bubbles to top-level boot fallback.
- **Production storage left as placeholder CDN:** `src/data/storage.json` production sources point to `https://cdn.example.com/works`. Runtime result: if active is changed to `production` without replacing those values, all manifest loads point to placeholder URLs and fail.
- **Popup blocked:** `src/advertising/advertising.js` updates cooldown state and returns `true` even if `window.open()` returns `null`. Runtime result: advertising state says an ad was triggered while the browser blocked it.
- **Search generation missing input files:** `src/tools/generate_search.py` exits via `SystemExit` if `fetch.json` or `storage.json` cannot be found. Runtime result: build/support command fails before writing an index.
- **Search generation malformed JSON:** `src/tools/generate_search.py` does not catch `json.load()` failures. Runtime result: uncaught traceback and no output index.
- **Search generation source absent:** `src/tools/generate_search.py` raises `ValueError` if `--source` is not in active storage sources. Runtime result: uncaught traceback and no output index.

## 4. Cascading Failure Chains

1. **Bad storage source in URL**
   - `?source=bad&work=...&chapter=...` reaches `Page.start()`.
   - `Page.start()` calls `Reader.start(work, chapter)`.
   - `Reader.start()` calls `Storage.manifest(source, work, chapter)` before its local `try` block.
   - `Storage.source()` throws for the unknown source.
   - The exception bubbles to `main.js`, which replaces `#reader-container` with a generic `Unable to load page` message.

2. **Search index unavailable**
   - `Landing.start()` creates `.landing-search` and calls `safeStart("search", Search.start)`.
   - `Search.start()` assigns search HTML, then fetches `/data/search.index.json` and parses JSON without `r.ok` validation.
   - Fetch or parse failure rejects `Search.start()`.
   - `safeStart()` logs a warning and continues to rotunda.
   - The visible search box remains mounted with no input listener, so user search silently fails from the UI perspective.

3. **Generated search index contains bad manifest URL**
   - `src/tools/generate_search.py` builds `manifest_url` with unencoded path joining.
   - `Search.start()` loads that entry and renders it as a result.
   - Clicking the result dispatches `open-reader` with the generated entry.
   - The reader event handler calls `renderManifestInto(root, entry.manifest_url)`.
   - Fetching the malformed/wrong manifest URL fails, and `#blocks-root` is replaced with `Failed to load chapter`.

4. **Remote storage/CORS outage**
   - `Rotunda.start()` sequentially fetches first-chapter manifests from storage.
   - Every failed request is skipped and logged.
   - The rotunda renders with zero cards.
   - If the user opens a chapter directly or through search, `renderManifestInto()` fetches from the same unavailable storage and renders `Failed to load chapter`.

5. **Manifest schema drift**
   - Storage returns JSON but changes field names or types for `pages`, `base_url`, `padding`, or `extension`.
   - `Reader.renderManifestInto()` does not validate schema.
   - The reader may render no pages or broken image URLs.
   - `Rotunda.start()` builds cover URLs from the same fields and may render broken covers or skipped cards.

6. **Landing block ID mismatch if Blocks is wired in**
   - `Landing.start()` creates `#blocks-root`.
   - `Blocks.render()` searches for `#landing-blocks`.
   - The missing element throws `Missing #landing-blocks`.
   - If called during startup without a local guard, it can bubble to the page-level boot fallback.

## 5. Hidden Fragility Zones

- **Storage is tightly coupled to JSON shape:** `Storage.profile()` and `Storage.source()` assume `storage.active`, the active profile, and `sources` all exist. There is no local validation before dereferencing.
- **Reader manifest contract is implicit:** `renderManifestInto()` assumes every manifest has numeric `pages`, valid `base_url`, numeric `padding`, and an `extension`. Multiple modules depend on the same remote manifest shape.
- **Search has two different normalization paths:** Browser search imports `normalize` but does not use it in `Search.start()`; it lowercases and splits raw input. The generator has its own Python normalization/tokenization logic. This is a fragile assumption between generated data and browser filtering.
- **Search result contract is implicit:** Search rendering expects entries to have `display`, `normalized`, and `manifest_url`, but there is no runtime validation of the loaded index.
- **Rotunda uses raw `innerHTML`:** Rotunda card HTML interpolates `card.image` and `card.title` directly. This is fragile with malformed local JSON or remote manifest values.
- **Silent failure pattern on landing:** `safeStart()` catches and logs search/rotunda failures without any visible UI state. This preserves page boot but hides partial subsystem failure from users.
- **Sequential network dependency in rotunda:** Rotunda fetches each work manifest one after another. A slow manifest delays all later cards.
- **Hardcoded runtime paths:** `src/components/search.js` hardcodes `/data/search.index.json`; `src/fetch/fetch.js` hardcodes `/src/data/fetch.json`; `src/data/storage.json` hardcodes development R2 URLs and placeholder production CDN URLs.
- **DOM ID mismatch:** `Blocks` uses `#landing-blocks`, while the current landing markup uses `#blocks-root`.
- **Advertising state can desynchronize from browser reality:** `lastAdvertisement` is updated before knowing whether the popup actually opened.
- **Build script path discovery is implicit:** `generate_search.py` searches parent directories for several candidate data paths. In unusual working trees, the first matching file may not be the intended project data file.

## 6. Runtime Risk Summary

- **Most likely first point of failure under real usage:** External storage manifest fetches. Reader rendering and rotunda cards both depend on remote manifest URLs and a fixed manifest schema.
- **Worst-case crash scenario:** A direct reader URL with an unknown or invalid `source` causes `Storage.manifest()` to throw before the reader fallback is active, bubbling to `main.js` and replacing the reader container with the generic startup error.
- **Most fragile subsystem:** The reader/search/storage chain is the most fragile because generated search entries, query parameters, storage profile configuration, remote manifests, and DOM replacement all need to agree exactly.

## 7. Severity Heatmap (TEXT ONLY)

### CRITICAL RISK

- None identified as a proven full-system critical failure from the current code alone.

### HIGH RISK

- `src/storage/storage.js` + `src/page/reader.js` direct-reader source handling.
- `src/page/reader.js` manifest schema assumptions.
- `src/components/search.js` search index fetch/status/shape handling.
- `src/components/rotunda.js` raw HTML interpolation from data.

### MEDIUM RISK

- `src/components/rotunda.js` network-dependent sequential card loading and empty silent fallback.
- `src/page/reader.js` `open-reader` detail assumptions.
- `src/fetch/fetch.js` hardcoded `/src/data/fetch.json` runtime URL.
- `src/advertising/advertising.js` config shape and popup-state assumptions.
- `src/blocks/blocks.js` DOM ID mismatch with current landing markup.
- `src/tools/generate_search.py` unencoded generated manifest paths and uncaught input/JSON errors.

### LOW RISK

- `src/fetch/fetch.js` duplicate concurrent load requests before cache assignment.
- `src/main.js` generic top-level fallback, which prevents total blank-page failure but loses specific failure context.
- `src/utils/normalize.js` non-string input handling is defensive; risk is mainly mismatch with the Python generator rather than direct failure.

## 8. Final Safety Statement

- **System is moderately stable.**
- **Confidence score:** 78/100.
- **Top 3 things most likely to break in production:**
  1. Remote chapter manifests fail to load or do not match the assumed `pages` / `base_url` / `padding` / `extension` schema.
  2. Search index loading fails or returns an unexpected shape, leaving the search UI visible but nonfunctional.
  3. Storage source/profile configuration drifts from URL/query/search data assumptions, causing direct reader startup or search-opened reader flows to fail.
