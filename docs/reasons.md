# AnimePlex Homepage Performance Investigation

Date: 2026-07-10

## Investigation method

This pass started with a production build and source-level profiling of the homepage startup path. The build confirmed the client bundle is modest, so the main delays were not from JavaScript transfer size. The heavier costs were startup ordering, duplicate/early network work, sequential async work, and DOM churn while constructing the homepage.

Baseline production build observed before changes:

- JavaScript: `dist/assets/main-DHqnV3vJ.js` — 35.94 kB, 10.23 kB gzip.
- CSS: `dist/assets/main-DOKsN30U.css` — 9.42 kB, 2.90 kB gzip.
- Build time: 393 ms.

## Optimizations made

### 1. Homepage modules no longer block each other during startup

- **What the overhead was:** Search, rotunda, blocks, and header ticker started one after another. Each awaited task delayed every later task even when the work was independent.
- **Why it was happening:** `Landing.start()` used sequential `await safeStart(...)` calls.
- **Where it occurred:** Homepage startup in `src/page/landing.js`.
- **How often it occurred:** Once on every homepage load.
- **What was changed:** Independent homepage features are now started with one `Promise.all(...)` call.
- **Why the new approach is better:** Network requests and DOM construction for independent regions can overlap. The rotunda no longer waits for search setup, blocks no longer wait for the rotunda, and the ticker no longer waits for all previous features.
- **Tradeoffs:** Console warnings can now appear in the order tasks finish rather than source order. User-facing behavior and appearance are unchanged.

### 2. Rotunda work manifests load concurrently

- **What the overhead was:** Rotunda cards were resolved with `await loadWork(...)` inside a loop. If multiple work manifests needed fetching, each manifest waited for the previous one to finish.
- **Why it was happening:** Sequential loop control flow was simple but serialized independent manifest work.
- **Where it occurred:** Rotunda card preparation in `src/components/rotunda.js`.
- **How often it occurred:** Once per homepage rotunda initialization, multiplied by every rotunda work.
- **What was changed:** Rotunda work resolution now uses `Promise.all(...)` across all configured works.
- **Why the new approach is better:** Independent manifest fetches and JSON parsing can overlap, reducing total time to first complete rotunda render on high-latency connections.
- **Tradeoffs:** Multiple manifest requests may be in flight at once. The current rotunda has a small number of works, so concurrency is bounded by the existing rotunda list.

### 3. Search index loading is deferred and cached

- **What the overhead was:** The full search index was fetched and parsed during initial homepage startup even when the user never searched.
- **Why it was happening:** `Search.start()` awaited `/data/search.index.json` before completing setup.
- **Where it occurred:** Search initialization in `src/components/search.js`.
- **How often it occurred:** Once on every homepage load.
- **What was changed:** The search box renders immediately, and the index is fetched on first focus or first input. The fetch promise is cached and reused.
- **Why the new approach is better:** Initial page load avoids an unnecessary request and JSON parse for users who do not search. Users who do search still get the same results, and repeated focus/input events reuse the same promise instead of starting duplicate fetches.
- **Tradeoffs:** The first search interaction may pay the index fetch if the user types before the focus prefetch completes. This is preferable to charging every homepage load for search data that may never be used.

### 4. Search result rendering uses one delegated click listener

- **What the overhead was:** Every rendered search result created its own click listener.
- **Why it was happening:** Result elements were built imperatively with per-node handlers.
- **Where it occurred:** Search result rendering in `src/components/search.js`.
- **How often it occurred:** On every search input that produced results.
- **What was changed:** Results now store an index in `data-result-index`, and the results container handles clicks with one listener.
- **Why the new approach is better:** This reduces event listener churn and allocation during fast typing while preserving identical click behavior.
- **Tradeoffs:** The click handler now looks up the active result by index, so the code keeps an `activeMatches` array for the currently rendered list.

### 5. Search stops scanning after the visible result limit

- **What the overhead was:** Search filtered the entire index and then sliced to the first 12 results.
- **Why it was happening:** `Array.filter(...).slice(0, 12)` is concise but always scans every entry.
- **Where it occurred:** Search input handling in `src/components/search.js`.
- **How often it occurred:** On every search keystroke.
- **What was changed:** Search now pushes matches into an array and breaks once 12 visible results are found.
- **Why the new approach is better:** Common queries avoid scanning entries that cannot be displayed, reducing CPU work on low-end devices.
- **Tradeoffs:** None for current behavior because only the first 12 matches were ever displayed before.

### 6. Block columns fetch and render concurrently

- **What the overhead was:** Left, right, and center homepage blocks rendered sequentially, and each item in a column waited for the prior item.
- **Why it was happening:** `Blocks.start()` awaited each column in order, and `renderBlocks()` awaited each block in a loop.
- **Where it occurred:** Homepage block rendering in `src/components/blocks.js`.
- **How often it occurred:** Once per homepage load, plus once for every HTML-backed block in the configured columns.
- **What was changed:** Columns now render with `Promise.all(...)`, and block items within a column are built concurrently before a single `replaceChildren(...)` update.
- **Why the new approach is better:** HTML block fetches can overlap, and each column performs one final DOM replacement instead of appending after each awaited item.
- **Tradeoffs:** Blocks still appear in configured order because `Promise.all(...)` preserves result order. Independent block fetch failures are still caught per block.

### 7. Rotunda card DOM insertion is batched

- **What the overhead was:** Each rotunda card was appended to the track as it was created.
- **Why it was happening:** Card construction and insertion happened in the same loop.
- **Where it occurred:** Rotunda DOM construction in `src/components/rotunda.js`.
- **How often it occurred:** Once per rotunda initialization, multiplied by every rotunda card.
- **What was changed:** Cards are created first and appended to the track in one operation.
- **Why the new approach is better:** Batching avoids repeated DOM mutation work and gives the browser fewer opportunities to schedule style/layout invalidation during construction.
- **Tradeoffs:** None. The resulting DOM order and appearance are unchanged.

### 8. Static manifest fetches no longer bypass browser cache

- **What the overhead was:** Some static JSON fetches used `cache: "no-store"`, preventing normal browser cache reuse.
- **Why it was happening:** The fallback and fetch helper paths forced fresh network requests even though these files are static content in the current architecture.
- **Where it occurred:** Rotunda thumbnail error fallback in `src/components/rotunda.js` and the shared fetch helper in `src/fetch/fetch.js`.
- **How often it occurred:** The rotunda path occurred only when all configured thumbnail candidates failed; the helper path occurred whenever that helper loaded catalog or chapter data.
- **What was changed:** Forced `no-store` options were removed, and rotunda fallback manifest URL promises are cached in memory.
- **Why the new approach is better:** Browser HTTP cache and in-page promise reuse can avoid redundant manifest/catalog requests.
- **Tradeoffs:** Static files now use normal HTTP cache behavior. That matches the production asset model and avoids unnecessary revalidation on slow networks.

### 9. Duplicate URL filtering uses a `Set`

- **What the overhead was:** Thumbnail candidate deduplication used `filter(... indexOf ...)`, which repeatedly rescanned the list.
- **Why it was happening:** The original helper favored compatibility and readability.
- **Where it occurred:** Rotunda thumbnail candidate preparation in `src/components/rotunda.js`.
- **How often it occurred:** Once per rotunda card.
- **What was changed:** Deduplication now uses `new Set(...)`.
- **Why the new approach is better:** The code is shorter and avoids repeated scans. This is a small improvement, but it is deterministic and readable.
- **Tradeoffs:** None for supported browsers.

### 10. Work manifest loads are cached in memory

- **What the overhead was:** The same work manifest could be requested again when different features needed chapter metadata for the same work.
- **Why it was happening:** `loadWork(...)` fetched external work manifests but did not retain the in-flight or resolved promise.
- **Where it occurred:** Shared work manifest resolution in `src/storage/work_manifest.js`, used by the rotunda and reader navigation.
- **How often it occurred:** Whenever a work without inline chapters was resolved more than once during a page session.
- **What was changed:** External work manifest promises are cached by catalog/work key. Inline chapter data is still returned directly.
- **Why the new approach is better:** In-flight callers share one request, and later callers reuse the resolved manifest without another network round trip or JSON parse.
- **Tradeoffs:** The cache lives for the current page session, which is appropriate for static manifest files. A full page reload still gets normal browser cache validation behavior.

### 11. Ghost text no longer blocks homepage startup

- **What the overhead was:** The decorative ghost-text phrase JSON was loaded before the main page was started. Slow phrase loading could delay the homepage shell, rotunda, search, and blocks.
- **Why it was happening:** `boot()` called `startGhostText()` before `Page.start()`, and `startGhostText()` awaits its phrase fetch internally.
- **Where it occurred:** Application boot in `src/main.js` and phrase loading in `src/effects/ghost_text.js`.
- **How often it occurred:** Once on every page load.
- **What was changed:** Ghost text now starts in the background while the page starts immediately, and its phrase fetch uses normal browser caching.
- **Why the new approach is better:** Decorative effects no longer sit on the critical path for meaningful homepage content. If the phrase data is slow, the page remains usable.
- **Tradeoffs:** Ghost text may appear slightly later on a cold/slow connection, but it is non-critical decoration and all core behavior is preserved.

## Remaining hotspots and future opportunities

- **Third-party iframes in side blocks:** The configured ad/embed iframes are still likely to dominate network and main-thread cost after first paint. A future pass could lazy-load below-the-fold embeds with `IntersectionObserver` while keeping layout placeholders stable.
- **Header ticker animation:** The ticker continuously animates via CSS. It is visually intentional, but future work could honor `prefers-reduced-motion` or pause when offscreen.
- **Reader page image volume:** Reader behavior is preserved. Future reader-specific work could tune eager image count per connection/device class, but that would need careful visual and behavioral verification.
- **Search index size:** Deferring the index helps startup. If the index grows significantly, future work could split it into smaller shards or generate a compact prefix/token index without changing search behavior.
- **Rotunda active-state updates:** The rotunda currently updates all cards on each navigation. With the current small card count this is inexpensive and safer than a more complex partial-update system. If the rotunda grows substantially, cacheable position state could reduce repeated attribute writes.
