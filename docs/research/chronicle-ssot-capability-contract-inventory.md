# Chronicle SSOT capability and contract inventory

- **Wayfinder ticket:** [Freeze the active capability and contract inventory](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/issues/347)
- **Map:** [Chart the Chronicle SSOT re-baseline and evidence-gated cleanup](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/issues/346)
- **Frozen:** 2026-08-11 (Asia/Shanghai)
- **Scope:** Chronicle-owned capabilities, operational entry points, producer contracts, and their consumers. OG Worker runtime and Daily Stargazing editorial/publication behavior are included only where they consume a Chronicle contract.
- **Non-goal:** This inventory does not decide which contradictory source wins and does not authorize documentation rewrites, runtime changes, migration, or cleanup.

## Result

The re-baseline has a bounded coverage floor: **nine capability groups, ten operational surfaces, five current or candidate producer contracts, and six consumer dependencies**. The existing system map identifies most of them, but it is not sufficient as the frozen baseline because it collapses independently drifting release stages, omits the active focus-emission profile boundary, and treats several stale Phase-era documents as current normative sources.

The strongest live evidence shows a deliberately non-atomic release pipeline in a currently split state: the production Pages manifest still advertises galaxy version `2026.08.02.daily.131`, while the movie OG endpoint redirects with generation `2026.08.09.daily.138`. The latest nightly run successfully completed data refresh, OG KV sync, and R2 publication, then failed the frontend build and skipped Pages deployment. This is recorded as `NR-01`; it is evidence to reconcile, not a conclusion about the intended contract.

## Evidence model and status vocabulary

The repository itself defines the evidence hierarchy used here: current system/project documents are normative candidates, while source, tests, workflows, deployment configuration, consumers, and dated production observations establish what is verifiably true. Historical Plans and Reports remain evidence and are not silently promoted to current specifications ([repository guidance](../../AGENTS.md), [domain reading order](../agents/domain.md), [decision index](../system/decision-index.md)).

Statuses in this inventory mean:

- `active`: present in current source and backed by a current workflow, test, consumer, or production observation.
- `active — degraded evidence`: the capability exists, but a current operational stage is failing or deployed generations disagree.
- `active / maintenance`: supported compatibility surface with limited feature development expected.
- `maintenance`: operator, diagnostic, compatibility, or manual-smoke surface; not a primary product capability.
- `retired`: explicitly unsupported and guarded against reactivation.
- `external active dependency`: owned elsewhere but currently consumes a Chronicle surface.
- `needs-reconciliation`: sources or observations disagree; the contradiction is preserved in the numbered queue below.

Repository snapshots used for consumer evidence are pinned to:

- Chronicle: [`0c79c82`](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/tree/0c79c82ada189db824a50f1307e19417d3a71c93)
- OG Worker: [`b08d953`](https://github.com/XYBuilds/themoviecosmos-og-worker/tree/b08d953b1ea2cf43e14db40cce7e0ad3f2092e9d)
- Daily Stargazing: [`63a819f`](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/tree/63a819fdb984a89599a38698d65f9889be6a420a)

## Capability inventory

| ID | Bounded capability | Owner | Status | Normative-source candidates | Strongest current evidence | Marker |
| --- | --- | --- | --- | --- | --- | --- |
| CAP-01 | 3D galaxy browsing, WebGL rendering, and time-depth navigation | Chronicle | active | [Capability map](../system/capability-map.md); PRD, Design Spec, and Tech Spec indexed by the [decision index](../system/decision-index.md) | `frontend/src/three/`, `frontend/src/store/`, `Timeline.tsx`, and frontend tests; production `/` returned `200` on the freeze date | — |
| CAP-02 | Canonical exploration lifecycle: idle, person/genre select session, nested/replacing movie focus, drawer, exit behavior, and `/movie/{tmdbId}` navigation | Chronicle | active | [Context vocabulary](../../CONTEXT.md); [planet state-machine spec](../project_docs/%E6%98%9F%E7%90%83%E7%8A%B6%E6%80%81%E6%9C%BA%20spec.md); Design/Tech Specs | Current route parser supports only home/movie/unknown and preserves query strings; `App.tsx`, `frontend/src/lib/exploration/`, route/escape/focus tests, and live `/movie/550?lang=zh` `200` | — |
| CAP-03 | Title, person, genre-AND, and TMDB ID search and selection | Chronicle | active | [Capability map](../system/capability-map.md); Phase 43 Plan as historical design evidence | `SearchBar.tsx` declares the four tabs and current adapters/tests cover title scoring, person sessions, genre masks, and TMDB ID lookup | NR-07 |
| CAP-04 | Seven-locale HUD, localized share URLs, fullscreen, information, support, feedback, and community/share entry points | Chronicle | active; integrations conditional on build-time configuration | README/Design/Tech Specs; locale bundle structure as a candidate | `LOCALE_IDS` contains seven locales; `App.tsx` mounts language/fullscreen/info/support/feedback controls; `shareLinks.ts` builds movie, social, Discord, and email targets; locale schema tests | — |
| CAP-05 | Movie sharing and dynamic movie/brand Open Graph experience | Chronicle owns product identity and producer contract; OG Worker owns runtime | active / maintenance | [C-001/C-002 index](../system/contract-index.md); [current OG contract](../system/og-index-worker-contract.md) | Worker source/tests and Wrangler routes; freeze-date production checks: brand PNG canonical `302` with followed response `200`, movie PNG canonical `302`, movie HTML `200` | — |
| CAP-06 | Galaxy dataset production: cleaning, feature engineering, text/genre/language features, UMAP/refit, galaxy JSON and search-index export | Chronicle | active | [Data Pipeline](../project_docs/TMDB%20%E7%94%B5%E5%BD%B1%E5%AE%87%E5%AE%99%20Data%20Pipeline.md); Tech Spec; feature-to-rendering map | `scripts/pipeline/`, `scripts/feature_engineering/`, `scripts/export/`, validators, export tests, nightly/monthly entry points | — |
| CAP-07 | Rating-derived focus emission profile and canonical visual-state parity across website focus and headless export | Chronicle | active | Current source and Phase 42 records are candidates; it is not yet represented as its own entry in the contract/decision indexes | Production startup fails closed without an active profile; the manifest parser validates the pointer and immutable URL; runtime/exporter parity is covered by `crossEntryParity.spec.ts`; the live manifest carries an August active profile | NR-02, NR-03 |
| CAP-08 | Deterministic single-planet image export by TMDB ID, with transparent PNG and render metadata | Chronicle producer; Daily consumer | active / maintenance | [C-003 index entry](../system/contract-index.md); Phase 36 Plan/Reports as historical evidence | `tools/planet-exporter/` CLI, argument/exit-code contract, atomic artifact writer, PNG safety checks, render metadata, browser tests, and Daily adapter/tests | NR-08 |
| CAP-09 | Product-control repository map, cross-repository contract index, and Initiative coordination | Chronicle | active planning/control surface | `AGENTS.md`, [repository map](../system/repository-map.md), [contract index](../system/contract-index.md), [issue tracker rules](../agents/issue-tracker.md) | Repository guidance assigns Chronicle the primary site, pipeline, planet-export producer, system map, and temporary product-level coordination while preserving sibling ownership | — |

## Operational-surface inventory

These are invocation and release boundaries, not every helper script.

| ID | Operational surface | Owner | Status | Normative-source candidates | Strongest workflow/runtime evidence | Marker |
| --- | --- | --- | --- | --- | --- | --- |
| OPS-01 | Manual full/local pipeline and export (`scripts/run_pipeline.py`, export/validation tools) | Chronicle | active / maintenance | Data Pipeline and Tech Spec | Current Python entry points and test suites under `scripts/tests/` | — |
| OPS-02 | Read-only Supabase health/preflight, both standalone and before scheduled work | Chronicle | active / maintenance | Data Pipeline and Supabase guide | `supabase_preflight.yml`; both scheduled workflows run `check_supabase_health.py` before data mutation | — |
| OPS-03 | Nightly vote refresh: frozen-threshold membership update, export, OG sync, R2 publication, frontend build, Pages deployment | Chronicle | active — degraded evidence | Data Pipeline; `nightly_vote_refresh.yml`; current release reports | Scheduled daily workflow. On [run 31333858544](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/31333858544), refresh, OG sync, and R2 publish succeeded; build failed because Vite was missing and Pages deploy was skipped | NR-01, NR-06 |
| OPS-04 | Monthly refit: threshold recomputation, UMAP/Procrustes, profile generation/activation, OG sync, R2 publication, Pages deployment | Chronicle | active | Data Pipeline; `monthly_refit.yml`; Phase 42 evidence | Scheduled monthly workflow with explicit bootstrap/force-activation controls; [2026-08-01 run 30717948388](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/30717948388) succeeded | NR-02, NR-03 |
| OPS-05 | OG Index incremental sync and v2 R2 recovery checkpoint | Chronicle producer | active / maintenance | [Current OG contract](../system/og-index-worker-contract.md); P34.3 current operator guide | `sync_og_index_kv.py`, `og_index_state.py`, `og_index_snapshot_r2.py`, producer tests, and successful sync in the latest nightly | — |
| OPS-06 | R2 immutable galaxy/search release, active profile artifact, and Pages manifest generation | Chronicle | active; deployed generations currently split | Workflow files and `upload_galaxy_r2.py`; C-004 candidate | Latest nightly successfully published R2 version `2026.08.09.daily.138`; the live Pages manifest remains `2026.08.02.daily.131` with an August profile | NR-01, NR-02, NR-05 |
| OPS-07 | Cloudflare Pages build and Direct Upload of the application shell and short-TTL manifest | Chronicle | active — degraded evidence | Data Pipeline/Tech Spec and the two scheduled workflows | `prepare-pages-deploy.mjs`, production build checks, Wrangler action. The latest nightly skipped deployment after build failure; production shell still returned `200` | NR-01, NR-06 |
| OPS-08 | Planet Export CLI invoked locally or by Daily using Chronicle source plus manifest/data overrides | Chronicle producer; Daily invokes | active / maintenance | C-003 candidate; Phase 36 evidence | Root `planet:export` script, typed CLI, Playwright/Vite render bridge, Daily `render_planet()` adapter and tests | NR-08 |
| OPS-09 | Manual benchmarks and visual diagnostic/evidence generators | Chronicle | maintenance | Historical Phase 18/39/41/42 plans and reports | `phase18_refit_benchmark.yml`, exporter evidence scripts, diagnostic-only markers/tests | NR-03 |
| OPS-10 | GitHub Pages deployment workflow | Chronicle | retired as production; retained as manual smoke | Workflow header is the strongest status source | `deploy-pages.yml` is `workflow_dispatch` only and explicitly says push-to-main deployment is retired | NR-04 |

## Producer-contract inventory

### C-001 · Movie identity and route

- **Owner/status:** Chronicle; active.
- **Boundary:** positive TMDB `id` is product identity and `/movie/{tmdbId}` is the canonical site route.
- **Consumers:** Chronicle frontend, OG Worker HTML/movie PNG handling, Daily candidate links.
- **Normative candidates:** [contract index](../system/contract-index.md), Tech Spec, current route/context vocabulary.
- **Evidence:** Chronicle route source/tests; Worker `/movie/*` route and meta injection; Daily stores `tmdb_id` and generates movie links.
- **Change surface:** identity, route syntax, invalid/missing behavior, and query preservation.
- **Marker:** —.

### C-002 · OG Index KV projection and movie OG behavior

- **Owner/status:** Chronicle projection producer; OG Worker consumer/runtime owner; active / maintenance.
- **Boundary:** `movie:{id}` objects with `title`, `release_date`, `genres`, and `poster_url`; opaque non-empty `meta:G`; v2 recovery checkpoint; movie/brand routes, stable brand fallback, and retired Today guards.
- **Normative candidates:** [current OG contract](../system/og-index-worker-contract.md) and [contract index](../system/contract-index.md); Worker README is authoritative only for Worker-local setup/deployment.
- **Evidence:** Chronicle producer tests plus pinned Worker [`src/kv.ts`](https://github.com/XYBuilds/themoviecosmos-og-worker/blob/b08d953b1ea2cf43e14db40cce7e0ad3f2092e9d/src/kv.ts), [`src/index.ts`](https://github.com/XYBuilds/themoviecosmos-og-worker/blob/b08d953b1ea2cf43e14db40cce7e0ad3f2092e9d/src/index.ts), [route tests](https://github.com/XYBuilds/themoviecosmos-og-worker/blob/b08d953b1ea2cf43e14db40cce7e0ad3f2092e9d/test/index.spec.ts), and [Wrangler routes](https://github.com/XYBuilds/themoviecosmos-og-worker/blob/b08d953b1ea2cf43e14db40cce7e0ad3f2092e9d/wrangler.toml).
- **Change surface:** key/field/generation/version/fallback semantics, checkpoint version, route/cache behavior, and coordinated best-effort cutover/rollback.
- **Marker:** —.

### C-003 · Planet Export CLI

- **Owner/status:** Chronicle producer; Daily consumer; active / maintenance.
- **Boundary:** TMDB ID, output, resolution, padding, Bloom, size-root, render mode, and data-source arguments; exit codes; final stdout JSON; transparent RGBA PNG; sidecar `.render.json`; environment/repository discovery.
- **Normative candidates:** [contract index](../system/contract-index.md), `tools/planet-exporter/src/args.ts`, `cli.ts`, `browser.ts`, `png.ts`, and a future dedicated current-contract document. Phase 36 remains evidence, not current authority.
- **Evidence:** CLI and browser tests; atomic write and PNG validation; pinned Daily [`planet_renderer.py`](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/blob/63a819fdb984a89599a38698d65f9889be6a420a/scripts/lib/planet_renderer.py), [adapter tests](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/blob/63a819fdb984a89599a38698d65f9889be6a420a/tests/test_planet_renderer.py), and [cross-repository acceptance report](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/blob/63a819fdb984a89599a38698d65f9889be6a420a/docs/reports/Phase36.8-cross-repo-planet-export-acceptance-report.md).
- **Change surface:** every listed argument/default, exit code, stdout field, PNG rule, metadata/provenance field, and data-source discovery behavior.
- **Marker:** NR-08.

### C-004 · Galaxy assets and release manifest

- **Owner/status:** Chronicle; active.
- **Boundary:** validated `galaxy_data.json.gz`, optional search index, release URLs, data version, short-lived Pages manifest, and large objects in R2. Current runtime also consumes the profile pointer described in C-005.
- **Consumers:** Chronicle frontend and Planet Exporter directly; Daily indirectly when the CLI uses manifest/default data.
- **Normative candidates:** [contract index](../system/contract-index.md), frontend `galaxyAssetUrls.ts`, galaxy/search types and validators, Python export contract and R2 publisher.
- **Evidence:** live [production manifest](https://themoviecosmos.com/data/galaxy_assets_manifest.json); frontend loader/validator tests; the frozen live artifact contained `meta.version=2026.08.02.daily.131`, `meta.count=62006`, and 62,006 movie rows.
- **Change surface:** manifest/profile fields, release URL rules, galaxy/search schema, cache semantics, data version, and consumer fallback behavior.
- **Marker:** NR-01, NR-02, NR-05, NR-09.

### C-005 candidate · Active focus-emission profile

- **Owner/status:** Chronicle; active runtime boundary, not yet independently indexed.
- **Boundary:** manifest pointer plus immutable profile URL; required `profile_id`, period, model version `rating-midrank-cdf-lut-v1`, curve SHA-256, source version/count, active status, and activation time. Website and ordinary exporter fail closed in production when the active profile is absent or invalid; legacy fallback is explicitly development/test compatibility only.
- **Consumers:** Chronicle website focus renderer and Planet Exporter; render metadata carries resolved profile provenance.
- **Normative candidates:** `frontend/src/lib/galaxyAssetUrls.ts`, `focusEmissionProfileLoader.ts`, `scripts/cron/emission_profile_release.py`, `upload_galaxy_r2.py`, `planetVisualState`, and Phase 42 records until a canonical contract is accepted.
- **Evidence:** live manifest pointer, successful August monthly activation, runtime loader tests, producer release tests, and cross-entry parity tests.
- **Change surface:** profile schema/model, curve hashing, pointer/URL trust, activation ordering, fallback policy, visual hash/provenance, and website/exporter parity.
- **Marker:** NR-02, NR-03.

## Consumer-dependency inventory

| ID | Consumer dependency | Owning repository | Status | Chronicle surface consumed | Normative-source candidates | Strongest current evidence | Marker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DEP-01 | Website application | Chronicle | active | C-001, C-004, C-005 and canonical visual state | [Context vocabulary](../../CONTEXT.md), Tech Spec, C-001/C-004, and candidate C-005 | `App.tsx` gates route/scene startup on galaxy, search hydration, and verified profile; manifest/data/profile loaders fail closed on declared corruption | NR-01, NR-02 |
| DEP-02 | Planet Exporter | Chronicle | active / maintenance | C-004/C-005 plus shared focus visual state | C-003/C-004, candidate C-005, and the exporter argument/runtime sources listed under C-003 | Default source order is data file → data URL → manifest; metadata records data version, Chronicle commit, visual hash, PNG hash, profile, Chromium, and renderer | NR-08 |
| DEP-03 | OG Worker | OG Worker | external active dependency | C-001/C-002 and the Pages `/index.html` shell | C-001/C-002 and the [current OG contract](../system/og-index-worker-contract.md); Worker README for runtime-local setup only | Worker consumes only `meta:G` and `movie:{id}`, owns the `M` fingerprint and rendering/runtime, and fetches the production SPA shell for HTML meta | — |
| DEP-04 | Daily movie roster and deep links | Daily Stargazing | external active dependency | C-001 and the current galaxy membership/identity set | C-001 and pinned Daily [`CONTEXT.md`](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/blob/63a819fdb984a89599a38698d65f9889be6a420a/CONTEXT.md) | Daily's glossary says retrieval universe must equal the Chronicle roster or `/movie/{id}` links can die; current Daily docs still freeze the roster at 59,341 | NR-09 |
| DEP-05 | Daily publication planet asset | Daily Stargazing | external active dependency | C-003, and indirectly C-004/C-005 | C-003, candidate C-005, and the pinned Daily adapter interface and acceptance report linked under C-003 | Adapter requires `MOVIE_COSMOS_GALAXY_ROOT`, optionally forwards `MOVIE_COSMOS_GALAXY_DATA_FILE`, fixes 3000×3000/padding/size-root, validates stdout/PNG/metadata; accepted publication bundle prepares one Bloom-ON planet | NR-08 |
| DEP-06 | Social crawlers and shared-link recipients | External | external active dependency | C-001/C-002 public movie HTML and PNG routes | C-001/C-002 and the [current OG contract](../system/og-index-worker-contract.md) | Live brand/movie endpoints and Worker caching/fallback tests; `?lang=` is preserved in HTML URL but excluded from PNG identity | — |

Supporting producer-side dependencies that must remain visible in the re-baseline, but are not Chronicle consumers, are Supabase/PostgREST plus active threshold state, Kaggle daily input, the monthly embedding bundle, GitHub Actions runners/secrets, R2, Cloudflare KV, Cloudflare Pages, TMDB poster URLs, and browser WebGL/DecompressionStream support. Their credential values and production state are outside this inventory and outside the Wayfinder destination.

## Maintenance and retired boundaries

| ID | Boundary | Owner | Status | Evidence and required treatment |
| --- | --- | --- | --- | --- |
| RET-01 | The Movie Today capability, cover state, daily picker, `today.json`, manifest `today_url`, KV `today`, `/today`, `/og/today.png`, `/share/today` | Chronicle producer/product; Worker route guard | retired | [Current OG contract](../system/og-index-worker-contract.md), route/parser tests, Worker tests/config, and freeze-date `/today` `404`. Names are reserved; reuse requires a new Initiative and contract migration. See NR-05 for stale current-guide text. |
| RET-02 | GitHub Pages production/gray deployment | Chronicle | retired as production; manual smoke retained | Workflow header and dispatch-only trigger. Current Tech/Data docs still say push-to-main gray deployment; see NR-04. |
| RET-03 | Phase 39 legacy profile and Phase 41 diagnostic overrides/evidence modes | Chronicle | maintenance/historical compatibility only | Current code requires explicit compatibility/diagnostic markers and keeps them out of normal production paths. See NR-03. |
| RET-04 | `.cursor/plans/`, `docs/reports/`, and `scripts/_archive/` | Chronicle | archival evidence, not current capability authority | Repository guidance says Plans/Reports remain indexed history and are not migrated or renumbered. |

## Explicit needs-reconciliation queue

No item below is resolved by this research.

### NR-01 · Production release generations are split

- The live [Pages manifest](https://themoviecosmos.com/data/galaxy_assets_manifest.json) advertises `2026.08.02.daily.131`.
- The live [movie OG endpoint](https://themoviecosmos.com/og/movie/550.png) redirected to a `v=2026.08.09.daily.138-…` generation during the freeze check.
- [Nightly run 31333858544](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/actions/runs/31333858544) successfully completed refresh, OG sync, R2 publication, artifact upload, and Pages-asset preparation, then failed the frontend build with a missing Vite module; Pages deploy was skipped.
- Reconcile whether the accepted current model explicitly permits this degree/duration of manifest, R2, KV, and shell divergence, and which version represents the current galaxy roster for consumers.

### NR-02 · The active emission-profile boundary is missing from the canonical indexes and contradicted by current specs

- Current source and production manifest include `focus_emission_profile` and `focus_emission_profile_url`; production startup fails closed without a profile ([manifest parser](../../frontend/src/lib/galaxyAssetUrls.ts), [profile loader](../../frontend/src/lib/focusEmissionProfileLoader.ts), [application gate](../../frontend/src/App.tsx)).
- Tech Spec still says the manifest declares only galaxy/search assets and the current [contract index](../system/contract-index.md) does not give this boundary its own entry.
- Reconcile C-004 versus candidate C-005, profile ownership, canonical schema location, and release/rollback semantics.

### NR-03 · Visual SSOT still describes the retired Phase 39 production curve

- [Visual parameter table](../project_docs/%E8%A7%86%E8%A7%89%E5%8F%82%E6%95%B0%E6%80%BB%E8%A1%A8.md) calls the Phase 39 power curve and old fixed key current production values.
- Current `PLANET_VISUAL_DEFAULTS`, active LUT profile loading, emission tuning, Bloom values, and runtime/exporter parity tests describe a different Phase 42-era production path.
- Reconcile the canonical visual parameter source and clearly separate active profile behavior from P39/P41 historical evidence modes.

### NR-04 · GitHub Pages is simultaneously documented as active gray deployment and implemented as retired manual smoke

- Tech Spec and Data Pipeline say `deploy-pages.yml` deploys on pushes to `main` as a gray backup.
- The actual [workflow](../../.github/workflows/deploy-pages.yml) says production is Cloudflare Pages only, push-to-main no longer deploys, and only `workflow_dispatch` remains.
- Reconcile its status, supported fallback promise, and whether its same-origin data path remains a maintained contract.

### NR-05 · Current deployment/data documentation describes an older manifest and R2 key model

- Tech Spec says the manifest contains only galaxy/search assets.
- Data Pipeline still describes push-to-main GitHub Pages, `galaxy/{seq}/...` or fixed-key/query cache-busting in different sections, while the live manifest uses `galaxy/releases/{release-id}/...` plus an immutable focus-profile URL.
- Reconcile current object-key grammar, cache policy, manifest fields, fallback chain, and which operational guide owns them.

### NR-06 · Capability status hides a failing Pages stage

- The [capability map](../system/capability-map.md) labels nightly/monthly refresh and R2/Pages publication simply `active`.
- The latest nightly proves data/OG/R2 stages can succeed while the build/Pages stage fails; the production shell remains usable but stale relative to producer generations.
- Reconcile whether the capability map needs stage-level status/evidence and an explicit deployed-generation health check.

### NR-07 · Active search points to an archival Plan instead of a current normative contract

- The capability map names Phase 43 Plan and related specs as the source for title/person/genre/TMDB ID search.
- Repository guidance classifies `.cursor/plans/` as archival evidence.
- Reconcile the current normative home for search modes, degradation when the search index fails, selection semantics, and TMDB-ID-only behavior.

### NR-08 · Planet Export has a real consumer contract but no current dedicated normative source, and default data discovery may drift

- C-003 points primarily to Phase 36 Plan/Reports, while the executable contract now includes active profile provenance and richer visual metadata.
- Daily invokes a local Chronicle checkout through `MOVIE_COSMOS_GALAXY_ROOT`, supplies a data file only when `MOVIE_COSMOS_GALAXY_DATA_FILE` is set, and otherwise relies on Chronicle's default manifest discovery.
- The tracked manifest in this Chronicle snapshot is `2026.05.10.daily.30` and lacks an active profile, while the ordinary exporter path requires an active profile. This implies the default cross-repository invocation depends on a generated/current manifest or explicit override; verify and document the accepted setup instead of inferring it.

### NR-09 · Daily's frozen roster count disagrees with the deployed Chronicle roster

- Daily [`CONTEXT.md`](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/blob/63a819fdb984a89599a38698d65f9889be6a420a/CONTEXT.md#L62-L63) defines the Galaxy Roster as exactly 59,341 movies and requires its retrieval universe to equal Chronicle's deep-link identity set.
- The frozen production artifact referenced by the live manifest contained 62,006 movies; the active profile pointer also records `source_movie_count: 62006`.
- Reconcile whether Daily's index is stale, whether the count should be dynamic rather than normative, and what producer/consumer check proves roster/deep-link parity.

### NR-10 · A current custom-domain operations guide still contains active Today instructions

- The current P23.6 custom-domain checklist includes an “隔日更新” instruction for `og-today.png`, despite the current OG contract, Worker runtime, and production returning 404 for Today routes.
- Reconcile by classifying or updating that guide; do not treat its Today steps as an active rollback or setup path.

## Coverage rule for the SSOT re-baseline

The eventual old-to-new coverage map should contain every `CAP-*`, `OPS-*`, `C-*`, `DEP-*`, and `RET-*` item above. An item may be merged with another document section, but it should not disappear without an explicit `supersede`, `retire`, `archive`, or `delete` disposition and evidence that every consumer and operator entry point remains covered.

The reconciliation queue should graduate into separate decision tickets by contradiction class: stale documentation, implementation conformance defect, unresolved product choice, or genuine contract migration. This research deliberately does not perform that classification.

