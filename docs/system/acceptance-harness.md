# Chronicle acceptance harness

> Answers: Which human-declared risk tier, owner checks, Chromium journeys, evidence metadata, contact-sheet composition, performance trigger, and failure rules prove protected Chronicle outcomes for simplification slices?
> Excludes: Path-based risk classifiers, perpetual evidence ledgers, production deployment owned solely by this harness, Daily/OG Worker runtime ownership.
> Update when: The R0–R3 matrix, journey list, viewports, owner-check composition, or failure policy changes.
> Required authorities: GitHub Issues #371 and #381; this document; `tools/acceptance-harness/`.

## Current answer

Chronicle simplification uses a cumulative **R0–R3** acceptance matrix. Humans declare the tier and protected surfaces on each delivery Issue/PR. Automation runs and captures the declared checks. Maintainers retain visual Go/No-Go and production authority. File type alone does not determine risk.

### Risk declaration

Use the GitHub Issue/PR templates, or a machine-readable declaration:

```json
{
  "schema": "chronicle-risk-declaration-v1",
  "tier": "R1",
  "surfaces": ["visual_output", "browser_journey"],
  "notes": "optional"
}
```

Protected surfaces: `visual_output`, `browser_journey`, `publication`, `planet_export`, `og_worker`, `daily`.

Example fixture: `tools/acceptance-harness/fixtures/risk-declaration.example.json`.

### Command path

```bash
# List applicable owner checks for a declaration (no execution)
npm run test:owner-checks -w acceptance-harness -- --declaration tools/acceptance-harness/fixtures/risk-declaration.example.json --dry-run

# Run Chronicle-local checks only (skips Daily/OG/R3 handoffs)
npm run test:owner-checks -w acceptance-harness -- --declaration path/to/declaration.json --local-only

# Fixed Chromium Chronicle app journeys (not Planet Export)
npm run test:journeys -w acceptance-harness

# Evidence metadata + labelled contact sheet (composes Planet Export contact-sheet)
npm run contact-sheet -w acceptance-harness -- --input path/to/cells.json --output-dir artifacts/contact-sheet

# App / Storybook captures and a11y
npm run capture:app-baseline -w acceptance-harness
npm run capture:storybook -w acceptance-harness
npm run test:storybook-a11y -w acceptance-harness

# Performance protocol trigger only (does not invent a new CI GPU gate)
npm run performance:protocol -w acceptance-harness
```

### App journeys

Fixed Chromium Playwright suite under `tools/acceptance-harness/journeys/`. It is distinct from Planet Export Chromium integration.

Covered today: home idle; shareable `/movie/:id` focus + FocusExit; Back/Forward across home/movie; invalid path/id; title/ID search focus replacement; person select + layered ESC; genre multi-select/clear; data Retry; search-index failure with scene retained; EN/AR RTL + light/dark + Timeline orientation.

Canvas **hover → pick → focus** remains environment-sensitive under WebGL; until a stable picking harness exists, deep-link and search focus cover the focus/Drawer/FocusExit/history contract. Visual Gate bloom panels remain Storybook/#383 follow-on composition.

Pinned browser tooling: Playwright **1.52.0** Chromium (same pin as Planet Export). App journeys remain a separate suite from `npm run test:integration -w planet-exporter`.

### Viewports

| Id | Size | DPR | Surface |
| --- | --- | --- | --- |
| `app-desktop` / `visual-gate` | 1920×1080 | 1 | Main app / Visual Gate |
| `hud-mobile` | 390×844 | 1 | HUD Storybook (layout, not mobile WebGL support) |
| `hud-desktop` | 1280×800 | 1 | HUD Storybook |

Firefox or real macOS Safari only when the declared surface requires them.

### Equivalence and human review

- Contracts, schemas, CLI exit/stdout, routes/status/headers/cache, manifest/profile/provenance/hashes: **strict equivalence**.
- HUD/WebGL visuals: **semantic/perceptual** review under fixed inputs. Screenshot diffs are triage signals.
- Automation places required or changed panels in one labelled contact sheet. The maintainer records one overall Go/No-Go and identifies rejected/excluded panels only when needed.

### Failure rules

Encoded in `tools/acceptance-harness/src/failurePolicy.ts`:

1. No new failure is accepted.
2. A pre-existing failure is admissible only when the identical command/signature reproduces on the clean merge-base and the slice does not touch that surface.
3. Record both SHAs, command, environment, and signature.
4. Never update a baseline or threshold merely to turn a regression green.

### Performance trigger

Only renderer, data-volume, picking, animation, or build-performance-sensitive changes run the protocol. Collect 60K-data idle, Timeline-motion, and focus segments at 1920×1080 DPR 1. A >10% median or p95 frame-time regression blocks; the historical 35 FPS floor remains protected. When CI lacks a stable GPU, capture the protocol artifact; the fixed acceptance machine decides.

### Daily and OG Worker handoff

Chronicle documents the expected consumer commands; those repositories own execution and smoke evidence.

- **Daily:** planet-render adapter, roster, receipt, publication-asset and publication-bundle tests; live-manifest consumer smoke for R3.
- **OG Worker:** `npm test`, `npm run typecheck`, `npm run dry-run`, and that repository’s deployment smoke.

### R3 production smoke

An authorized R3 delivery is incomplete until post-deploy smoke covers Chronicle home, a valid movie deep link, an invalid path, manifest → immutable R2 data/profile resolution, Planet Export → Daily compatibility, and the relevant OG Worker surface. Rollback targets remain repository-owned.

## Boundaries and invariants

- No path classifier that guesses risk from changed files.
- No universal evidence ledger or perpetual freshness calendar.
- No production deployment performed solely by this harness for R0–R2 cleanup proof.
- Planet Export Chromium integration is not a substitute for Chronicle app journeys.

## Verification evidence

- Unit: `npm test -w acceptance-harness`
- Journeys: `npm run test:journeys -w acceptance-harness`
- Decision source: https://github.com/XYBuilds/chronicle_v3_3d_galaxy/issues/371
- Implementation Issue: https://github.com/XYBuilds/chronicle_v3_3d_galaxy/issues/381
