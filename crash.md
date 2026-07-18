# Account White-Screen and Freeze Investigation

## Exact Symptom
Clicking the visible `Account` link from the landing page or reader previously could replace the working screen with a blank/white viewport and leave the app in a loading state. The affected route family is the Account query-route set: `/?account=profile`, `/?account=bookmarks`, and `/?account=settings`.

## Reproduction
Baseline repository state was recorded before editing as branch `work` at commit `1009ef05d6a256277887af8f9711ec63044b87a5`. No `AGENTS.md` file was present under `/workspace` or this repository.

Steps inspected and reproduced from code/build evidence:
1. Open `index.html` on the dev origin.
2. Observe that it was a maintenance-only document and did not mount `#app`, `#reader-container`, shared styles, or `/src/main.js`.
3. Open `reveal.html`; it mounted the real app.
4. Click an Account link, which is intercepted by document-level navigation and converted into a query route rather than a physical `/account` request.

Browser automation was not available in this container: neither Playwright, Puppeteer, Chromium, Chrome, nor Firefox was installed. The correction was therefore verified with production build output, static dual-entry validation, and Node regression tests.

## Transition Trace
The Account transition is:
1. `installNavigation()` intercepts same-origin anchor clicks in `src/navigation.js`.
2. `navigate()` pushes the query-route URL and calls the route resolver.
3. The resolver calls `Page.start()`.
4. `Page.start()` resolves `account` from `window.location.search`.
5. `RouteLifecycle.next()` disposes the previous route exactly once.
6. `Account.render()` creates a render generation and immediately renders the black Account shell.
7. The selected tab hydrator renders the Profile shell immediately, or the Bookmarks/Settings shell before optional tab dependencies run.
8. `AuthState.start()` is started asynchronously; Account UI subscribes to pending, success, signed-out, and recoverable failure states.
9. Stale Account generations are ignored after navigation away.

## Confirmed Root Causes

### Root cause 1: `index.html` was not an application entry
- Responsible module: `index.html`.
- Responsible code path: direct deployment/dev launch of `index.html`.
- Why it caused catastrophic behavior: `index.html` was a maintenance-only image document. It did not contain the app mount, shared app shell, shared module import, or shared black controlled surfaces. Any environment serving `index.html` was filename-dependent and could not run the Account route.
- Evidence: baseline `npm run build` transformed only 3 modules and emitted the maintenance image asset, proving Vite was building the maintenance page instead of the application.
- Correction: `index.html` is now aligned with `reveal.html` as a real app document importing `/src/main.js` and using the same app mount. This was an explicit alignment, not copying `reveal.html` over tracked `index.html` as a workflow shortcut.
- Regression test: `tests/dual-entry.test.mjs` and `scripts/validate-reveal.mjs` validate both entries, common app mount, common app module, no conflict markers, no filename query routes, resolvable relative assets, and a temporary reveal-as-index round trip.

### Root cause 2: Profile imported Bookmarks/catalog code eagerly
- Responsible modules: `src/account.js`, `src/bookmark-service.js`, `src/page/reader.js`.
- Responsible code path: static imports from Account to bookmark service, and bookmark service to `work-catalog.json`/tag metadata.
- Why it could contribute to stalls: Profile did not need bookmark metadata or tag catalog work, but loading Account pulled those dependencies into the route graph. That made Account heavier than necessary before private Profile data could render.
- Evidence: before the split, `src/account.js` statically imported `bookmark-service.js`, and `bookmark-service.js` statically imported `src/data/work-catalog.json`. After the split, production build emits `bookmark-service-*.js` as a separate lazy chunk of 135.72 kB while the main app chunk is 298.45 kB.
- Correction: lightweight bookmark identity/database operations are split into `bookmark-identity.js` and `bookmark-db.js`; catalog metadata remains in `bookmark-metadata.js` and is loaded through `bookmark-service.js` only when Bookmarks opens. Reader imports `bookmark-db.js`, not the catalog service.
- Regression test: `tests/dual-entry.test.mjs` verifies Account has no static imports for bookmark service, preferences, tags, or work catalog, and uses dynamic imports for optional Account tab dependencies.

### Root cause 3: Account route needed explicit shell-first semantics
- Responsible module: `src/account.js`.
- Responsible code path: `Account.render()` and selected tab hydration.
- Why it could produce an empty transition under failure: route disposal happens before the new route is active. If a new Account path were to fail before a shell was committed, the previous route would already be gone.
- Evidence: code inspection showed route disposal precedes route rendering in `RouteLifecycle.next()`. The corrected Account path now commits a black shell before asynchronous auth or optional imports.
- Correction: `Account.render()` is synchronous, creates a generation, renders a black shell immediately, starts `AuthState.start()` without awaiting it, and contains tab hydration failures in a local black Account recovery card with Retry.
- Regression test: existing AuthState tests plus dual-entry/static Account tests confirm pending auth is explicit and optional imports are not part of Profile startup.

## Ruled-Out Causes
- Physical `/account` navigation: `Page.start()` canonicalizes legacy `/account` paths to query routes, and Account links use `/?account=...`.
- Supabase missing configuration: `getSupabase()` returns `null`; `AuthState.start()` publishes a ready signed-out state instead of throwing globally.
- Auth subscription multiplication: `AuthState` keeps one `onAuthStateChange` subscription and tests assert one subscription for concurrent starts/retry.
- Recursive auth-event rendering as the primary blank-screen cause: duplicate material auth states are suppressed by signatures; Account generations ignore stale writes.
- Recovery hidden on white backgrounds: controlled Account/recovery surfaces are black in shared CSS.

## Before and After

### Before
- Shell-render time: not available from browser instrumentation; static evidence showed `index.html` did not render the app shell at all.
- Authentication duration: not measured live; no external Supabase dashboard/session was available.
- Route invocation count: not measured live.
- Account generation count: not measured live.
- Auth subscription count: Node regression tests show one subscription under concurrent starts.
- Supabase request count: Node mock tests show one `getSession()` call under concurrent starts.
- DOM nodes: not measured in browser due missing browser tooling.
- Long tasks: not measured due missing browser tooling.
- Large imports: baseline build emitted only the maintenance page from `index.html`, and Account source statically imported the bookmark catalog path.

### After
- Shell-render time: development diagnostics now record `account.shell` timing via `window.__beepBoopDiagnostics()` in dev builds.
- Authentication duration: AuthState remains asynchronous and no longer gates Account shell rendering.
- Route invocation count: development diagnostics count `page.start`.
- Account generation count: development diagnostics count `account.renderGeneration`.
- Auth subscription count: regression tests verify exactly one subscription.
- Supabase request count: regression tests verify concurrent starts share one `getSession()`.
- DOM nodes: available through `window.__beepBoopDiagnostics()` in dev builds; not browser-measured here.
- Long tasks: not browser-measured here.
- Large imports: production build now separates lazy bookmark catalog metadata into `dist/assets/bookmark-service-*.js` (135.72 kB) and reduces the initial JS chunk to 298.45 kB.
- Repeated-navigation resource counts: not browser-measured here; lifecycle disposal tests continue to prove single disposal and cleanup behavior.

## Dual Entry Evidence
- `index.html` and `reveal.html` both contain `#app`, `#reader-container`, a black startup shell, and `<script type="module" src="/src/main.js"></script>`.
- Both documents are intentionally aligned to the same app source and shared styles.
- Neither document contains merge conflict markers or `index.html?account`/`reveal.html?account` routes.
- Required relative assets resolve from both documents.
- `reveal.html` was validated as a temporary `index.html` copy by `scripts/validate-reveal.mjs` without modifying the real tracked entry by that method.

## Remaining Risks
- Live authenticated OAuth restoration could not be verified without external Supabase/OAuth access.
- Browser-only measurements (paint timing, DOM-node counts during actual clicks, long-task records, mobile/reduced-motion screenshots) could not be collected because browser tooling is unavailable in this environment.
- Vite reports ineffective dynamic imports for modules that are still statically used elsewhere; the heavy bookmark catalog route itself is now a separate lazy chunk after Reader stopped importing the catalog-backed service.

## Regression Checklist
1. Serve the app on localhost and open `/` from `index.html`.
2. Serve the app on localhost and open `/reveal.html`.
3. Confirm landing loads with black background and app styles.
4. Open a reader route and confirm reader loads.
5. Click `Account` and confirm a black shell appears immediately with `Checking account…`.
6. Visit `/?account=profile`, `/?account=bookmarks`, and `/?account=settings` directly.
7. Visit `/?account=profile&auth=callback` and confirm the Profile shell remains visible during auth restoration.
8. Use Account tabs, Home, Back, and Forward.
9. Disable Supabase configuration or network and confirm Account shows local unavailable/retry UI, not a white screen.
10. Repeat Landing → Account → Landing 50 times and Reader → Account → Reader 20 times while watching diagnostics for bounded route/generation counts.
