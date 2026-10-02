# Refresh and publication

> Answers: how Chronicle currently refreshes galaxy data and publishes site/data artifacts—Daily and Monthly Data Releases, Site Release, OG projection, R2, and Cloudflare Pages
> Excludes: feature/UMAP math detail, frontend loader internals, Planet Export CLI flag encyclopedias, and historical combined nightly/monthly build+deploy coupling
> Update when: workflow schedule/steps, R2/manifest/cache semantics, OG sync ordering, emission-profile publish rules, or host/deploy boundaries change
> Required authorities: [`docs/system/og-index-worker-contract.md`](../system/og-index-worker-contract.md); [`docs/system/planet-export-contract.md`](../system/planet-export-contract.md)

## Current answer

Chronicle publishes through four operator entry points. GitHub is the selected publication control plane. Its Site and Daily adapters remain gated by `PUBLICATION_AUTHORITY=github`; automatic triggers additionally require their separate enablement variables. Returning source code alone does not activate production. See [GitHub cutback](../agents/github-cutback.md) for admission and current gaps. Data publication is separate from application-shell builds. There is no global generation barrier across Supabase, KV, R2, manifest, site artifact, and Pages.

| Entry point | Control plane | Trigger | Responsibility |
| --- | --- | --- | --- |
| Daily Data Release | GitHub `nightly_vote_refresh.yml` calling `scripts/publication/cli.py daily-release` | `18:00 UTC` after manual acceptance and `P1_DAILY_SCHEDULE_ENABLED=true`, plus manual replay from protected `main` | Publication hold; Supabase preflight; Light Refresh; validated export; daily OG projection diff; immutable R2 publication with the active emission profile reused (not generated); compose the candidate manifest onto the active site artifact; Pages promotion; smoke. |
| Monthly Data Release | intact GitLab job `monthly_data_release` calling `scripts/publication/cli.py monthly-release`; production remains suspended | none; Monthly remains suspended | Supabase preflight; Galaxy Refit (thresholds, membership, coordinates, pending admission); emission-profile generation/activation; OG projection; immutable R2 publication; compose the candidate manifest onto the active site artifact; Pages promotion; smoke. GitLab production triggers and manual runs stay disabled. |
| Site Release | GitHub `site_release.yml` calling `scripts/publication/cli.py site-release` | accepted merge to protected `main` after `P1_SITE_TRIGGER_ENABLED=true`, plus manual replay from protected `main` | Build and verify one immutable application-shell artifact without a production manifest; compose it with the current production Data Release; deploy/smoke; then mark the site artifact active. |
| Production Recovery | provider-neutral local planner `scripts/cron/production_recovery.py` plus repository-owned commands; hosted GitHub recovery job remains disabled | manual only | Hold/resume Daily and Monthly publication is the only direct recovery-control mutation. Data/Site/profile rollback, OG bootstrap/full recovery, and dangerous overrides remain reviewed plans applied through repository-owned commands. Site/Daily recovery uses whole-entry publication replay. Monthly has no continuation while suspended. |
| Supabase preflight | `scripts/cron/check_supabase_health.py` from Daily/Monthly and the shared entry point | automatic at Daily/Monthly start and independently runnable | Read-only configuration, connectivity, and unique-active-threshold readiness. |

Daily and Site share the GitHub `galaxy-r2-pages-release` concurrency group with cancellation of running work disabled. Production requires the XYBuilds owner repository and protected `main`; PR verification has no production secrets. `PUBLICATION_AUTHORITY=github` admits manual Site/Daily runs. Automatic push/schedule execution additionally requires `P1_SITE_TRIGGER_ENABLED=true` / `P1_DAILY_SCHEDULE_ENABLED=true`, set only after successful manual releases and R3 integration acceptance. GitLab's top-level workflow denies all pipelines. Monthly remains disabled in both providers and in the shared entry point.

The 2026-10-02 inventory found no publication sequence, Site Artifact registry, or publication-hold object in R2. Preserve the live deployment and establish reviewed recovery state before ordinary publication; do not bootstrap inside a normal release or claim a production cutover from passing CI.

A Chronicle-owned publication sequence in operational R2 replaces forge run numbers. Every Site or Data attempt, including replay and skipped scheduled backlog intents, receives a new sequence and a durable sanitized publication receipt. Daily Data Release identities use `YYYY.MM.DD.daily.<sequence>`. Site attempts receive a sequence and receipt but preserve the selected Data Release. `meta:G`, the manifest, Planet Export, and Daily consumers retain opaque-string compatibility. Failed Site or Daily work is recovered only by whole-entry publication replay under a new sequence; a replay cannot publish behind a newer success. Unsupported stage-level candidate continuation is not part of the supported recovery surface. Monthly has no continuation while suspended.

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
- A downstream failure does not undo completed mutations. Consumers remain on last-known-good until promotion and smoke pass. Site failure may redeploy the previous verified site artifact; Daily downstream failure may redeploy the previous live Pages manifest.

Publication shape:

- Cloudflare Pages hosts the application shell composed with the current production manifest via Direct Upload through the cross-platform Wrangler CLI.
- R2 hosts the large gzip galaxy/search objects (`galaxy_data.json.gz`, `galaxy_search_index.json.gz`) and retained site artifacts; operational sequence and receipt objects live under `ops/publication/`. Manifest pointers on Pages use short TTL while versioned gzip objects remain immutable.
- GitHub Site/Daily workflows call the shared entry points and require explicit authority and trigger gates. Monthly and hosted Recovery remain disabled. GitHub Pages is retired and must not be treated as a gray/manual-smoke path.
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
- Monthly remains suspended until a separate post-cutback Wayfinder effort and an explicit human Go. Returning GitHub access does not re-enable Monthly.

## Verification evidence

- GitHub Site/Daily adapters, disabled predecessor `.gitlab-ci.yml`, `scripts/publication/`, `scripts/tests/test_p1_publication_control.py`, `scripts/tests/test_p2_monthly_recovery.py`, `scripts/tests/test_release_primitives_contract.py`
- GitHub adapters (Site/Daily gated; Monthly/Recovery disabled): `.github/workflows/nightly_vote_refresh.yml`, `.github/workflows/monthly_refit.yml`, `.github/workflows/site_release.yml`, `.github/workflows/production_recovery.yml`, `.github/workflows/supabase_preflight.yml`
- `scripts/cron/nightly_vote_refresh.py`, `monthly_refit.py`, `upload_galaxy_r2.py`, `sync_og_index_kv.py`
- `scripts/cron/release_state.py`, `site_artifact.py`, `pages_compose.py`, `publication_hold.py`, `site_artifact_store.py`, `production_smoke.py`, `retired_today_route_smoke.py`, `r2_retention.py`, `production_recovery.py` and their `scripts/tests/` suites
- [`docs/system/og-index-worker-contract.md`](../system/og-index-worker-contract.md) and producer/Worker contract tests
- [`docs/system/planet-export-contract.md`](../system/planet-export-contract.md) and planet-exporter tests
- Capability/publication rows in [`docs/system/capability-map.md`](../system/capability-map.md)

## Related topics

- [`galaxy-model.md`](./galaxy-model.md)
- [`../frontend/runtime.md`](../frontend/runtime.md)
- [`../product/supported-experience.md`](../product/supported-experience.md)
