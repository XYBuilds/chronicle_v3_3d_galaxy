# Refresh and publication

> Answers: how Chronicle currently refreshes galaxy data and publishes site/data artifacts—Daily and Monthly Data Releases, Site Release, OG projection, R2, and Cloudflare Pages
> Excludes: feature/UMAP math detail, frontend loader internals, Planet Export CLI flag encyclopedias, and historical combined nightly/monthly build+deploy coupling
> Update when: workflow schedule/steps, R2/manifest/cache semantics, OG sync ordering, emission-profile publish rules, or host/deploy boundaries change
> Required authorities: [`docs/system/og-index-worker-contract.md`](../system/og-index-worker-contract.md); [`docs/system/planet-export-contract.md`](../system/planet-export-contract.md)

## Current answer

Chronicle publishes through four operator entry points. GitHub is the selected publication control plane. Its Site, Daily, and Monthly adapters remain gated by `PUBLICATION_AUTHORITY=github`; automatic triggers additionally require their separate enablement variables. Returning source code alone does not activate production. See [GitHub cutback](../agents/github-cutback.md) for admission and current gaps. Data publication is separate from application-shell builds. There is no global generation barrier across Supabase, KV, R2, manifest, site artifact, and Pages.

| Entry point | Control plane | Trigger | Responsibility |
| --- | --- | --- | --- |
| Daily Data Release | GitHub `nightly_vote_refresh.yml` calling `scripts/publication/cli.py daily-release` | `18:00 UTC` after manual acceptance and `P1_DAILY_SCHEDULE_ENABLED=true`, plus manual replay from protected `main` | Publication hold; Supabase preflight; Light Refresh; validated export; daily OG projection diff; immutable R2 publication with the active emission profile reused (not generated); compose the candidate manifest onto the active site artifact; Pages promotion; smoke. |
| Monthly Data Release | GitHub `monthly_refit.yml` calling `scripts/publication/cli.py monthly-release` | manual protected-main run after `P2_MONTHLY_RELEASE_ENABLED=true`; `16:00 UTC` on day 1 after `P2_MONTHLY_SCHEDULE_ENABLED=true` | SHA-256-pinned four-file R2 embedding bundle; hold/preflight; real Galaxy Refit; one generated profile; OG projection; immutable R2/profile publication; active Site composition; Pages promotion; smoke and failure hold. |
| Site Release | GitHub `site_release.yml` calling `scripts/publication/cli.py site-release` | accepted merge to protected `main` after `P1_SITE_TRIGGER_ENABLED=true`, plus manual replay from protected `main` | Build and verify one immutable application-shell artifact without a production manifest; compose it with the current production Data Release; deploy/smoke; then mark the site artifact active. |
| Production Recovery | provider-neutral local planner `scripts/cron/production_recovery.py` plus repository-owned commands; hosted GitHub recovery job remains disabled | manual only | Hold/resume Daily and Monthly publication is the only direct recovery-control mutation. Data/Site/profile rollback, OG bootstrap/full recovery, and dangerous overrides remain reviewed plans applied through repository-owned commands. Site/Daily recovery uses whole-entry publication replay. Monthly also uses whole-entry replay after an explicitly cleared recovery hold; stage-level continuation is unsupported. |
| Supabase preflight | `scripts/cron/check_supabase_health.py` from Daily/Monthly and the shared entry point | automatic at Daily/Monthly start and independently runnable | Read-only configuration, connectivity, and unique-active-threshold readiness. |

Daily, Monthly, and Site share the GitHub `galaxy-r2-pages-release` concurrency group with cancellation of running work disabled. Production requires the XYBuilds owner repository and protected `main`; PR verification has no production secrets. `PUBLICATION_AUTHORITY=github` admits manual Site/Daily runs. Automatic push/schedule execution additionally requires `P1_SITE_TRIGGER_ENABLED=true` / `P1_DAILY_SCHEDULE_ENABLED=true`, set only after successful manual releases and R3 integration acceptance. GitLab's top-level workflow denies all pipelines. Monthly additionally requires `P2_MONTHLY_RELEASE_ENABLED=true`; its independent schedule flag stays false until a successful manual release. GitLab remains disabled.

The 2026-10-02 inventory found no publication sequence, Site Artifact registry, or publication-hold object in R2. Preserve the live deployment and establish reviewed recovery state before ordinary publication; do not bootstrap inside a normal release or claim a production cutover from passing CI.

A Chronicle-owned publication sequence in operational R2 replaces forge run numbers. Every Site or Data attempt, including replay and skipped scheduled backlog intents, receives a new sequence and a durable sanitized publication receipt. Daily Data Release identities use `YYYY.MM.DD.daily.<sequence>`. Site attempts receive a sequence and receipt but preserve the selected Data Release. `meta:G`, the manifest, Planet Export, and Daily consumers retain opaque-string compatibility. Failed Site or Daily work is recovered only by whole-entry publication replay under a new sequence; a replay cannot publish behind a newer success. Unsupported stage-level candidate continuation is not part of the supported recovery surface. Monthly also uses whole-entry replay after an explicitly cleared recovery hold; stage-level continuation is unsupported.

Scheduled Daily backlogs collapse to at most one current catch-up Light Refresh. Older scheduled intents already covered by that catch-up exit before production mutation.

Canonical compute distinctions:

- **Light Refresh** updates dynamic facts for current membership and collects pending movies. It does not change membership, coordinates, or the active visual profile.
- **Galaxy Refit** recalculates eligibility/membership/spatial arrangement, admits pending movies, and creates the candidate emission profile.
- Daily validates and reuses the active profile. Normal generation/activation remains Monthly-only. Bootstrap, force activation, rollback, and dimension bypass are audited recovery actions, not normal dispatch inputs.

Data/Site boundary:

- Daily and Monthly do not install Node dependencies or build the frontend.
- Site Release builds without a production manifest and preserves the selected compatible Data Release.
- A Data Release obtains the active verified site artifact, injects the candidate manifest, and deploys Pages. It is not published until the production manifest is readable and smoke passes.
- A missing or corrupt Site Artifact registry is a hard stop for ordinary P1 Site and Daily publication.
- An active-site-artifact/deployed-site mismatch fails closed so a later data promotion cannot silently downgrade the site.
- Independent success/failure is preserved for Supabase, OG KV, immutable R2/profile objects, site artifact, manifest composition, Pages promotion, and smoke.

OG and last-known-good:

- Daily keeps the OG projection diff. When there is no actual delta, it performs no `movie:*` mutation and does not advance `meta:G` or commit an identical checkpoint. Movie changes, deletions, and read-back verification precede `meta:G`; verified `meta:G` precedes the v2 checkpoint; OG synchronization completes before consumer-visible R2/Pages promotion.
- Daily and Monthly explicitly cap each OG sync at 900 puts. For a recovery day on which KV writes have already been consumed, set both GitHub variables `OG_INDEX_PUT_BUDGET_DATE` (UTC `YYYY-MM-DD`) and `OG_INDEX_PUT_BUDGET` (remaining integer `0..900`). The cap includes `meta:G`; zero permits only a no-op put plan. Invalid/incomplete pairs stop before database work. The entry captures the cap and records `inputs.og_max_puts`; it applies only on the named UTC date and otherwise reverts to 900, including after the next reset. This is a per-run safety cap, not a shared account usage meter: before every admitted replay, subtract all earlier account writes and update the allowance, or keep data publication held. Do not allow multiple runs to reuse the same remaining budget. No quota bypass, automatic multi-day continuation, or paid-plan upgrade is implied.
- A downstream failure does not undo completed mutations. Consumers remain on last-known-good until promotion and smoke pass. Site failure may redeploy the previous verified site artifact; Daily/Monthly downstream failure may redeploy the previous live Pages manifest. A Monthly failure after a production mutation also places Daily/Monthly publication on hold; rollback does not undo Supabase/KV or profile-pointer mutations.
- After Pages upload, production smoke allows the canonical domain to converge on the expected manifest: at most 25 reads with five seconds between valid but different versions. It still requires the exact expected version and all route/immutable-asset checks; unreadable manifests and HTTP failures stop immediately. Exhausting this bounded wait follows the existing failure/rollback path.

Publication shape:

- Cloudflare Pages hosts the application shell composed with the current production manifest via Direct Upload through the cross-platform Wrangler CLI.
- R2 hosts the large gzip galaxy/search objects (`galaxy_data.json.gz`, `galaxy_search_index.json.gz`) and retained site artifacts; operational sequence and receipt objects live under `ops/publication/`. Manifest pointers on Pages use short TTL while versioned gzip objects remain immutable.
- GitHub Site/Daily/Monthly workflows call the shared entry points and require explicit authority and trigger gates. Monthly additionally requires manual admission; hosted Recovery remains disabled. GitHub Pages is retired and must not be treated as a gray/manual-smoke path.
- Windows can run the same Site and Daily entry points as a human-started emergency path after proving all hosted publication is inactive. It is never a scheduler. P1 tests Windows with read-only inventory, fixture execution, and a Pages Preview that cannot change the production branch or active Site Artifact registry. Monthly production is not an emergency exception; hosted and Windows share the same non-production Monthly fixture.
- OG Index projection (C-002) writes `movie:{id}` and `meta:G`, with checkpoint evidence under `ops/og-index/state-v2.json.gz`. Sync runs before consumer-visible R2/site promotion.
- Planet Export production calls require an explicit `--manifest-url` (C-003/C-004). Active focus emission remains the monthly `rating-midrank-cdf-lut-v1` profile pointed by the live manifest.
- Bitwarden remains the secrets authority. GitHub production jobs receive only least-privilege deployment copies after admission. CI receives no Bitwarden session or vault-wide credential.

## Boundaries and invariants

- Describe the live Daily/Monthly/Site/Recovery entry points above. Do not document the retired combined nightly/monthly frontend-build path as current.
- Dangerous dimension-drift bypass, profile bootstrap/force, OG bootstrap/full recovery, and candidate continuation stay off the normal Daily/Monthly/Site dispatch inputs.
- Direct Cloudflare/Supabase operations and local CLI remain documented emergency fallbacks. The isolated read-only Supabase preflight stays independently runnable.
- Do not restore a Worker-specific Today binding, scheduled Today generation, `today_url`, or GitHub Pages deploy. Retired `/today` and `/share/today` follow ordinary invalid-path handling; `/og/today.png` is an unknown `/og/*` path.
- Do not recreate an active `today` KV key or Today product capability.
- `meta:G` is an ordered completion marker, not a transactional multi-key snapshot.
- Dimension drift on unknown genre/language fails closed unless an explicit emergency bypass is used.
- GitHub and GitLab must not be simultaneous normal publication schedulers.
- The maintainer explicitly authorized Monthly restoration under Issue #405 on 2026-10-02. Both its manual admission and schedule admission default to off; returning GitHub access alone does not enable either.

## Verification evidence

- GitHub Site/Daily adapters, disabled predecessor `.gitlab-ci.yml`, `scripts/publication/`, `scripts/tests/test_p1_publication_control.py`, `scripts/tests/test_p2_monthly_recovery.py`, `scripts/tests/test_release_primitives_contract.py`
- GitHub adapters (Site/Daily/Monthly gated; hosted Recovery disabled): `.github/workflows/nightly_vote_refresh.yml`, `.github/workflows/monthly_refit.yml`, `.github/workflows/site_release.yml`, `.github/workflows/production_recovery.yml`, `.github/workflows/supabase_preflight.yml`
- `scripts/cron/nightly_vote_refresh.py`, `monthly_refit.py`, `upload_galaxy_r2.py`, `sync_og_index_kv.py`
- `scripts/cron/release_state.py`, `site_artifact.py`, `pages_compose.py`, `publication_hold.py`, `site_artifact_store.py`, `production_smoke.py`, `retired_today_route_smoke.py`, `r2_retention.py`, `production_recovery.py` and their `scripts/tests/` suites
- [`docs/system/og-index-worker-contract.md`](../system/og-index-worker-contract.md) and producer/Worker contract tests
- [`docs/system/planet-export-contract.md`](../system/planet-export-contract.md) and planet-exporter tests
- Capability/publication rows in [`docs/system/capability-map.md`](../system/capability-map.md)

## Related topics

- [`galaxy-model.md`](./galaxy-model.md)
- [`../frontend/runtime.md`](../frontend/runtime.md)
- [`../product/supported-experience.md`](../product/supported-experience.md)

## Monthly input admission

`MONTHLY_EMBED_BUNDLE_OBJECT` must equal `ops/monthly-embedding/<SHA-256>.zip`, where the digest is the separately recorded `MONTHLY_EMBED_BUNDLE_SHA256`. The archive contains exactly cleaned.csv, text_embeddings.npy, genre_vectors.npy, and language_vectors.npy at its root. Hash, filenames, aligned rows, normalized vectors and active language width are checked before refit. The generated profile is selected from a sequence-specific directory with exactly one candidate; stale profiles cannot be selected implicitly. Fixed soft anchor limits preserve the prior hosted policy, and normal dispatch exposes no bypass controls.

The local v1:103 cache was migrated with the existing `migrate_language_palette_bundle.py` into a separate v3:105 bundle; source files were preserved. Its digest is `70827dfcd06c195ede9d187a86220c2cf638edc2dcc9ea4f3a43b78f27fdc870`. This is input preparation, not proof of a completed Monthly production run.
