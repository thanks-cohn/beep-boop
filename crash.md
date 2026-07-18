# Crash and Freeze Investigation

## Baseline

- Branch: `work` (the checkout was not on `main` at start, even though the request named `main`).
- Starting commit: `3d666c0f8cb8c346e167eaa67c5388e632b2299f`.
- Environment: `/workspace/beep-boop`, Node `v20.20.2`, npm `11.4.2`, UTC date `2026-07-18`.
- Repository instructions: no `AGENTS.md` file was present under `/workspace` or this repository.
- Initial diff: `git diff --stat` and `git diff --numstat` were empty.
- Supported commands from `package.json`: `npm test`, `npm run validate:reveal`, `npm run build`, plus `npm run dev`/`preview` for local serving.
- Recent relevant commits inspected: `e2774ca Stabilize auth reader rails and account lifecycle`, `9ab3a45 Implement account routing auth bookmarks rails and tags`, `358ef3c Add private account views and reader startup safeguards`, `6fc45bd Restore comments and improve site stability`, and related Reader/Search/comments/bookmarks/tags/recovery commits from `git log`.
- `index.html` was inspected and remains a maintenance page. `reveal.html` was inspected as the canonical application shell. Neither file was overwritten.
- Initial test/build results:
  - `npm test`: passed 20/20 tests before edits.
  - `npm run validate:reveal`: passed.
  - `npm run build`: failed because Vite/Rolldown could not resolve `@supabase/supabase-js` from `src/discussion/supabase.js` in the local dependency installation.
- Initial browser symptoms: no full browser automation endpoint was available in this session, so no claim is made that low-memory phone or real browser behavior was verified. Static inspection and production-code tests were used.
- Initial resource measurements from static inspection:
  - Route owner: `Page.start()` disposed all views on each render but had no route generation context for stale async work.
  - Reader image window: intended bound was 21 pages (`WINDOW_BEFORE=10`, active page, `WINDOW_AFTER=10`), but failed image retries were 10 attempts per page and not route-abort-owned.
  - Landing ticker: one `setInterval` was created each Landing start and no disposal existed.
  - Rails: finite rail logic was present and constant-node by design, but the helper was not independently testable and rail cleanup was only indirectly covered.

## Reproduction Matrix

### Landing repeated navigation / idle

- Route: Landing.
- User action: repeated Landing -> Reader -> Landing navigation, then idle.
- Reproduction steps: inspect `Landing.start()` and route transitions; call path is `Page.start()` -> `Landing.start()`.
- Frequency: every Landing render before this patch.
- Browser/device conditions: any browser; worse during long sessions.
- Observed behavior: `startHeaderTicker()` created a `window.setInterval` but returned no cleanup, and `Landing` exposed no `dispose()` cleanup for ticker/rotunda/search work.
- Console evidence: static code path; no browser console available.
- Resource evidence: one additional 4.2s interval could survive each Landing lifecycle if the DOM was replaced before the interval stopped.

### Reader rapid navigation / late async initialization

- Route: Reader.
- User action: rapid chapter changes and leaving Reader while manifest, metadata, rails, search, comments, or bookmark hydration are still pending.
- Reproduction steps: inspect `Reader.start()` -> `renderManifestInto()` and `Page.start()` transition behavior.
- Frequency: possible whenever route changes overlap async work.
- Browser/device conditions: more likely on slow network or CPU throttling.
- Observed behavior: Reader had an internal `renderGeneration`, but the application route itself did not provide an AbortSignal or single route lifecycle context. Manifest retries could continue after route disposal until their retry loop completed.
- Console evidence: static code path; no browser console available.
- Resource evidence: pending retries used default 10 attempts with up to 4.5s backoff.

### Reader failed image retry pressure

- Route: Reader.
- User action: image failures/retries on pages inside the virtual image window.
- Reproduction steps: inspect `createVirtualReader().load().onerror`.
- Frequency: deterministic for any failed page image.
- Browser/device conditions: slow/offline/image host failure.
- Observed behavior: each failed page could retry 10 times. With the 21-image virtual window, this permitted up to 210 scheduled retry attempts per visible window before user intervention.
- Console evidence: static code path; no browser console available.
- Resource evidence: after patch the same window is at most 21 live image resources and 3 automatic retries per page (63 automatic attempts), then a manual retry button.

### Rails flashing / disappearing suspicion

- Route: Reader.
- User action: many rail cycles while scrolling a long chapter.
- Reproduction steps: extracted the production finite rail session and tested 200 synthetic cycles.
- Frequency: tested deterministically in Node with DOM stubs.
- Browser/device conditions: simulated scroll cycles; no real browser visual verification.
- Observed behavior before patch: finite session logic was present, but only a fake modulo test existed; invariants for iframe identity/src and listener cleanup were not covered by production-code tests.
- Console evidence: none.
- Resource evidence after patch: 4 configured blocks remained 4 blocks; 4 iframe object identities remained identical; iframe `src` list remained unchanged through 200 cycles; scroll listener was removed on disposal.

## Confirmed Root Causes

### Missing central route lifecycle generation

- Symptom: stale async route work could complete after navigation and mutate or retain stale view resources.
- Responsible module/code path: `src/page/page.js` route selection called view starts directly; `src/page/reader.js` owned a separate Reader generation only after Reader start.
- Technical explanation: without a route-scoped generation and AbortController, the app had no single owner to abort route-owned retries or run late initializer cleanup immediately after disposal.
- Evidence: static inspection of `Page.start()` and `Reader.start()` before patch.
- Fix: added `createRouteLifecycle()` and made `Page.start()` create exactly one context per route transition. The context increments generation, disposes prior views once, owns an AbortController, and immediately runs cleanup functions registered after disposal.
- Regression test: `tests/stability.test.mjs` imports `createRouteLifecycle()` and verifies one disposal, aborted stale signal, idempotent disposal, and late cleanup execution.
- Before measurement: route generation existed only in Reader, not app-wide; route-owned AbortSignal count was 0.
- After measurement: one route context per transition; one AbortController per active route.

### Landing ticker interval leak

- Symptom: Landing idle work could survive route changes.
- Responsible module/code path: `src/page/landing.js` `startHeaderTicker()`.
- Technical explanation: `setInterval()` was created but never cleared; repeated Landing starts could retain intervals that update detached ticker closures.
- Evidence: static inspection showed `window.setInterval()` without any cleanup path and `Landing` had no `dispose()` implementation.
- Fix: `Landing.dispose()` now clears owned cleanups and calls `Rotunda.cleanup`; `startHeaderTicker()` registers the interval cleanup with the route context.
- Regression test: route lifecycle test covers late/owned cleanup mechanics; Landing cleanup is also exercised indirectly by route transitions.
- Before measurement: 1 unbounded interval per Landing start.
- After measurement: 1 interval maximum per active Landing context, cleared on disposal.

### Excessive automatic retry pressure

- Symptom: failed Reader page images could create avoidable retry/timer pressure during offline or host-failure sessions.
- Responsible module/code path: `src/page/reader.js` image `onerror` retry loop and `src/utils/retry.js` fetch retry policy.
- Technical explanation: page images retried 10 times each, and fetch retries treated deterministic 4xx responses like transient errors.
- Evidence: static inspection and tests of retry helper behavior.
- Fix: image retries are limited to 3 automatic attempts and stop while offline; fetch retries mark deterministic non-408/non-429 4xx responses as non-retryable.
- Regression test: `tests/stability.test.mjs` verifies `withRetry()` stops immediately for `retryable=false` and keeps the 4.5s maximum backoff.
- Before measurement: 10 automatic image retry attempts per failed page; deterministic 4xx could consume the full retry budget.
- After measurement: 3 automatic image retry attempts per failed page, followed by local manual retry; deterministic 4xx stops after one fetch attempt.

### Rail stability had only fake test coverage

- Symptom: rails were reported to flash/disappear and iframe reload concerns had no production-code regression coverage.
- Responsible module/code path: `src/components/blocks.js` finite rail code.
- Technical explanation: the previous test asserted a locally reproduced modulo expression instead of importing the production rail session.
- Evidence: `tests/rails.test.mjs` contained only a local modulo calculation.
- Fix: extracted `createFiniteRailSession()` to `src/components/rail-session.js` and added a production-code stability test that cycles rails 200 times and verifies block count, iframe identity, iframe src stability, and listener cleanup.
- Regression test: `tests/stability.test.mjs` rail session test.
- Before measurement: fake test coverage; no production rail invariant test.
- After measurement: 4 blocks remain 4; 4 iframes remain the same 4 objects; iframe src values are unchanged through 200 cycles; scroll listener removed after disposal.

## Ruled-Out Causes

- Full Reader DOM image growth was not confirmed in static inspection: `createVirtualReader()` already creates placeholders for every page but only loads images within a 21-page active window and unloads distant image elements.
- Iframe cloning during rail cycling was not confirmed: production rail code moves existing block elements with transforms and does not clone during cycling.
- Per-search Supabase network calls were not found: search uses the local `/data/search.index.json` and cached `searchIndexPromise`.
- Duplicate auth subscriptions were not found in `AuthState`; existing tests verify one shared subscription.

## Resource Bounds

- DOM nodes: Node-only tests did not produce a browser DOM total. Future browser regression should use `window.__beepBoopDiagnostics().domNodes`.
- Active image elements: Reader design remains bounded to 21 active page images (`10 before + active + 10 after`) plus ordinary UI/block images.
- Images with `src`: Reader page image `src` resources are removed in `unload()` outside the virtual window.
- Iframes: rail test used 4 iframes and verified the same 4 objects/sources after 200 cycles.
- Listeners: navigation installer still guards one `popstate` and one document click handler; rail test verifies scroll listener cleanup.
- Timers: Landing ticker interval is now cleanup-owned; Reader image retry timers are cleared on unload/dispose.
- Animation frames: rail frames are cancelled on disposal; Reader fallback scroll frame is cancelled on disposal.
- Observers: rail ResizeObserver disconnect remains in cleanup and is covered by production helper disposal path.
- Network requests: deterministic 4xx fetches no longer consume retry budgets; route-owned Reader manifest fetch retry receives the route AbortSignal.
- Route transitions: one active route context is created per `Page.start()` transition.
- Long tasks: not measured; no browser PerformanceObserver was available.
- Memory: not measured; browser heap tooling was unavailable.

## Remaining Risks

- Real browser reproduction was not available, so CSS paint cost, low-memory behavior, actual decoded-image memory, cross-origin iframe paint flashes, and browser-specific sticky behavior remain unverified.
- `npm install`/`npm ci` hung in this Node 20 environment after EBADENGINE warnings for packages requiring Node 22+, so final build verification is environment-limited unless dependencies are preinstalled or Node is upgraded.
- The checkout branch was `work`, not `main`; no branch replacement or history rewrite was performed.
- Optional Supabase behavior was not exercised against a remote service and no remote settings were modified.

## Regression Checklist

1. Run `git status --short --branch` and confirm the intended branch.
2. Run `npm test` and confirm all stability tests pass.
3. Run `npm run validate:reveal`.
4. Run `npm run build` in Node 22+ or a dependency-complete environment.
5. In a browser dev build, call `window.__beepBoopDiagnostics()` on Landing, Reader, and Account before and after 20 route cycles.
6. Open a long Reader chapter, scroll from first to last page, and confirm Reader page images with active `src` remain bounded near 21.
7. During long Reader scrolling, inspect rail diagnostics and confirm configured block count, live block count, iframe count, iframe identity, and iframe `src` remain constant.
8. Toggle offline during Reader image failures and confirm automatic retries stop after the bounded retry count and manual retry remains available.
9. Rapidly navigate Reader -> Account -> Reader while manifests and metadata are loading; confirm stale route contexts do not mutate the current DOM.
10. Repeat Landing -> Reader -> Landing cycles and confirm ticker/search/rotunda cleanup counts do not increase.
