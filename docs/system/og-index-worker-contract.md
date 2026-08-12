# OG Index / OG Worker current contract

## Status and scope

- **Contract ID:** C-002
- **Status:** active / maintenance
- **Producer:** Chronicle
- **Consumer:** [themoviecosmos-og-worker](https://github.com/XYBuilds/themoviecosmos-og-worker)
- **Scope:** movie Open Graph metadata only

This document is the current cross-repository contract for Chronicle's OG Index projection and the OG Worker's consumer-visible behavior. It supersedes Phase plans, implementation reports, and Phase 23/34 deployment guides as an operational source of truth. Those files remain historical evidence.

This contract is not an availability SLA. Chronicle and the OG Worker are independent deployment units; a coordinated release may briefly fall back to the brand result or fail while the two deployments converge.

## Ownership boundary

| Concern | Owner | Authority |
| --- | --- | --- |
| `movie:{id}` projection, `meta:G`, incremental synchronization | Chronicle | `scripts/cron/` and this contract |
| R2 checkpoint schema and recovery procedure | Chronicle | `scripts/cron/og_index_state.py`, `scripts/cron/og_index_snapshot_r2.py`, current P34.3 guide |
| KV parsing, HTML metadata, PNG rendering, caching, fallback, route handling | OG Worker | Worker source, tests, and README |
| Exact movie fingerprint `M` algorithm and golden vectors | OG Worker | `src/version.ts`, `test/version.spec.ts` |
| Product-level contract index and change coordination | Chronicle | `docs/system/contract-index.md` and this contract |

The Worker does not consume the R2 checkpoint. Chronicle does not own Worker deployment or rendering internals.

## Active KV contract

The shared Cloudflare KV namespace contains these active keys:

| Key | Value | Contract |
| --- | --- | --- |
| `movie:{id}` | JSON object | `id` is a positive TMDB ID encoded in the key. |
| `meta:G` | non-empty string | Opaque publication generation used by the Worker in versioned image URLs. |

`today` is a retired historical key. Scheduled v2 synchronization must not read, write, or recreate it. Explicit v1 migration may only read/delete it through the migration path documented by Chronicle.

### `movie:{id}` value

Each movie value contains all four keys:

```json
{
  "title": "Fight Club",
  "release_date": "1999-10-15",
  "genres": ["Drama"],
  "poster_url": "https://image.tmdb.org/t/p/w780/example.jpg"
}
```

| Field | Required type | Current value rule |
| --- | --- | --- |
| `title` | string | Key and type are required. Empty or malformed content is an upstream contract violation, but the current producer does not reject it. |
| `release_date` | string | Key and type are required. ISO validity is expected upstream but is not enforced by this projection. |
| `genres` | string array | Key and type are required. An empty array is tolerated by the Worker. |
| `poster_url` | string | Key and type are required. An empty string is valid and produces the placeholder rendering path. |

The producer must publish all four keys even though the Worker defensively converts missing non-title values to empty values. That consumer tolerance does not make the producer fields optional. Extra JSON fields are a compatible extension: the current Worker ignores them.

A movie leaving the current galaxy membership leaves the OG Index: Chronicle deletes its `movie:{id}` key. The Worker does not distinguish a removed movie from one that never existed; both use the stable brand fallback.

### `meta:G`

`G` is a non-empty, opaque publication generation. The Worker must not parse its internal format or depend on how Chronicle derives it. The current Chronicle producer sets it from `galaxy_data.json.meta.version`; that is a producer implementation detail rather than a consumer requirement.

`meta:G` is an ordered completion marker, not a transactional generation barrier. Chronicle writes and read-back verifies movie changes before publishing a changed `G`. Cloudflare KV does not provide a cross-key atomic snapshot, so readers may briefly observe mixed propagation. The Worker fallback covers missing or unreadable records; the contract does not promise zero-downtime convergence.

## Chronicle producer state

The committed recovery checkpoint is R2 `ops/og-index/state-v2.json.gz` with `Cache-Control: no-store`:

- `schema_version: 2`
- `projection_version: "og-index-v2"`
- `movie_hashes` containing SHA-256 hashes of canonical movie projections
- `control` containing only `meta_g_value`

This checkpoint is Chronicle producer recovery state, not a Worker input or cross-repository payload.

Scheduled incremental synchronization is v2-only and follows this order:

1. write changed `movie:{id}` records;
2. delete movie keys no longer in the current projection;
3. read-back verify changed and deleted movie keys;
4. write and read-back verify changed `meta:G`;
5. commit the v2 R2 checkpoint.

A missing or invalid v2 checkpoint, quota failure, KV mutation failure, or read-back mismatch fails closed. V1 migration and full recovery are explicit operator paths; scheduled workflows do not invoke them. Both scheduled workflows synchronize the OG Index before publishing R2 galaxy assets and the static site.

## Worker HTTP contract

The supported consumer-visible surface is intentionally small:

| Route | GET / HEAD behavior |
| --- | --- |
| `/og/brand.png` | Missing or incorrect `v` returns `302` to the canonical brand version. The canonical response is `image/png` with immutable caching. |
| `/og/movie/:id.png` | Reads `meta:G` and `movie:{id}`. A usable record renders a versioned movie PNG; a missing or unreadable generation/record returns a usable brand PNG. |
| `/movie/:id` for HTML requests | Returns the SPA shell with movie Open Graph/Twitter metadata. Missing or invalid movie data produces brand metadata rather than a movie 404. |

Other methods return `405 Method Not Allowed`. Unregistered routes return `404 Not Found`.

HTML `og:url` preserves the request path and query, including `?lang=`. Movie image identity does not include `lang`; OG image content is not localized.

Versioned PNG URLs use `v={G}-{M}`. `G` follows the opaque generation contract above. The exact `M` algorithm, delimiter, field order, hash truncation, and golden vectors are Worker-owned. Missing or stale `v` redirects to the canonical URL, and the canonical PNG is immutable.

Movie HTML computes `M` before downloading the poster, using the normal-poster state. The PNG request downloads the poster and then computes `M`. When the poster works, HTML and PNG versions agree. When the poster fails, the PNG endpoint may issue one additional `302` to a placeholder-version URL before returning the PNG. This is a known current runtime behavior, not a permanent redirect-shape guarantee; consumers may rely only on resolving to a usable PNG.

## Stable fallback and retired surfaces

The brand result is the stable fallback when `meta:G` or `movie:{id}` is missing or unreadable. This includes movies removed from the current OG Index. The fallback is part of the contract; the system does not promise uninterrupted movie-specific metadata during deployment or KV propagation.

There is no active `today` KV key and no Today product capability. The historical names remain reserved from product reuse:

- `/today` and `/share/today` have no Worker-specific binding. GET and HEAD requests, with or without query strings, follow Chronicle ordinary invalid-path handling at the site edge — the same status, content type, cache behavior, and body as a representative unknown Chronicle path such as `/unknown`.
- `/og/today.png` is an unknown route inside the active `/og/*` Worker namespace. It matches an ordinary unknown `/og/*` path such as `/og/unknown.png` and must not read KV, fetch the SPA shell, or render a brand or movie card.

Active `/og/brand.png`, `/og/movie/:id.png`, `/movie/:id`, `movie:{id}`, `meta:G`, fallback, version, and ownership rules are unchanged. Worker runtime detail lives in the OG Worker README and [ADR-0002](https://github.com/XYBuilds/themoviecosmos-og-worker/blob/main/docs/adr/0002-retired-today-follows-chronicle-invalid-path.md). Reusing the retired names requires a new product Initiative and an explicit contract migration.

## Change classification and release

### Compatible changes

Adding an optional movie JSON field is compatible when existing fields retain their meaning and types and the Worker may ignore the new field. It may be released independently.

### Breaking changes

Removing or renaming required fields, changing field types or semantics, changing key rules, changing `G` semantics, or changing public version behavior is breaking. Exact `M` or layout changes are Worker-owned but still require checking public cache behavior.

Breaking cross-repository changes use a **coordinated best-effort cutover**: publish Chronicle and Worker changes in a deliberately short release window and accept a brief brand fallback or request failure. This project does not promise atomic cross-repository deployment or require a long-lived compatibility window.

If cutover fails:

1. stop or roll back the Chronicle producer first so it cannot expand the incompatible KV state;
2. roll back the Worker;
3. retain newly written keys and values for diagnosis; do not delete production state as an emergency reflex;
4. repair or replay through the explicit producer recovery path.

### Version responsibilities

| Change | Version to bump |
| --- | --- |
| R2 checkpoint JSON shape or checkpoint validation rules | snapshot `schema_version` |
| Movie projection fields, normalization, or projection hash rules | `projection_version` |
| OG pixel layout, `M` inputs, or `M` algorithm | Worker `LAYOUT_VERSION` |
| Documentation, route explanation, or fallback explanation only | none |

Only bump the version whose responsibility changed. No compatibility framework or automated cross-repository migration is required solely to keep these numbers aligned.

## Verification and evidence

Repository tests are the persistent regression evidence:

- Chronicle: `scripts/tests/test_og_index_state.py`, `test_sync_og_index_kv.py`, `test_og_pipeline_phase34.py`, and `test_c002_retired_today_documentation_contract.py`.
- OG Worker: `test/index.spec.ts`, `test/html.spec.ts`, and `test/version.spec.ts`.

Production smoke checks are dated observations, not perpetual proof. Re-run them manually after a contract or deployment change, and record a dated result only after the check has actually run. Chronicle's dated Today-route comparison is `scripts/cron/retired_today_route_smoke.py`.

Historical evidence remains in Phase 38 and Phase 40 plans/reports. It explains how the system evolved but does not override this current contract.