# Why AnimePlex Search Does Not Update

## Executive Summary

The primary confirmed root cause is that the browser URL used by the UI, `/data/search.index.json`, is served from `public/data/search.index.json` in Vite/Wrangler builds, not from `src/data/search.index.json`. The ingest script and generator write only `src/data/search.index.json`, while `npm run build` copies the stale public file into `dist/data/search.index.json`. In this checkout, those files are different:

- `src/data/search.index.json`: generated `2026-07-10T20:39:22.381071+00:00`, 1,312 entries, SHA-256 `b6056b681937d7299d96a264143144bd37c2501833ffccd8e134b242d4639adf`.
- `public/data/search.index.json`: generated `2026-07-03T20:35:11.736735+00:00`, 7,384 entries, SHA-256 `362cfe597d612ca9645fbc5e89dd78d68314dbccd849beb491995c2686369298`.
- After `npm run build`, `dist/data/search.index.json` has the same SHA-256 as `public/data/search.index.json`, not `src/data/search.index.json`.

That proves this is not merely browser cache or Cloudflare cache. A fresh local build packages the stale public asset.

Secondary confirmed causes:

1. `scripts/ingest-work.py` writes a manifest for every ingested work, but it updates `fetch.json` only when `--update-fetch` is passed or the guided prompt is answered yes.
2. It regenerates search only when `--generate-search` is passed or the guided prompt is answered yes.
3. `src/tools/generate_search.py` does not scan `src/data/works/` directly. It follows entries in `fetch.json`, optionally loading each entry's `manifest` path. A manifest under `src/data/works/` is invisible to search unless `fetch.json` points at it.
4. The frontend keeps the parsed search entries in the module-level `searchIndexPromise` for the lifetime of the page and uses `fetch('/data/search.index.json')` with browser default cache behavior.
5. Even if a valid entry is loaded, the UI filters only by `entry.normalized`, which the generator sets from display text only. Slug/chapter tokens exist in the JSON but are not used by `search.js` filtering.

The smallest reliable fix for “regenerate the index and boom, we’re in business” is to make the generated file be the deployed file: generate to `public/data/search.index.json`, or copy `src/data/search.index.json` to `public/data/search.index.json` as part of generation/build/deploy. Then rebuild so `dist/data/search.index.json` contains that same file.

## Expected Search Pipeline

Expected data flow:

```text
src/data/works/<slug>.json
→ src/data/fetch.json pointer
→ scripts/generate_search.py wrapper
→ src/tools/generate_search.py implementation
→ src/data/search.index.json
→ build output / deployed asset
→ /data/search.index.json
→ src/components/search.js
→ visible search result
```

For this expectation to work, the file generated in `src/data/search.index.json` must be the same file served at `/data/search.index.json` after the build/deployment.

## Actual Search Pipeline

Actual data flow in this repository:

```text
ingest-work.py
→ always writes src/data/works/<slug>.json
→ conditionally updates src/data/fetch.json only with --update-fetch / guided yes
→ conditionally runs scripts/generate_search.py only with --generate-search / guided yes
→ scripts/generate_search.py delegates to src/tools/generate_search.py
→ generator reads src/data/fetch.json + src/data/storage.json
→ generator writes src/data/search.index.json
→ Vite build copies public/data/search.index.json to dist/data/search.index.json
→ Wrangler deploys ./dist as Worker assets
→ browser fetches /data/search.index.json
→ served file is the build/deployed public asset, not src/data/search.index.json
```

The key break is between `src/data/search.index.json` and `/data/search.index.json`.

## File and Path Map

| Path / URL | Role | Confirmed behavior |
|---|---|---|
| `scripts/ingest-work.py` | Ingestion script | Creates chapter `item.json`, work manifest, optional `fetch.json`, optional `rotunda.json`, optional search regeneration. |
| `scripts/generate_search.py` | Wrapper | Uses `runpy` to execute `src/tools/generate_search.py`. |
| `src/tools/generate_search.py` | Real generator | Reads `fetch.json` and `storage.json`, follows manifest paths from `fetch.json`, writes search index. |
| `src/data/fetch.json` | Generator work list | The generator discovers works here; it does not enumerate `src/data/works/` directly. |
| `src/data/storage.json` | Source roots | Provides active environment and source URL map. |
| `src/data/works/<slug>.json` | Work manifests | Loaded only when referenced by a `manifest` field in `fetch.json`. |
| `src/data/search.index.json` | Generator output | Written by ingest/generator, but not the file Vite serves at `/data/search.index.json`. |
| `public/data/search.index.json` | Static public asset | Copied by Vite to `dist/data/search.index.json`; currently stale relative to `src/data/search.index.json`. |
| `dist/data/search.index.json` | Build artifact | Created by `npm run build`; matched `public/data/search.index.json` in diagnostics. |
| `/data/search.index.json` | Browser URL | The frontend fetches this exact path. In a Vite build, `/data/...` maps to `public/data/...` copied into `dist/data/...`. |
| `wrangler.jsonc` | Deployment asset config | Deploys `./dist` as Worker assets. |

`find . -name 'search.index.json' -print` found exactly these repository files before build: `./public/data/search.index.json` and `./src/data/search.index.json`. After build, `./dist/data/search.index.json` also exists.

## Generator Behavior

The actual implementation is `src/tools/generate_search.py`; `scripts/generate_search.py` is only a compatibility wrapper that runs that implementation.

`src/tools/generate_search.py` declares its contract as `fetch.json + storage.json → search.index.json`. It reads the active storage profile, validates source roots, extracts `works` from `fetch.json`, and iterates those work dictionaries. If an entry has a `manifest` string, it resolves that manifest relative to the `fetch.json` directory and merges selected manifest fields (`slug`, `display`, `title`, `source`, `thumb`, `chapters`) into the work.

Work discovery is therefore `fetch.json`-driven:

- It does **not** scan `src/data/works/` directly.
- A newly created `src/data/works/<slug>.json` is ignored unless `src/data/fetch.json` contains an entry pointing to `works/<slug>.json`.
- Manifest path capitalization and slug spelling matter because the path is resolved literally relative to `src/data/fetch.json`.

Filtering and skip rules:

- The default source is `e`.
- The generator indexes only works whose `source` equals the requested `--source`.
- If the work has no explicit source, it defaults to the requested source.
- If the work's source is different from the requested source, it is silently skipped by `continue` and is not listed in `skipped`.
- If the source equals the requested source but is absent from `storage.json` active profile sources, it is recorded in `skipped` as an unknown source.
- If the work has no non-empty slug, it is recorded as `missing work slug`.
- If no chapter entry can be parsed, it records `work has no valid chapters`.
- A chapter string is valid. A chapter object is valid only if it contains a non-empty `slug`, `chapter`, `path`, or `id`, and a non-empty display/title/name or display derived from the path.
- Invalid chapter entries are recorded in `skipped`.

The diagnostic command `jq -r '.skipped[]? | "\(.work): \(.reason)"' src/data/search.index.json` produced no output for the current `src/data/search.index.json`, and `jq` reported `skipped: []`.

## Ingestion Behavior

`ingest-work.py` creates chapter manifests and the work manifest in `ingest_one_work`:

- It detects chapters from folders containing page images.
- It writes each chapter's `item.json` with page count, padding, extension, base URL, parent slug, and optional parent work id.
- It writes `src/data/works/<slug>.json` with `version`, `slug`, `display`, `source`, `thumb`, and `chapters`.

It does not always update `fetch.json`. It builds a pointer with `manifest: works/<slug>.json`, but calls `upsert_pointer(data / 'fetch.json', ...)` only when `args.update_fetch` is true and `args.no_fetch_update` is false.

It does not always regenerate search. It runs `scripts/generate_search.py --fetch <data>/fetch.json --storage <data>/storage.json --out <data>/search.index.json --source <source>` only when `args.generate_search` is true and `args.no_search` is false.

The command-line flags are explicit:

- `--update-fetch` controls `fetch.json` updates.
- `--update-rotunda` controls `rotunda.json` updates.
- `--generate-search` controls search regeneration.
- `--no-fetch-update`, `--no-rotunda`, and `--no-search` can suppress those actions.
- In guided mode, the script prompts for “Update fetch.json?”, “Update rotunda.json?”, and “Regenerate search.index.json?”, defaulting to yes.
- In non-guided mode, the flags default false unless passed.
- `--commit-push` stages `all_written` paths, commits, and pushes, but it stages only files the script recorded as written.

## Frontend Behavior

`src/components/search.js` defines `SEARCH_INDEX_URL = '/data/search.index.json'` and fetches that exact URL. It does not import `src/data/search.index.json` as a bundled asset.

The loader caches the fetch promise in the module-level variable `searchIndexPromise`. Once one successful fetch resolves, every later search on the same page reuses the same parsed `entries` array until page reload. This is JavaScript in-memory cache, not HTTP/CDN cache.

The fetch call does not pass a `cache` option, so it uses browser default HTTP caching behavior. This may contribute to stale results if response headers allow caching, but it is not required to explain the observed local build discrepancy.

Search filtering is simple substring matching over `entry.normalized`:

```text
tokens.every(token => entry.normalized?.includes(token))
```

The generated `tokens`, `prefixes`, and `compact` maps are not used by the UI. Because work entries set `normalized` from display text only, a valid entry can be invisible for queries that match only slug-specific text, chapter path text, aliases, or tokens but not the display string.

The UI shows the first 12 matching entries and then stops. Ranking is insertion-order only, not score based. A valid match beyond the first 12 can be hidden by the result cap.

## Build and Deployment Behavior

`package.json` defines `npm run build` as `vite build`.

`vite.config.js` declares HTML inputs but does not configure copying from `src/data` to `/data`. Vite's public directory convention copies `public/*` into `dist/*` at the same URL path. Therefore `public/data/search.index.json` becomes `dist/data/search.index.json` and maps to `/data/search.index.json`.

`wrangler.jsonc` deploys assets from `./dist`, so the Cloudflare Worker asset for `/data/search.index.json` comes from `dist/data/search.index.json`.

Diagnostics proved this path:

```text
sha256(src/data/search.index.json)    = b6056b681937d7299d96a264143144bd37c2501833ffccd8e134b242d4639adf
sha256(public/data/search.index.json) = 362cfe597d612ca9645fbc5e89dd78d68314dbccd849beb491995c2686369298
sha256(dist/data/search.index.json)   = 362cfe597d612ca9645fbc5e89dd78d68314dbccd849beb491995c2686369298
```

So a deploy after this build would publish the stale public file, not the regenerated source data file.

No repository service worker was found by the requested search command, and no Worker script using the Cloudflare Cache API was found. Wrangler is configured for static assets only via `assets.directory = './dist'`.

A network fetch of `https://animeplex.lol/data/search.index.json` from this environment failed with `curl: (56) CONNECT tunnel failed, response 403`, so this report cannot confirm the current production hash from inside the container. That is an environment/network limitation, not evidence for or against CDN caching.

## Cache Analysis

### Browser HTTP cache

Confirmed behavior: `search.js` calls `fetch('/data/search.index.json')` without `{ cache: 'no-store' }`, so normal browser HTTP cache rules apply. This is a possible stale-file mechanism if the deployed asset or CDN sends cacheable headers. It is not the primary proven cause here because `npm run build` itself produced a stale `dist/data/search.index.json` from `public/data/search.index.json`.

### JavaScript in-memory cache

Confirmed behavior: `searchIndexPromise` caches the parsed entries for the page lifetime. If the JSON changes while the page is open, the UI will not refetch it until reload or a new module instance.

### Service worker cache

No service worker cache path was found in the inspected files. This is not a confirmed cause.

### Cloudflare CDN cache

Not proven. The local build artifact discrepancy is sufficient to explain stale live search after deploy. Production HTTP headers and asset body still need to be checked from a network that can access the deployed URL.

### Cloudflare Worker Cache API

No Worker Cache API code was found. `wrangler.jsonc` configures static assets from `./dist`.

### Stale deployment artifacts

Confirmed. `dist/data/search.index.json` is generated from `public/data/search.index.json`, and that public file is stale relative to `src/data/search.index.json`.

## Reproduction

1. Regenerate the source index:

   ```bash
   python scripts/generate_search.py \
     --fetch src/data/fetch.json \
     --storage src/data/storage.json \
     --out /tmp/search.index.test.json \
     --source e
   ```

2. Compare regenerated source-style output with the files the browser/build uses:

   ```bash
   sha256sum src/data/search.index.json /tmp/search.index.test.json public/data/search.index.json
   ```

   Observed: all three hashes were not the same, and `public/data/search.index.json` did not match the regenerated output.

3. Build:

   ```bash
   npm run build
   ```

4. Compare build artifact:

   ```bash
   sha256sum dist/data/search.index.json src/data/search.index.json public/data/search.index.json /tmp/search.index.test.json
   ```

   Observed: `dist/data/search.index.json` matched `public/data/search.index.json`, not `src/data/search.index.json` or `/tmp/search.index.test.json`.

5. Because `search.js` fetches `/data/search.index.json`, the browser reads the built/deployed `dist/data/search.index.json`, not the regenerated `src/data/search.index.json`.

## Root Cause

Ranked by likelihood and impact:

1. **Primary: generated file and deployed file are different.** The generator writes `src/data/search.index.json`, but `/data/search.index.json` is served from `public/data/search.index.json` copied to `dist/data/search.index.json`. This fully explains “appears locally but is not used by deployed website.”
2. **High impact: works are discoverable only via `fetch.json`.** A new manifest under `src/data/works/` does not enter the index unless `fetch.json` is updated. Non-guided `ingest-work.py` does not update `fetch.json` unless `--update-fetch` is passed.
3. **Medium impact: search regeneration is opt-in in non-guided ingestion.** `ingest-work.py` does not run the generator unless `--generate-search` is passed.
4. **Medium impact: source filtering can silently exclude works.** Works whose manifest source differs from `--source e` are skipped by `continue` and do not appear in `skipped`.
5. **Medium impact: frontend query logic uses only `entry.normalized`.** Valid entries may not show for slug/chapter-token queries, and the first 12 insertion-order matches cap can hide later valid entries.
6. **Low-to-medium impact: in-page and HTTP cache.** `searchIndexPromise` caches entries until reload, and browser cache defaults are used, but these are secondary because the build artifact is already stale.

## Proof

Commands run and observed facts:

```bash
find . -name 'search.index.json' -print
```

Before build, found:

```text
./public/data/search.index.json
./src/data/search.index.json
```

After build, also found:

```text
./dist/data/search.index.json
```

```bash
git status --short
```

Initial output was empty, meaning no staged or unstaged repository changes before creating this report.

```bash
git check-ignore -v src/data/search.index.json || true
```

No output: `src/data/search.index.json` is not ignored.

```bash
git log --oneline -- src/data/search.index.json | head -20
```

Showed multiple commits touching the source index, including `6701fe3 Add AnimePlex works batch (6)`.

```bash
python scripts/generate_search.py \
  --fetch src/data/fetch.json \
  --storage src/data/storage.json \
  --out /tmp/search.index.test.json \
  --source e
```

Observed:

```text
storage: /workspace/beep-boop/src/data/storage.json
fetch:   /workspace/beep-boop/src/data/fetch.json
env:     production
source:  e -> https://cdn.animeplex.lol/works
entries: 1312
tokens:  741
skipped: 0
saved:   /tmp/search.index.test.json
```

```bash
sha256sum src/data/search.index.json /tmp/search.index.test.json public/data/search.index.json
```

Observed:

```text
b6056b681937d7299d96a264143144bd37c2501833ffccd8e134b242d4639adf  src/data/search.index.json
07e73b4879ae8e9cb4484f07e68615f9c18570a4f4cddc696fefe014d1066b64  /tmp/search.index.test.json
362cfe597d612ca9645fbc5e89dd78d68314dbccd849beb491995c2686369298  public/data/search.index.json
```

```bash
jq empty src/data/search.index.json
```

Passed.

```bash
jq -r '.skipped[]? | "\(.work): \(.reason)"' src/data/search.index.json
```

Produced no output.

```bash
jq '{generated, environment, source, source_root, entries: (.entries | length), skipped}' src/data/search.index.json
```

Observed:

```json
{
  "generated": "2026-07-10T20:39:22.381071+00:00",
  "environment": "production",
  "source": "e",
  "source_root": "https://cdn.animeplex.lol/works",
  "entries": 1312,
  "skipped": []
}
```

```bash
jq '{generated, entries:(.entries|length), skipped:(.skipped|length)}' public/data/search.index.json dist/data/search.index.json
```

Observed both public and dist files had:

```json
{
  "generated": "2026-07-03T20:35:11.736735+00:00",
  "entries": 7384,
  "skipped": 3
}
```

```bash
npm run build
```

Passed and produced `dist/data/search.index.json`.

```bash
sha256sum dist/data/search.index.json src/data/search.index.json public/data/search.index.json /tmp/search.index.test.json
```

Observed:

```text
362cfe597d612ca9645fbc5e89dd78d68314dbccd849beb491995c2686369298  dist/data/search.index.json
b6056b681937d7299d96a264143144bd37c2501833ffccd8e134b242d4639adf  src/data/search.index.json
362cfe597d612ca9645fbc5e89dd78d68314dbccd849beb491995c2686369298  public/data/search.index.json
07e73b4879ae8e9cb4484f07e68615f9c18570a4f4cddc696fefe014d1066b64  /tmp/search.index.test.json
```

Example works present in `src/data/search.index.json` but absent from `public/data/search.index.json`:

```text
Atashi_ga_Oshikko_o_Gaman_Suru_The_Reason_I_Hold_My_Pee_In
Komochi_Tsuma_no_Arai-san_Arai-san_a_wife_with_a_child
Konoha_Donburi
MATCHLIGHT_-Hello_Kitty-
Otomari_no_Hi_Sleepover_Day
Toki_o_Karu_Karasu_Zenpen_-What_Kind_Of_Person_Are_You
```

## Recommended Fix

Smallest reliable fix:

1. Change the search-generation workflow to write the file that the site actually serves:

   ```bash
   python scripts/generate_search.py \
     --fetch src/data/fetch.json \
     --storage src/data/storage.json \
     --out public/data/search.index.json \
     --source e
   ```

2. Build and verify:

   ```bash
   npm run build
   sha256sum public/data/search.index.json dist/data/search.index.json
   ```

3. Ensure deployment publishes the rebuilt `dist` directory.

Alternative minimal fix: keep generating `src/data/search.index.json`, but add a deterministic copy step before build:

```bash
cp src/data/search.index.json public/data/search.index.json
npm run build
```

## Permanent Fix

Recommended permanent behavior:

1. Choose one canonical index path. Because the frontend fetches `/data/search.index.json`, the canonical deploy source should be `public/data/search.index.json`, or the frontend should be changed to consume a bundled/imported `src` asset. Do not keep two authoritative `search.index.json` files.
2. Update `ingest-work.py` so `--generate-search` writes to the deploy source path, or writes to both `src/data/search.index.json` and `public/data/search.index.json` and verifies they match.
3. Add an npm prebuild step that always regenerates or copies the index into `public/data/search.index.json` before Vite runs.
4. Add a CI/build check that fails if `src/data/search.index.json`, `public/data/search.index.json`, and `dist/data/search.index.json` are unexpectedly different.
5. Make non-guided ingestion safer by either defaulting to `--update-fetch --generate-search` or adding a single `--publish-search` flag that performs all required local data steps.
6. Consider changing the frontend fetch to `fetch('/data/search.index.json', { cache: 'no-store' })` or adding versioned query/cache headers only after the deploy artifact mismatch is fixed.
7. Consider using generated token maps or including slug/chapter fields in `entry.normalized` so valid entries are discoverable by slug and chapter terms.

## Verification Checklist

Replace `<slug>` and `<query>` with the work under investigation.

1. Prove the work exists in `fetch.json`:

   ```bash
   jq -e --arg slug '<slug>' '.works[] | select(.slug == $slug)' src/data/fetch.json
   ```

2. Prove its manifest path is valid:

   ```bash
   jq -r --arg slug '<slug>' '.works[] | select(.slug == $slug) | .manifest' src/data/fetch.json
   test -f "src/data/$(jq -r --arg slug '<slug>' '.works[] | select(.slug == $slug) | .manifest' src/data/fetch.json)"
   jq empty "src/data/$(jq -r --arg slug '<slug>' '.works[] | select(.slug == $slug) | .manifest' src/data/fetch.json)"
   ```

3. Prove the generator includes it:

   ```bash
   python scripts/generate_search.py --fetch src/data/fetch.json --storage src/data/storage.json --out /tmp/search.index.test.json --source e
   jq -e --arg slug '<slug>' '.entries[] | select(.work == $slug)' /tmp/search.index.test.json
   ```

4. Prove the deploy-source asset includes it:

   ```bash
   jq -e --arg slug '<slug>' '.entries[] | select(.work == $slug)' public/data/search.index.json
   ```

5. Prove the built asset includes it:

   ```bash
   npm run build
   jq -e --arg slug '<slug>' '.entries[] | select(.work == $slug)' dist/data/search.index.json
   sha256sum public/data/search.index.json dist/data/search.index.json
   ```

6. Prove the deployed URL includes it from a network that can reach production:

   ```bash
   curl -fsSL https://animeplex.lol/data/search.index.json -o /tmp/prod.search.index.json
   jq -e --arg slug '<slug>' '.entries[] | select(.work == $slug)' /tmp/prod.search.index.json
   sha256sum public/data/search.index.json dist/data/search.index.json /tmp/prod.search.index.json
   ```

7. Prove `search.js` reads that exact deployed asset:

   ```bash
   rg -n "SEARCH_INDEX_URL|fetch\(SEARCH_INDEX_URL\)|/data/search.index.json" src/components/search.js dist/assets/*.js
   ```

8. Prove the search UI should return it for the exact query:

   ```bash
   jq -r --arg q '<query>' '
     def norm: ascii_downcase | gsub("[_/-]"; " ") | gsub("[^a-z0-9 ]"; "") | gsub(" +"; " ") | gsub("^ | $"; "");
     ($q | norm | split(" ") | map(select(length > 0))) as $tokens
     | .entries[]
     | select(all($tokens[]; .normalized | contains(.)))
     | [.display, .work, .chapter] | @tsv
   ' dist/data/search.index.json | head -12
   ```
