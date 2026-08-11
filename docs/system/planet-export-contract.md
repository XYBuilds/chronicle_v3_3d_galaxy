# C-003 / C-004 · Planet Export and galaxy assets boundary

## Purpose

Single current description of Chronicle's Planet Export producer boundary and the galaxy assets / active emission-profile seam that Daily Stargazing consumes. Implementation and focused tests remain authoritative; this document only names the boundary.

## C-003 · Planet Export CLI

- **Producer:** `tools/planet-exporter/`
- **Consumer:** Daily Stargazing planet-render adapter
- **Command:** `npm run planet:export -- …`
- **Required release input (exactly one):**
  - `--manifest-url URL` — production path. Loads a live `galaxy_assets_manifest.json`, validates galaxy data URL, `data_version`, active `focus_emission_profile`, and controlled `focus_emission_profile_url`, then renders from that release.
  - `--data-file FILE` — explicit offline / local-test path only. Uses a local fixture profile adapter; it is **not** proof of production-profile parity.
- **No silent fallback** to the tracked `frontend/public/data/galaxy_assets_manifest.json`.
- **Outputs:** transparent PNG plus `.render.json` sidecar. Sidecar includes `data_version`, `manifest_url`, `profile_url`, `requested_focus_emission_profile`, and the renderer's `focus_emission_profile` provenance for Daily verification.
- **Evidence:** `tools/planet-exporter/src/args.test.ts`, `data-source.test.ts`, `cli.test.ts`, `browser.test.ts`, and related renderer tests.

## C-004 · Galaxy assets and active emission profile

- **Producer:** Chronicle data/export pipeline (`scripts/cron/upload_galaxy_r2.py` and nightly/monthly workflows)
- **Consumers:** Chronicle frontend via `frontend/src/lib/galaxyAssetUrls.ts`; Planet Export via `--manifest-url`
- **Manifest fields required for production Planet Export:**
  - `galaxy_data_gzip_url`
  - `data_version`
  - `focus_emission_profile` (status `active`, model `rating-midrank-cdf-lut-v1`)
  - `focus_emission_profile_url` (immutable URL ending in `/focus-emission-profiles/{profile_id}.json`)
- **Active profile:** monthly verified emission LUT pointed by the manifest. Website focus and Planet Export both resolve through the same active-profile boundary; Phase 39 `vote-average-power-clamped-v1` values are historical / diagnostic only.
- **Release semantics:** no global generation barrier. C-002 keeps coordinated best-effort cutover. Other consumers keep their last successfully published compatible artifact. Build/deploy failures are visible operational failures, not a reason to invent cross-system atomicity.

## Related indexes

- Capability: [`capability-map.md`](./capability-map.md)
- Contracts: [`contract-index.md`](./contract-index.md)
- Decisions: [`decision-index.md`](./decision-index.md)
