# Accounts, tags, reader performance, side rails, and reveal compatibility plan

## 1. Executive summary

This is a planning-only document. It is based on inspection of the current checkout, which is on branch `work` even though the request refers to `main`. No application source, generated catalogs, SQL, workflow, HTML, CSS, package, or JSON data has been changed in this run.

The repository already contains a partial private-account implementation, but it is not live-reliable because account routing is path-based (`/account`, `/account/bookmarks`, `/account/settings`) while the request needs static-safe root query routes, and no landing/header account navigation exposes those pages. Authentication is implemented through Supabase with anonymous sign-in, Google OAuth, anonymous-to-Google identity linking, persisted sessions, automatic token refresh, and URL-session detection. Bookmarks exist as Supabase rows keyed by `bookmarks.work_id`, but the current reader only mounts bookmark controls inside the discussion component after discussion initialization and only when the work manifest has a non-null `parent_work_id`.

The next implementation should be small and phased: first stabilize origin/callback/session handling, then expose query-routed account pages, then decouple bookmarks from discussion loading, then make rails and backgrounds safe, then add the simple authoritative `src/data/tags.json` plus `src/tags.js` reverse index, and finally add personal tag exclusions without blocking reader startup.

## 2. Confirmed current architecture

### Package, build, and hosting

- `package.json` defines a static Vite app named `mon-website`, uses ESM, depends on `@supabase/supabase-js`, and has build/test scripts: `build` runs `node scripts/validate-reveal.mjs && vite build`; `test` runs `node --test tests/*.test.mjs`; `validate:reveal` runs the reveal validator.
- `vite.config.js` builds three HTML entry points: `index.html`, `mobile.html`, and `reveal.html`.
- `wrangler.jsonc` deploys `./dist` as Cloudflare assets with `not_found_handling: "single-page-application"`, which helps path refreshes on Cloudflare but should not be relied on for every static host or local file/server mode.
- `.github/workflows/deadman-switch-new.yml` is the reveal/maintenance switch. On schedule, manual dispatch, or `main` pushes touching `date.txt` or the workflow, it copies `placeholder.html` to `index.html`/`mobile.html` during the safe period and copies `reveal.html` to `index.html`/`mobile.html` after expiry.

### HTML shell state

- `index.html` is currently a maintenance document with title `Maintenance` and an image at `Images/15gzfnndqaod1.jpeg`.
- `placeholder.html` is the same maintenance-style page.
- `reveal.html` is the canonical real application shell. It has the app layout, black critical CSS, startup recovery script, and `<script type="module" src="/src/main.js"></script>`.

### Application startup and routing

- `src/main.js` imports landing CSS, `Page`, footer, ghost text, retry helpers, account code, and `TagPreferences`.
- `src/main.js` calls `TagPreferences.loadForCurrentUser()` immediately in the background, then calls `boot()`.
- `boot()` starts ghost text without blocking, retries `Page.start()`, starts footer after `Page.start()`, and sets document app-state flags.
- `src/page/page.js` currently routes by `location.pathname.startsWith('/account')`; otherwise it reads `work` and `chapter` from `location.search`; if both exist it starts the reader, otherwise it starts the landing page.
- The requested query routes (`/?account=profile`, `/?account=bookmarks`, `/?account=settings`) do not currently exist.

### Landing, search, and rotunda

- `src/page/landing.js` renders a landing header with brand and search only; it does not render Account/Profile/Bookmarks/Settings links.
- `src/components/search.js` loads `/data/search.index.json` lazily on search focus, filters results through `TagPreferences.isExcluded(entry.tags || [])`, and emits `open-reader` events instead of navigating.
- `src/components/rotunda.js` imports `rotunda.json`, `storage.json`, and `TagPreferences`, filters `rotunda.works` by `work.tags`, and opens the reader by dispatching `open-reader` with `{ source, work: card.slug, chapter: card.chapter }`.
- Current generated tag arrays in `rotunda.json`, `search.index.json`, and `work-catalog.json` are present but empty for inspected examples, so current exclusion filtering has little real effect until authoritative tags exist.

### Reader

- `src/page/reader.js` uses `Storage.manifest(source, work, chapter)` to find the chapter manifest URL.
- The reader renders a loading shell before fetching the manifest, fetches and resolves the manifest, fetches the chapter list with `loadWork(work)`, builds a virtualized page wrapper, starts reader search, creates page placeholders, then later replaces the shell with the full wrapper.
- The virtual reader keeps a bounded image window: 10 pages before, active page, and 10 pages after. First three images are eager and high priority.
- Reader side rails are started only after the first page becomes usable or after a 1600 ms fallback, which is directionally correct.
- Discussion/bookmark mounting is currently tied to `parent_work_id`: `loadWork(work)` is called again, `parent_work_id` is read, and `mountDiscussion(wrapper, String(parentWorkId))` is only called if that value is not null/undefined.

### Supabase account and discussion code

- `src/discussion/supabase.js` creates the Supabase client only when `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` exist.
- The Supabase client is configured with `{ auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }`.
- `ensureAnonymousSession()` returns the existing session or calls `client.auth.signInAnonymously()`.
- `continueWithGoogle()` uses `window.location.href` as `redirectTo`; if the current session is anonymous it calls `client.auth.linkIdentity(options)`, otherwise it calls `client.auth.signInWithOAuth(options)`.
- `src/discussion/service.js` implements comments, votes, reports, bookmark state, and bookmark toggling. `toggleBookmark(workId, active)` ensures an anonymous session, then deletes or upserts `{ work_id: String(workId) }` with `onConflict: 'user_id,work_id'`.
- `src/discussion/discussion.js` mounts a discussion shell and creates a `Bookmark` button inside the discussion header. Discussion initialization is delayed by an `IntersectionObserver` until the section approaches the viewport.

### Existing account pages

- `src/account.js` already contains Profile, Bookmarks, and Settings rendering functions.
- It imports `work-catalog.json`, builds a `Map` from `catalog.by_parent_work_id`, and assumes bookmark rows can be displayed by looking up `String(row.work_id)` in that map.
- Its navigation uses path URLs: `/account`, `/account/bookmarks`, `/account/settings`.
- It renders into `#reader-container` and removes `reader-active` from the body.
- It clears `TagPreferences` on sign-out but does not currently integrate a global `onAuthStateChange` subscription.

### Existing database migrations

- `supabase/migrations/202607170001_discussion_mvp.sql` creates `profiles`, `comments`, `comment_authorship`, `comment_votes`, `comment_reports`, and `bookmarks`.
- `bookmarks` has columns `user_id uuid default auth.uid() references auth.users(id) on delete cascade`, `work_id text not null check(char_length(work_id) between 1 and 128)`, and `created_at`; primary key is `(user_id, work_id)`.
- Bookmark RLS allows authenticated users to select, insert, and delete only rows where `user_id = auth.uid()`.
- `supabase/migrations/202607180001_user_tag_preferences.sql` already defines a `user_tag_preferences` table with normalized `excluded_tags` and `allowed_default_tags`, own-row RLS, GIN indexes, and grants. The plan below treats this as an existing migration to verify rather than something to blindly duplicate.

### Work identity facts

- `src/data/work-catalog.json` has `works`, `by_parent_work_id`, and `tags` keys. Its `by_parent_work_id` map is exactly what current `src/account.js` uses to display bookmarks.
- Work manifests under `src/data/works/*.json` mostly include `parent_work_id`, but inspection found four local manifests with missing/null `parent_work_id`: `Attack_on_Titan.json`, `HunterXHunter.json`, `Blue_Spring.json`, and `Bleach.json`.
- `src/data/rotunda.json` contains many works with `parent_work_id: null` in inspected examples.
- Therefore `bookmarks.work_id` currently stores the stringified `parent_work_id` for reader-mounted bookmarks, not a slug, not a UUID, and not a numeric database surrogate. It is a text column containing values derived from work manifest `parent_work_id`.

## 3. Why the account pages are not visible/reliable

1. There is no visible account entry point in the landing header. `landing.js` renders only brand and search.
2. Account routing is path-based. `Page.start()` only recognizes `location.pathname.startsWith('/account')`, and `account.js` links to `/account`, `/account/bookmarks`, and `/account/settings`.
3. Path routes may fail on static hosts that do not rewrite unknown paths to the app shell. Cloudflare currently has SPA fallback, but the deadman workflow can replace `index.html` with maintenance content, local static servers may not rewrite, and copied `reveal.html -> index.html` must remain robust.
4. Current account pages render into `#reader-container`, but `index.html` is currently maintenance content, so the real app is only in `reveal.html` until the deadman switch reveals it.
5. `popstate` handling in `main.js` only rerenders when `pathname.startsWith('/account')`; it will not handle requested query account routes.
6. Account views are not integrated with a central auth-state subscription, so changes from OAuth return, token refresh, link identity, or sign-out are not guaranteed to refresh every visible account/discussion/bookmark UI.

## 4. Authentication persistence assessment

### Existing auth functionality

- Anonymous login: `ensureAnonymousSession()` calls `client.auth.signInAnonymously()` if `auth.getSession()` returns no session.
- Google login: `continueWithGoogle()` calls `signInWithOAuth({ provider: 'google', options: { scopes, redirectTo } })` when there is no anonymous session.
- Anonymous-to-Google linking: `continueWithGoogle()` calls `linkIdentity()` instead of `signInWithOAuth()` when `existing.user.is_anonymous` is true.
- Sign-out: account sign-out calls `db?.auth.signOut()` and clears tag preferences; discussion sign-out calls `db.auth.signOut()` and rerenders only the discussion account bar.

### Session persistence

Supabase is configured with `persistSession: true`, `autoRefreshToken: true`, and `detectSessionInUrl: true`. In a browser, `@supabase/supabase-js` persists sessions in browser storage by default, normally `localStorage` when available. Therefore closing a tab should preserve the session. Closing and reopening the browser should also preserve the session unless the browser, privacy mode, storage policy, origin change, or auth event flow removes it.

Cookies are probably not required because this is a static Vite app that calls Supabase directly from the browser with a publishable key and stores the client session in browser storage. Secure server cookies become necessary if a future server/edge function renders private data, proxies Supabase with server credentials, performs server-side authorization, needs HttpOnly session protection, or must share sessions across server-rendered routes without exposing tokens to JavaScript.

### Plausible causes of disappearing sessions

- The user returns to a different origin (`www` vs apex, `http://localhost` vs production, alternate domain, different port). Browser storage is origin-scoped, so each origin has a separate Supabase session.
- Supabase redirect allowlist rejects or rewrites the callback.
- `redirectTo: window.location.href` sends users back to a reader URL, account path, maintenance `index.html`, localhost path, or URL with transient query parameters. That is fragile and can cause allowlist mismatch or confusing post-OAuth routing.
- Browser privacy settings, private browsing, third-party/storage blocking, “clear site data on close,” iOS low-storage eviction, or user/manual clear removes localStorage.
- The app calls `signOut()` in one component and another component does not respond consistently.
- Multiple Supabase projects or env vars are used across deploys, producing a different storage key/session namespace.
- `detectSessionInUrl` may process URL fragments/query parameters only on the page that loads after OAuth; if the deadman-maintenance page is active or the route is not the real app shell, the session may not be captured.
- OAuth linking may fail or be cancelled, leaving the anonymous session state unclear to the user.
- A build/deploy copies `placeholder.html` to `index.html`, so the OAuth return page does not load `src/main.js` and cannot finish session detection.

### How to determine the actual cause

Do not guess. For each affected browser, inspect:

1. DevTools Application/Storage: look for Supabase auth keys in Local Storage for the exact origin.
2. Compare origins before login, after OAuth return, after tab close, after browser close, and after clicking reader/account links.
3. Network logs for OAuth redirect URL and Supabase auth endpoints.
4. Console logs from `onAuthStateChange` once added: `INITIAL_SESSION`, `SIGNED_IN`, `TOKEN_REFRESHED`, `USER_UPDATED`, `SIGNED_OUT`.
5. Supabase dashboard Auth URL configuration: Site URL, Redirect URLs, anonymous sign-ins, Google provider, and account-linking settings.
6. Confirm the deployed document serving the callback is the real app shell (`reveal.html` content after reveal), not maintenance content.

## 5. Canonical-origin and OAuth callback plan

Use one canonical production origin as a product/deployment decision, for example `https://example.com` or `https://www.example.com`, and redirect all alternate origins to it if possible. Supabase should be configured with:

- Canonical Site URL: the production origin root.
- Allowed redirect URLs: the canonical root URL, canonical root with wildcard query if Supabase dashboard syntax requires it, localhost dev roots used during testing, and any preview URLs intentionally supported.
- Google provider configured in both Google Cloud Console and Supabase with matching authorized redirect/callback settings.
- Anonymous sign-in enabled if anonymous bookmarks/comments remain desired.

`window.location.href` should be replaced by a stable callback URL, preferably the canonical root with an explicit post-auth route parameter, such as:

```text
https://<canonical-origin>/?account=profile&auth=callback
```

For local development, derive the origin from an allowlisted environment variable or `window.location.origin` only when the origin is known and allowlisted. Do not use the current full reader URL as the OAuth callback. After OAuth, query routing can render the profile page and then optionally restore an intended reader URL from `sessionStorage`.

Add a central auth module/subscription around `supabase.auth.onAuthStateChange`. It should:

- Load the initial session.
- Notify account, bookmark, discussion, and preferences listeners.
- On `SIGNED_OUT`, clear private in-memory data, user-specific caches, pending bookmark state, account DOM, tag preference snapshots, and discussion drafts where appropriate.
- On `SIGNED_IN`, `TOKEN_REFRESHED`, or `USER_UPDATED`, reload preference/bookmark state for the new `user.id` and discard stale data if the user ID changes.
- Never let cached data keyed for user A render for user B. Key caches by `user.id` and clear them on any user-id transition.

## 6. Profile architecture

Use root query routes:

```text
/?account=profile
/?account=bookmarks
/?account=settings
```

These routes always request `/`, so they survive static hosting refreshes, `reveal.html -> index.html` copying, and OAuth callback returns more reliably than `/account/...` paths. Navigation should use `history.pushState()` and rerender without a full-page reload. `popstate` should rerun the same route resolver for landing, reader, and account query routes.

Visible links should be added to the landing header and reader chrome without blocking reader startup. Suggested labels:

- Signed out: `Account`
- Anonymous: `Anonymous account`
- Linked: safe display name or `Profile`

The profile view should show:

- Safe display identity: “Anonymous reader” or a sanitized display name from user metadata/profile.
- Account status: signed out, anonymous recovery identity, or linked Google account.
- Links/buttons to Bookmarks and Settings using query routes.
- Continue anonymously, Link Google/Continue with Google, and Sign out controls.
- Useful private account state without publicly exposing email, provider IDs, raw auth metadata, or profile internals.

Signed-out state should explain that bookmarks/settings require sign-in. Anonymous state should explain that bookmarks can be saved now and Google linking can preserve them if Supabase account linking succeeds. Linked state should not expose email publicly. Offline/loading/failure states need status text, retry buttons, and no private stale data.

Account pages must be independent from the comments component. They may share auth and bookmark service modules, but must not require `mountDiscussion()` or discussion visibility.

When navigating away, the account view should return a dispose function or use an `AbortController` to remove listeners, cancel requests, and clear private DOM if the session changes or sign-out happens.

## 7. Bookmark identity and library architecture

### Confirmed current behavior

- Database `bookmarks.work_id` is `text`, not a foreign key to a local catalog table.
- Reader obtains `parent_work_id` from `loadWork(work)` in `src/page/reader.js` and passes `String(parentWorkId)` to `mountDiscussion()`.
- `mountDiscussion()` passes the same `workId` to `bookmarkState()` and `toggleBookmark()`.
- Therefore current bookmark rows store the stringified `parent_work_id` when the bookmark button is available.
- If a work has missing/null `parent_work_id`, the reader does not mount discussion, and the current bookmark button is unavailable. A direct call to `toggleBookmark(null, false)` would store the string `"null"`, so the implementation must explicitly reject missing IDs before exposing bookmark actions.
- Four inspected local work manifests currently have missing/null `parent_work_id`: `Attack_on_Titan`, `HunterXHunter`, `Blue_Spring`, and `Bleach`.
- Existing bookmarks are protected by own-row RLS and uniqueness through primary key `(user_id, work_id)`.

### Preservation requirement

Do not migrate existing bookmarks from `parent_work_id` to slugs in the first account implementation. Preserve `bookmarks.work_id` as the current stable bookmark key while adding a reliable lookup layer.

### Smallest reliable ID-to-work lookup

Use the existing `src/data/work-catalog.json` as the initial lookup source because it already contains `by_parent_work_id`, display titles, thumbnails, chapters, source, slug, and tags. Do not fetch every work manifest individually. Add a small runtime helper such as `src/bookmarks.js` that:

- Treats bookmark IDs as opaque strings.
- Looks up `by_parent_work_id[String(work_id)]`.
- Provides missing-work output when no catalog entry exists.
- Optionally builds a secondary slug-to-bookmark-ID map from `work-catalog.json` for reader controls.
- Does not rewrite `fetch.json`, `rotunda.json`, `search.index.json`, or manifests.

### Bookmark page design

`/?account=bookmarks` should provide:

- Bounded query: latest 24 or 30 bookmarks first, ordered by `created_at desc`.
- “Load more” pagination using `created_at` cursor or Supabase range/limit.
- Cards with title, thumbnail, reader link, structured tags from `tags.js` reverse lookup when available, remove control, and created/saved time if useful.
- Empty state: “No bookmarks yet.”
- Missing-work state: show `Missing work <work_id>`, remove control, and no broken reader link.
- Immediate optimistic removal with rollback/retry on failure.
- No duplicate bookmarks because DB primary key already prevents duplicates; UI should also deduplicate rows defensively.

Bookmarking should become a reader feature, not a discussion feature. Put the bookmark control in the reader top bar or an adjacent stable reader toolbar after the shell renders. It should not wait for Supabase before the reader opens. It can render as disabled/loading initially, then hydrate bookmark state later. If the work has no valid bookmark ID, show an unavailable state or hide with a dev warning; never store `"null"`.

Anonymous bookmarks should survive Google linking only if Supabase `linkIdentity()` truly attaches Google to the same `auth.users.id`. This must be verified in the dashboard and browser test matrix. If linking creates a new user instead, bookmarks will not follow because RLS ownership is by `user_id`.

## 8. Simple `tags.json` format

Create `src/data/tags.json` in a future implementation, not in this planning run. Keep it authoritative for tag membership and human-editable:

```json
{
  "version": 1,
  "labels": {
    "action": "Action",
    "slice-of-life": "Slice of life"
  },
  "tags": {
    "action": [
      "Attack_on_Titan",
      "HunterXHunter"
    ],
    "slice-of-life": [
      "Blue_Spring"
    ]
  }
}
```

Rules:

- `version` is required.
- `tags` maps normalized tag keys to arrays of work slugs.
- `labels` is optional but recommended when display labels differ from normalized keys.
- Work identifiers should be slugs because search, rotunda, storage manifests, and reader URLs all already use slugs as the app navigation identity. Bookmarks remain parent-work-ID based initially, with catalog lookup bridging bookmark rows to slugs.
- Arrays must be deduplicated and deterministically sorted.
- Unknown work slugs should be reported by validation, not silently accepted.
- Do not duplicate per-work tag data as the authoritative source.
- Do not modify `fetch.json`, `rotunda.json`, work manifests, or `search.index.json` merely to add tags.

One `tags.json` remains practical while the tag-to-work map is reasonably small enough to load once with the app/search path. If it grows to multiple megabytes or thousands of tags/works causing startup/search delays, split by first letter/tag namespace or lazy-load tags only when search/settings/bookmarks need them. Do not over-engineer for very large scale now.

## 9. `tags.js` responsibilities and reverse index

Create `src/tags.js` in a future implementation. Responsibilities:

- Import or fetch `src/data/tags.json` once.
- Normalize tag keys consistently: lowercase, trim, collapse whitespace, replace underscores with hyphens or spaces according to one chosen policy, and reject empty keys.
- Build a forward map `tag -> sorted unique slugs` and a reverse map `slug -> Set<tag>` once per page session.
- Expose `getTagsForWorkSlug(slug)`, `hasExcludedTag(slug, exclusionSet)`, `knownTags()`, `labelForTag(tag)`, and validation helpers.
- Validate all slugs against `work-catalog.json` or the existing catalog source during tests.
- Deduplicate work slugs within each tag.
- Keep output deterministic for tests.
- Allow search and rotunda to consult tags by `entry.work` or `work.slug` instead of relying on generated embedded `entry.tags` arrays.
- Allow bookmarks to show tags after the bookmark row is mapped to a catalog work slug.
- Allow settings to list known tags from `tags.json` keys and labels.
- Allow future ingestion to optionally update `tags.json`, but ingestion must not become required for hand-maintained tag edits.

## 10. Default and personal exclusion model

Use:

```text
effective exclusions = global default exclusions + personal exclusions - explicitly allowed default overrides
```

### Policy file location

Keep content policy separate from tag membership. `src/data/tags.json` should say which works have which tags. A small policy file such as existing `src/data/tag-policy.json` should say which normalized tags are excluded by default and whether users may override defaults. This separation avoids editing huge membership data when policy changes and avoids treating policy as content metadata.

Current `tag-policy.json` already has `version`, `defaultExcludedTags: []`, `allowDefaultOverrides: true`, and a note saying no authoritative default list is present. The exact default-tag list is a product decision requiring owner input. Do not invent blocked tags.

### Runtime behavior

- Signed-out visitors receive defaults synchronously from the local policy file.
- Signed-in users initially receive defaults synchronously, then personal preferences load in the background from Supabase and update rotunda/search/settings state without blocking the reader.
- Search and rotunda should use an in-memory preference snapshot, never contact Supabase for every query.
- On account change/sign-out, clear cached preferences and reload for the new user ID.

### Supabase storage

The existing `user_tag_preferences` migration likely matches the needed first implementation: one row per user with `excluded_tags text[]`, `allowed_default_tags text[]`, own-row RLS, normalization constraints, and indexes. Verify it has been applied in Supabase before relying on it.

“Restore defaults” should upsert empty `excluded_tags` and empty `allowed_default_tags` for the current user, or delete the row if the code treats absence as defaults. If default overrides are permitted, settings should let users explicitly allow a default tag; if `allowDefaultOverrides` is false, hide/disable that control.

## 11. Supabase schema and RLS plan

### Confirmed repository facts

- `profiles` exists in migration with public read, own insert, and own update policies.
- `bookmarks` exists with `work_id text`, primary key `(user_id, work_id)`, own select/insert/delete policies, and `bookmarks_work_idx`.
- Comments use security-definer RPCs and private authorship mapping.
- `user_tag_preferences` migration exists with own-row RLS and normalization checks.

### Likely dashboard requirements to inspect

- Anonymous sign-ins enabled.
- Google provider enabled with correct client ID/secret.
- Site URL set to canonical production root.
- Redirect allowlist includes canonical query callback and dev callback origins.
- Account linking is allowed and behaves as expected for anonymous users linking Google.
- Email exposure/display settings and provider scopes meet privacy requirements.

### Safe migration/order

1. Verify existing migrations are applied and RLS enabled in the target Supabase project.
2. Add any missing preference table/policies only if absent; do not duplicate existing objects.
3. Add optional updated-at trigger for preferences/profiles if desired.
4. Do not alter `bookmarks.work_id` semantics in the first implementation.
5. If later adding a `bookmark_work_map` or slug column, backfill in a separate migration with read compatibility and rollback plan.

Rollback: UI changes can be reverted without dropping bookmark/comment/profile data. Preference-table rollback should leave existing preferences harmless; only drop policies/table if explicitly safe.

## 12. Reader-performance assessment

Current good points:

- Reader shell is created before the manifest fetch.
- Page image DOM is virtualized and bounded.
- First three images are eager/high priority.
- Rails start after first page usable or a 1600 ms fallback.

Current violations or risks:

- `Reader.start()` awaits the whole `renderManifestInto()` before returning; `Page.start()` therefore waits for manifest, chapter list, search start, work load, and discussion setup before startup is considered done.
- The user does not see the final reader wrapper until after manifest fetch, chapter list fetch, `Search.start()`, another `loadWork(work)`, and discussion mount setup are complete.
- `Search.start()` in the reader is awaited before images are created.
- `loadWork(work)` is called once for chapters and again for `parent_work_id`.
- Discussion/bookmark setup is inside the critical render path before `layoutParts.content.replaceChildren(wrapper)`.
- Bookmark state is tied to the discussion component and therefore delayed by discussion visibility/auth/Supabase.

Implementation changes:

1. On click, synchronously update URL/state and render a stable reader shell immediately.
2. Fetch chapter manifest immediately after shell render.
3. As soon as manifest is resolved, create page placeholders and assign first visible image `src` before awaiting search, work metadata, comments, bookmarks, rails, footer, or preferences.
4. Load chapter list/navigation metadata in parallel and update controls when ready.
5. Start reader search without awaiting it before image creation.
6. Move discussion mount and bookmark-state hydration into post-first-page tasks.
7. Cache `loadWork(work)` for the render generation to avoid duplicate manifest/catalog work.
8. Dispose prior generation before replacing content and guard every async continuation with generation/session checks.

Acceptance criteria:

- Click-to-reader-shell under 100 ms on warm JS.
- Click-to-first-image-request under 300 ms plus network scheduling time after manifest response.
- No stale chapter can replace a newer chapter after rapid navigation.
- No optional feature causes a long main-thread task over 50 ms during reader opening.
- Loaded page images stay bounded to the configured virtualization window.
- Side rails reserve/occupy black space without layout shift when they appear.

## 13. Side-rail and advertisement assessment

### Current rendering modes

`src/components/blocks.js` supports:

- Same-origin fetched HTML fragments through `item.html`, loaded as text and inserted into the parent DOM.
- Inline embed code through `item.embed`/`item.code`, inserted into a wrapper.
- Images through `item.image`/`item.src`/image URLs.
- Iframes through `item.iframe`/`item.page`.
- Text blocks through `title`/`body`/`text`/`content`.

`src/data/blocks.json` currently uses same-origin HTML fragments such as `/blocks/top_left_meme.html` and inline embed code containing cross-origin `a.magsrv.com/iframe.php` ad iframes. The public block HTML files are same-origin fragments inserted into the parent document, not iframes.

### Why white backgrounds appear

White can appear from default iframe/document backgrounds, third-party ad creatives inside cross-origin iframes, same-origin block fragments without explicit black root/background styles, wrappers using semi-transparent panel backgrounds over non-black ancestors, image transparent areas, or iframe loading/failure periods. Parent CSS can style rail containers, wrappers, empty space, iframe elements, and same-origin inserted content. Parent CSS cannot restyle the internal document or creative of a cross-origin advertising iframe.

### Endless rail cloning

`cycleReaderRail()` clones existing rail DOM with `cloneNode(true)` until visual height is covered, capped at 40 repeats. Cloned scripts inserted by cloning generally do not execute as new parser-inserted scripts. Cloned iframes can reload because cloned iframe elements with `src` become live browsing contexts when inserted. Repeating ad iframes can create excessive network load, policy/revenue-integrity problems, memory use, and third-party throttling.

Plan:

- Do not blindly clone live ad iframes.
- Separate visual repeaters from live ad slots.
- Cap live cross-origin ad iframes per side/viewport.
- For endless coverage, repeat static same-origin/image/text placeholders or screenshots/house blocks, not unlimited live ads.
- Use observers/timers owned by a rail session and dispose them on chapter change.
- Avoid internal rail scrollbars by making rails part of page flow or using controlled sticky containers without `overflow:auto` where not needed.

## 14. Pure-black background plan

- Set app critical backgrounds to `#000000`, not near-black, in `reveal.html` critical CSS and main CSS where appropriate.
- Set `.app-root`, reader layouts, reader pages, side rails, `.site-block`, `.embed-block`, `.iframe-block`, ad wrappers, and empty slots to `#000000`.
- Same-origin HTML fragments under `public/blocks` should include explicit black background on their root/wrapper; if they are full HTML documents in future, set `html, body { background:#000000; }`.
- Iframes should have `border:0`, black wrapper, fixed intrinsic dimensions, centered content, and a black placeholder until load.
- Fixed-size ads should be centered, not stretched.
- Iframes should fade in only after `load`; failed ads should leave a clean black slot.
- No promise should be made to recolor the inside of cross-origin ad creatives.

## 15. `reveal.html` compatibility plan

`reveal.html` must remain canonical. Every application-level HTML change should be made there first. Its contents must not depend on the filename `reveal.html`; asset paths should be absolute-root paths like `/src/main.js` or otherwise valid after copying to `index.html` and `mobile.html`.

Current difference:

- `index.html` and `placeholder.html` are maintenance image pages.
- `reveal.html` is the full app shell.
- The deadman workflow copies `reveal.html` over `index.html` and `mobile.html` only after expiry.

Testing safely without triggering a real reveal:

- Run `npm run validate:reveal` to validate the shell.
- Build locally to ensure Vite accepts `reveal.html`.
- In a temporary ignored directory or CI artifact, copy `reveal.html` to a temporary `index.html` equivalent and run static checks; do not modify tracked `index.html` during planning.
- Verify OAuth callback uses `/` query routes so the copied shell works regardless of whether the document originated as `reveal.html` or `index.html`.

## 16. Phased implementation roadmap

### Phase 1: Authentication persistence and canonical origin

- Likely change: `src/discussion/supabase.js`, new small auth-state helper, `src/main.js`, `src/account.js`.
- Must not change: generated catalogs, work manifests, deadman workflow, `index.html` except via reveal process later.
- DB: none unless dashboard settings differ.
- Tests: browser persistence matrix, unit smoke for callback URL builder.
- Acceptance: refresh/tab close/browser close/OAuth return preserve session on the same origin.
- Rollback: revert auth helper/callback changes.
- Expected diff: small/medium.
- Risks: Supabase dashboard misconfiguration cannot be fixed by code alone.

### Phase 2: Account navigation and static-safe routing

- Likely change: `src/page/page.js`, `src/main.js`, `src/page/landing.js`, `src/page/reader.js`, `src/account.js`, CSS.
- Must not change: SQL, generated catalogs.
- DB: none.
- Tests: route parsing, `popstate`, direct refresh of `/?account=...`.
- Acceptance: Profile/Bookmarks/Settings reachable without full reload and survive refresh.
- Rollback: remove links and query-route handling.
- Expected diff: medium.
- Risks: interactions with reader open events and footer startup.

### Phase 3: Bookmark reliability

- Likely change: new bookmark helper, `src/page/reader.js`, `src/account.js`, `src/discussion/service.js` if needed.
- Must not change: `bookmarks.work_id` schema semantics, generated catalogs.
- DB: none initially.
- Tests: missing `parent_work_id`, duplicate prevention, RLS manual checks.
- Acceptance: reader bookmark control appears independent of comments and never stores invalid IDs.
- Rollback: hide reader bookmark control; existing DB rows preserved.
- Expected diff: medium.
- Risks: current catalog may not cover all existing bookmark IDs.

### Phase 4: Black blocks and safe side rails

- Likely change: `src/components/blocks.js`, CSS, same-origin `public/blocks/*.html`, possibly `reveal.html` critical CSS.
- Must not change: `src/data/blocks.json` unless explicitly approved in implementation request.
- DB: none.
- Tests: static block tests, screenshot visual check, iframe cap diagnostics.
- Acceptance: controllable areas black, no white flashes outside cross-origin iframe content, capped live ads.
- Rollback: revert blocks/CSS changes.
- Expected diff: medium.
- Risks: ad-provider policies and cross-origin creative appearance.

### Phase 5: Simple tag foundation

- Likely change: add `src/data/tags.json`, add `src/tags.js`, tests, update search/rotunda/bookmarks to consult helper.
- Must not change: `fetch.json`, `rotunda.json`, `search.index.json`, `storage.json`, `work-catalog.json`, work manifests merely for tags.
- DB: none.
- Tests: schema validation, unknown slug rejection, reverse-index behavior.
- Acceptance: one authoritative tag file, reverse lookup built once, deterministic sorted arrays.
- Rollback: remove new tag files/helper and callers.
- Expected diff: small/medium plus human tag data.
- Risks: owner must supply initial tags.

### Phase 6: Personal exclusions

- Likely change: `src/preferences.js`, `src/account.js`, settings UI, search/rotunda integration adjustments.
- Must not change: generated catalogs.
- DB: verify/apply `user_tag_preferences` migration if absent.
- Tests: signed-out defaults, signed-in personal exclusions, default override, restore defaults, RLS.
- Acceptance: no Supabase call per search query; preferences clear on account switch.
- Rollback: disable personal preference loading; defaults continue locally.
- Expected diff: medium.
- Risks: exact default-exclusion list is unresolved product input.

### Phase 7: Performance and final verification

- Likely change: `src/page/reader.js`, tests/diagnostics, reveal validation.
- Must not change: data catalogs.
- DB: none.
- Tests: full matrix below, performance measurement, memory cleanup, route recovery, `reveal.html -> index.html` validation in temp copy.
- Acceptance: reader-first load order achieved and no stale/private data leaks.
- Rollback: revert reader refactor to previous stable commit.
- Expected diff: medium/large.
- Risks: reader refactor touches the most important path; keep changes reviewable.

## 17. Exact test matrix

### Automated checks

- `npm run validate:reveal`
- `npm run build`
- `npm test`
- Existing Python tests if their dependencies are available: `python -m pytest tests/test_reader_blocks_static.py tests/test_ingest_preprocess.py tests/test_deletor.py`
- New tag validation test: unknown slugs, duplicate slugs, sorted arrays, reverse map.
- New route tests for query account parsing and `popstate`.

### Browser auth tests

For the canonical origin and localhost:

1. Open `/?account=profile`; continue anonymously; verify Supabase localStorage key exists and UI shows anonymous.
2. Refresh; verify same user ID.
3. Close and reopen tab; verify same user ID.
4. Close and reopen browser; verify same user ID unless browser policy clears storage.
5. Link Google from anonymous account; return to `/?account=profile&auth=callback`; verify same `auth.users.id` and existing bookmark rows remain.
6. Start from signed out; continue with Google; verify linked account state.
7. Move from reader to profile/bookmarks/settings and back; verify no full reload required and reader state is not corrupted.
8. Sign out deliberately; verify localStorage session removed, private DOM cleared, preferences reset to defaults, bookmark state cleared, and no previous user's data flashes after signing in as another user.
9. Repeat on apex vs `www` if both are reachable; verify redirects or explain separate storage.

### Bookmark tests

- Bookmark a work with valid `parent_work_id`; verify row `work_id` equals stringified `parent_work_id`.
- Attempt a missing-ID work; verify no row is written and UI explains unavailable.
- Remove bookmark; verify immediate UI update and DB deletion.
- Load more bookmarks; verify no duplicates.
- Disable network; verify retry state without stale private data.

### Reader performance tests

- Measure click-to-shell and click-to-first-image request in Performance panel.
- Rapidly click multiple chapters; verify stale responses do not replace the newest chapter.
- Confirm side rails start after first page or fallback and cause no layout shift.
- Confirm image DOM count remains bounded while scrolling long chapters.

### Side rail/black tests

- Inspect same-origin HTML fragments and wrappers for black backgrounds.
- Simulate iframe load delay/failure and verify black placeholder remains.
- Verify live cross-origin iframe count cap.
- Verify no internal rail scrollbars on desktop reader.

### Reveal compatibility tests

- Validate `reveal.html` directly.
- Build all Vite entry points.
- Test a temporary copy of reveal contents as index without committing it.
- Verify query routes and OAuth callback work after copy.
- Verify maintenance `index.html` remains uncontaminated until the workflow intentionally copies reveal.

## 18. Risks and limitations

- The current checkout has no local `v5` tag, so this document could not compare against `v5` without fetching tags. The absence itself should be resolved before implementation if `v5` history matters.
- The current branch is `work`, not `main`; confirm branch expectations before implementation.
- Supabase dashboard settings cannot be proven from repository files.
- Existing bookmark rows in production may reference IDs not present in current `work-catalog.json`; the UI needs a missing-work state.
- Cross-origin ad iframe internals cannot be styled black by parent CSS.
- Unlimited cloning of live ad iframes is risky and should be replaced carefully.
- Exact default excluded tags are a product/content-policy decision and are not specified in the repository.

## 19. Decisions required from me

1. Canonical production origin: apex or `www`.
2. Exact Supabase Site URL and allowed localhost/preview origins.
3. Whether anonymous accounts remain enabled for bookmarks/comments.
4. Confirmation that Google linking should preserve anonymous bookmarks by keeping the same user ID.
5. Exact default excluded tag list for `tag-policy.json`.
6. Whether default exclusions may be overridden by users.
7. Initial human-maintained contents for `src/data/tags.json`.
8. Whether missing `parent_work_id` works should be non-bookmarkable or receive a separate stable bookmark mapping later.
9. Maximum live ad iframe count per side/viewport.
10. Whether path routes should be kept as redirects/aliases to query routes.

## 20. Definition of done

The account/tag/reader/rail implementation is done when:

- Profile, Bookmarks, and Settings are visible, private, query-routed, and refresh-safe.
- Anonymous and Google sessions persist across refresh/tab close/browser close on the same canonical origin.
- OAuth returns to a stable root callback and rerenders account state through `onAuthStateChange`.
- Sign-out clears private DOM, caches, preferences, bookmark state, and user-keyed in-memory data.
- Reader bookmark controls are available independently from comments and never write invalid IDs.
- Existing bookmarks remain valid and are displayed through a bounded catalog lookup.
- `src/data/tags.json` is the single authoritative membership source and `src/tags.js` builds a reverse index once.
- Signed-out defaults and signed-in personal exclusions work without blocking reader startup or querying Supabase per search.
- Reader opens in the required reader-first order with measurable timing acceptance.
- Rails and all controllable backgrounds are pure black; live ad frames are capped and disposed.
- `reveal.html` remains canonical and works unchanged when copied to `index.html`.

## Ready for implementation when…

- [ ] The working branch is confirmed to be the intended implementation branch.
- [ ] The missing/remote `v5` reference question is resolved if historical comparison is required.
- [ ] Canonical origin and Supabase redirect allowlist are decided.
- [ ] Anonymous auth and Google provider settings are verified in Supabase.
- [ ] Default excluded tags and override policy are supplied.
- [ ] Initial `tags.json` contents or a first small tagging scope is supplied.
- [ ] Live ad iframe cap and acceptable rail behavior are approved.
- [ ] Bookmark behavior for works without `parent_work_id` is approved.
