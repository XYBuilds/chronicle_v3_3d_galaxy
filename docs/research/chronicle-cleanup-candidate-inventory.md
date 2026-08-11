# Chronicle cleanup candidate inventory

Research answer for [#375](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/issues/375). This document inventories candidates; it does not authorize deletion and makes no code, workflow, or deployment change.

## Scope and method

The audit used first-party source at these immutable revisions:

- Chronicle: [`4ed45a5`](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/tree/4ed45a5db75f1c108fec28359358683ba16c542e)
- OG Worker: [`b08d953`](https://github.com/XYBuilds/themoviecosmos-og-worker/tree/b08d953b1ea2cf43e14db40cce7e0ad3f2092e9d)
- Daily Stargazing: [`a6dde0b`](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/tree/a6dde0b0bfa893f2f2fe3d6ac2b90f67b8c2245a)

Tracked-file counts and byte totals come from `git ls-tree -rl HEAD`; exact duplicates come from identical Git blob IDs; references come from `git grep` over tracked source plus direct inspection of workflow, package, test, and contract files. Static non-reference is evidence of no tracked textual consumer, not proof that a human never runs a file.

Per repository policy, the 44 files under `.cursor/plans/` and 270 files under `docs/reports/` are formal archives and are not deletion candidates. They were read only to establish whether a candidate still carries historical evidence or a live reference obligation. This follows [AGENTS.md](../../AGENTS.md) and the [domain documentation rules](../agents/domain.md).

Classification used below:

| Class | Meaning |
| --- | --- |
| **active** | Called by a current runtime, build, scheduled workflow, operator path, or maintained developer surface. |
| **contract-bearing** | Removing or changing it can break an observable Chronicle, OG Worker, or Daily interface. |
| **regenerable evidence** | Generated output with a known producer; useful as evidence but not runtime input. |
| **historical reference** | Helps explain a past decision but does not define current behavior. |
| **exact duplicate** | Same Git blob is tracked at another path. |
| **unreferenced** | No tracked non-archival textual consumer was found; manual use still needs an owner decision. |
| **genuinely removable** | No remaining capability or evidence obligation after the stated gate is met. |

## Repository baseline

| Surface at audited commit | Files | Tracked bytes | Observation |
| --- | ---: | ---: | --- |
| Entire tree | 1,065 | 128,820,840 | Includes formal Plans and Reports. |
| Non-archival tree | 751 | 126,194,704 | The scope of this inventory. |
| `docs/temp/` | 7 | 51,563,301 | Three files account for 51,527,178 bytes and exactly duplicate current README assets. |
| `docs/assets/readme/` | 3 | 51,527,178 | Current copies; the root READMEs reference these paths. |
| Tracked `data/runs/phase41/` | 210 | 18,347,440 | Four generated run directories, despite the repository-wide `data/runs/` ignore rule. |
| `frontend/src/assets/{hero.png,react.svg,vite.svg}` plus `ScaffoldStatus*` | 5 | 58,425 | No production import; `ScaffoldStatus` is story-only. |

The `data/runs/phase41` set contains 24 duplicate-blob groups spanning 50 paths and 3,062,999 repeated checkout bytes. Git stores one object per identical blob, so deleting duplicate paths reduces the checked-out tree and navigation burden, not already-published Git history. The repository itself says `data/runs/` is ignored, locally disposable run output in [`.gitignore`](../../.gitignore) and [`data/README.md`](../../data/README.md).

## Surfaces that must be retained until an explicit replacement exists

| Surface | Classification and reason | Primary source |
| --- | --- | --- |
| Chronicle frontend, Cloudflare Pages build helpers, `_headers`, `_redirects`, and the tracked manifest | **Active.** `npm run build` stages the public directory, strips R2-backed large payloads, verifies SPA fallback and the Pages size limit. A filename containing “Pages” means Cloudflare Pages here, not retired GitHub Pages. | [`frontend/package.json`](../../frontend/package.json), [`build-production.mjs`](../../frontend/scripts/build-production.mjs), [`prepare-pages-deploy.mjs`](../../frontend/scripts/prepare-pages-deploy.mjs), [repository map](../system/repository-map.md) |
| `nightly_vote_refresh.yml`, `monthly_refit.yml`, and their `scripts/cron/` call graph | **Active and contract-bearing.** Both are scheduled and manually dispatchable; they update data, sync OG Index, publish R2 assets, build the site, and deploy Cloudflare Pages. Their future shape may be redesigned, but the update-and-publish capability cannot be deleted first. | [`nightly_vote_refresh.yml`](../../.github/workflows/nightly_vote_refresh.yml), [`monthly_refit.yml`](../../.github/workflows/monthly_refit.yml), [capability map](../system/capability-map.md) |
| OG Index producer (`sync_og_index_kv.py` and related state/snapshot tests) | **Cross-repository contract-bearing.** The OG Worker consumes `meta:G` and `movie:*`; producer/schema changes require consumer compatibility evidence. | [contract index](../system/contract-index.md), [OG Worker README at audited commit](https://github.com/XYBuilds/themoviecosmos-og-worker/blob/b08d953b1ea2cf43e14db40cce7e0ad3f2092e9d/README.md) |
| Planet Export core: root `planet:export`, `planet-export.html`, `frontend/src/planet-export/{main,request,sizing,renderPlanetImage,visualConfig}.ts`, and `tools/planet-exporter/src/{args,artifacts,browser,cli,data-source,png}.ts` | **Cross-repository contract-bearing.** The stable surface includes CLI arguments, exit codes, stdout JSON, PNG, and `.render.json` provenance. | [`package.json`](../../package.json), [Planet Export contract](../system/planet-export-contract.md) |
| Galaxy manifest and active emission-profile loaders/generators | **Contract-bearing.** Website and Planet Export must resolve the same active profile; Daily verifies the selected Chronicle release. Phase 39 power values are historical, but that does not make the active profile boundary removable. | [Planet Export contract](../system/planet-export-contract.md), [`galaxyAssetUrls.ts`](../../frontend/src/lib/galaxyAssetUrls.ts), [`focusEmissionProfileLoader.ts`](../../frontend/src/lib/focusEmissionProfileLoader.ts) |
| Active contract and behavior tests | **Active evidence.** This includes current CLI/sidecar tests, manifest/profile tests, cross-entry visual parity, nightly/monthly tests, OG projection tests, and SPA/build checks. Tests should disappear only with the behavior they protect, not as a way to make deletion pass. | [workflow verification rules](../../.cursor/rules/workflow-adapter.mdc), [`planet-export-contract.md`](../system/planet-export-contract.md) |
| Storybook core | **Active developer surface to keep and simplify.** Root/frontend scripts, `@storybook/react-vite`, Storybook, and a lean configuration are the intended HUD development and manual visual-acceptance tool. It is not currently a CI gate. | [`package.json`](../../package.json), [`frontend/package.json`](../../frontend/package.json), [Storybook config](../../frontend/.storybook/main.ts), [Tech Spec](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) |
| Current icon source and generated public icons | **Active, not redundant merely because bytes match.** `frontend/icons/source/tmc-tp.svg` is the input to `icons:export`; `frontend/public/favicon.svg` is a deployed output. | [`export-icons.mjs`](../../frontend/scripts/export-icons.mjs), [`index.html`](../../frontend/index.html) |
| Butler WOFFs and their TTF sources | **Active/reproducible asset chain.** CSS consumes the WOFFs; the setup script regenerates them from the two tracked Butler TTFs. | [`index.css`](../../frontend/src/index.css), [`build_butler_webfonts.py`](../../scripts/setup/build_butler_webfonts.py) |

## Cleanup candidates and required deletion evidence

### A. Deterministic or low-risk candidates

| ID | Candidate | Current classification | Evidence required before deletion | Disposition |
| --- | --- | --- | --- | --- |
| A1 | `docs/temp/Title.svg`, `docs/temp/cosmos focus_resized.gif`, `docs/temp/focus_resized.gif` | **Exact duplicates** of `docs/assets/readme/title.svg`, `browse-to-focus.gif`, and `focus-demo.gif`; no consumer outside `docs/temp` was found. | Confirm the root READMEs use `docs/assets/readme/*`; delete only the temp paths; run the repository link check if one exists. | **Genuinely removable.** Removes 51,527,178 bytes from the checked-out HEAD tree without losing unique content. |
| A2 | `frontend/src/assets/hero.png`, `react.svg`, `vite.svg` | **Unreferenced starter assets.** No tracked source import or URL reference was found. | Repeat tracked reference search; run frontend test, lint, and build. | **Genuinely removable.** |
| A3 | `frontend/src/components/ScaffoldStatus.tsx` and `.stories.tsx` | **Historical scaffold**, referenced only by its own story and describing Phase 3.1 setup. | Remove both together; confirm the replacement Storybook catalog builds. | **Genuinely removable.** |
| A4 | `@storybook/addon-onboarding` and its config entry | **Configuration-only onboarding dependency.** It appears in `devDependencies`, lockfile, and `.storybook/main.ts`, but no project onboarding content exists. | Remove package and addon entry through npm so the lockfile is regenerated; run `npm run build-storybook`. | **Genuinely removable** once the Storybook cleanup branch performs the package update. |
| A5 | `assets/fonts/Inter.ttf` and, if no other Inter binary remains, `Inter-OFL.txt` plus Inter-specific README/NOTICE claims | **Unreferenced Chronicle binary.** The frontend declares no local Inter face; it uses the CSS family name as a system fallback. The old font README still names a retired `render_og_today.py`. | Confirm no build/tool opens the file; update licensing and README claims atomically; run frontend build and representative typography screenshots. Do not infer anything from the separate OG Worker font copy. | **Removable after documentation/license cleanup.** |
| A6 | Five standalone scripts in `scripts/_archive/` other than `filter_dynamic_baseline_vote_count.py` | **Unreferenced legacy scripts.** No tracked non-archival caller or documentation reference was found. | Repeat import/name search and run active cleaning/export tests. Git history and formal reports retain provenance. | **Genuinely removable** as one legacy-script batch. |

### B. Storybook and Leva

The current catalog has 11 story files: seven exercise current components (`Drawer`, `LoadFailurePage`, `Loading`, `MovieTooltip`, `Timeline`, `CloseButton`, `FullscreenButton`), while four are scaffold/dev labs (`ScaffoldStatus`, Galaxy lab, HDR proof, InstancedMesh benchmark). The runtime HUD mounted by [`App.tsx`](../../frontend/src/App.tsx) also contains important surfaces with no dedicated story: `SearchBar`, `FocusExitButton`, `FeedbackButton`, `InfoButton`/`InfoModal`, `LanguageSwitch`, `SupportButton`, `TmdbAttribution`, and `HoverRing`.

| ID | Candidate | Current classification | Evidence required before deletion or replacement | Disposition |
| --- | --- | --- | --- | --- |
| B1 | `leva` and `GalaxyThreeLayerLabLevaHost.tsx` | **Single-purpose dev dependency.** The only real import is the Leva host, loaded only when `import.meta.env.DEV`; static Storybook uses args. | Rebuild only the controls needed by the accepted visual questions; do not preserve Leva's parameter list as a contract. Prove `npm run build-storybook`, frontend build, and the retained Galaxy acceptance scenarios. | **Retire Leva.** |
| B2 | Existing current-component stories | **Mixed but valuable.** They use production components and realistic fixtures, but coverage and naming are inconsistent. | For each story, map it to an accepted HUD state/responsive/locale/accessibility scenario. Keep it if it answers one; replace or delete it otherwise. Run Storybook build and human visual review. | **Curate, not blanket-delete.** |
| B3 | Missing HUD stories | **Coverage gap**, not deletion work. | Add a minimal catalog for search states, focus exit, top-tool group/dialogs, language/RTL, attribution, and responsive boundaries. Prefer composed HUD states where isolated button stories add little value. | **Add as part of Storybook simplification.** |
| B4 | `GalaxyThreeLayerLab*` except the Leva host | **Current-production-scene harness with historical controls.** It mounts the real scene, so it can support manual visual acceptance, but its existing parameter surface is not authoritative. | Decide the few representative galaxy/focus scenarios required for visual acceptance; regenerate args/controls from those needs; verify screenshots against production. | **Rebuild or reduce.** Do not inherit Leva controls by default. |
| B5 | `InstancedMeshBench*` | **Historical manual performance gate**, referenced by the Phase 8 benchmark document and not by production or CI. | Either record that the old gate is historical and remove it, or move a currently required performance check to a purpose-built benchmark outside the HUD catalog. Capture a current representative performance baseline before removal if performance protection still matters. | **Conditional removal.** It does not belong in the lean HUD catalog by default. |
| B6 | `HdrProofLab*` | **Active diagnostic, not merely an old story.** Current `scene.ts` still installs `window.__hdrCapabilities` and `window.__hdrProbe`, and current specs describe the lab. | First decide whether the HDR probe remains a supported diagnostic. If no, remove the story, runtime debug installation, tests, and current-doc claims together, then verify SDR production behavior. If yes, keep one clearly labelled diagnostic story outside the HUD catalog. | **Not independently removable.** |
| B7 | Storybook `addon-a11y`, `addon-docs`, `eslint-plugin-storybook`, core framework | **Active support dependencies.** A11y directly supports HUD review; docs/core/framework are configured. | Remove only if the accepted Storybook design explicitly drops the corresponding capability and the static build/lint still pass. | **Retain for the first lean catalog.** |

Storybook should be validated when UI, stories, or visual tooling change; no current workflow invokes `build-storybook`, so making it a universal PR gate would be a separate workflow decision. Sources: [`frontend/.storybook/main.ts`](../../frontend/.storybook/main.ts), [`frontend/.storybook/preview.ts`](../../frontend/.storybook/preview.ts), and [`frontend/package.json`](../../frontend/package.json).

### C. Generated visual evidence and diagnostic code

| ID | Candidate | Current classification | Evidence required before deletion | Disposition |
| --- | --- | --- | --- | --- |
| C1 | Four tracked directories under `data/runs/phase41/` | **Regenerable historical evidence.** They contain 103 PNG files and 107 JSON sidecar/manifest/validation files, totaling 18,347,440 bytes. Generator code and fixed directory constants remain. | Preserve the audited source commit, reproduction command, required fixture provenance, accepted values, and at least the representative/final visual evidence actually needed by reports. Resolve report references: Phase 41.4 names three directories and Phase 41.5.4 explicitly says the raw set was retained. A compact evidence index may point to the last commit containing raw files and record hashes. Confirm no test reads the files themselves. | **Removable or reducible only after evidence decoupling.** Do not delete solely because the directory is named `Phase`. |
| C2 | Phase 39 diagnostic graph: `frontend/p3910-*`, `frontend/p3911-*`, matching `frontend/src/planet-export/p39*`/`p391*`, `tools/planet-exporter/scripts/{render-p3910,generate-p39*}`, `tools/planet-exporter/src/p39*`, and `fixtures/phase39-contract-baseline.json` | **Historical/diagnostic code with internal tests and package scripts.** It is not the active CLI, but it forms a connected evidence generator rather than isolated dead files. | Remove as one dependency-closed batch. First migrate any still-current bloom-composition, renderer-applied-hash, or cross-entry invariant into tests of the active renderer/CLI. Preserve reproduction details in the Phase 39 reports. Run frontend tests/build and exporter test/typecheck/lint. | **Conditional batch removal.** |
| C3 | Phase 41 diagnostic/evidence graph: `phase41-diagnostics.html`, `phase41Diagnostic*`, `phase41Baseline*`, `p41*Evidence*`, `p41FixedShaping*`, `p416*`, `p417*`, and their generator scripts | **Historical diagnostics still reused by the one-time P42.6 gate.** The general diagnostic page is not the production exporter, but `generate-p426-production-gate.ts` still invokes it. | First replace P42.6's diagnostic comparison with current active-profile/CLI parity evidence or explicitly retire the completed gate. Preserve current tests for profile validation, site/exporter equality, sidecar provenance, and deterministic output. Then remove the closed graph and its package scripts together. | **Conditional batch removal.** |
| C4 | `scripts/cron/run_p426_production_gate.py` and `tools/planet-exporter/scripts/generate-p426-production-gate.ts` | **Completed production-gate harness**, not called by nightly/monthly. It generates local fake-R2 and visual evidence and depends on C3. | Confirm Phase 42.6 is historical, extract any ongoing release invariant into normal unit/contract tests, and retain its report plus reproduction provenance. | **Removable with C3 after invariant migration.** |
| C5 | Active fallback/profile symbols such as `productionFocusEmissionProfile.ts`, `focusEmission.ts`, `planetVisualState`, and the `P39_LEGACY_COMPATIBILITY_PROOF` consumed by the current exporter | **Active compatibility seam despite historical naming.** The active browser/exporter still imports some legacy-fixture semantics for explicit local/offline behavior. | A separate accepted contract change, current CLI tests, and Daily compatibility acceptance. | **Do not include in a filename-glob deletion.** |

The tracked Phase 41 directories are:

| Directory | Files | Bytes |
| --- | ---: | ---: |
| `p41.4-fixed-shaping-direction-v4-backlight-semantic-fixtures` | 33 | 2,688,411 |
| `p41.4-fixed-shaping-key-v5-backlight-lightness-066-semantic-fixtures` | 33 | 3,015,171 |
| `p41.4-fixed-shaping-lightness-v5-backlight-lightness-066-semantic-fixtures` | 43 | 3,802,297 |
| `p41.5-emission-curve-bloom-off` | 101 | 8,841,561 |

Sources: [`tools/planet-exporter/package.json`](../../tools/planet-exporter/package.json), [`p41EmissionEvidence.ts`](../../tools/planet-exporter/src/p41EmissionEvidence.ts), [`p41FixedShaping.ts`](../../tools/planet-exporter/src/p41FixedShaping.ts), [`phase41Diagnostic.ts`](../../tools/planet-exporter/src/phase41Diagnostic.ts), and the [Phase 41.4 report](../reports/Phase%2041.4%20Focus%20固定造型%20Gate%20实施报告.md).

### D. Scripts, manual workflows, and other developer tools

| ID | Candidate | Current classification | Evidence required before deletion | Disposition |
| --- | --- | --- | --- | --- |
| D1 | `scripts/_archive/filter_dynamic_baseline_vote_count.py` | **Runtime-unreferenced but documentation-bearing.** Active `cleaning.py` says its defaults align with this file and the Python rule sends readers to it. | Move the authoritative threshold explanation into active cleaning code/current pipeline docs and update the rule; run cleaning/export tests. | **Removable after reference migration**, unlike A6. |
| D2 | `.github/workflows/phase18_refit_benchmark.yml`, `phase18_core_refit_benchmark.py`, and `p18_pack_canonical_bundle_for_gha.py` | **Manual historical benchmark path.** The workflow is dispatch-only; the script is called by that workflow; a current guide mentions it only conditionally. | Preserve benchmark conclusions in the formal report, confirm monthly no longer depends on its five-file bundle/cache contract, remove/update the conditional guide reference, and validate workflow YAML for remaining workflows. | **Good batch candidate.** |
| D3 | `.github/workflows/supabase_preflight.yml` | **Manual diagnostic duplication.** It only runs `check_supabase_health.py`; both scheduled workflows already run that same check and its test is current. | Decide whether operators still need an isolated ten-minute check. If no, retain the script/test used by nightly/monthly and remove only the manual workflow; document the supported local/manual command. | **Conditional removal.** |
| D4 | `scripts/experiments/{phase18_canonical_full_rebuild,phase18_daily_delta_scan,phase18_pkl_anatomy}.py`, `scripts/analysis/evaluate_full_cast_impact.py`, `scripts/feature_engineering/embedding_model_eval.py` | **Unreferenced manual experiments/analysis** outside their own help text; each encodes a past investigation. Static non-reference does not prove lack of human value. | For each file, name an owner/current runbook or mark its conclusion historical. Before deletion, ensure no unique production constant or recovery path exists only there and that the relevant report contains the result. | **Owner-decision candidates**, preferably grouped by historical Phase. |
| D5 | `scripts/verify_galaxy_3d.html` | **Standalone local verifier**, self-documented but not linked by tracked non-archival files. | Decide whether it covers a failure not covered by the app/Storybook. If no, run current frontend load/build smoke and remove. | **Conditional removal.** |
| D6 | `scripts/env/` WSL/GPU/resume/sync helpers | **Manual operator tools.** Lack of source imports is expected; several encode machine and cross-filesystem recovery procedures. | Require an explicit owner/runbook audit, not static reachability. Preserve any still-needed full-rebuild/recovery command before deleting. | **Not proven removable by this research.** |
| D7 | `finish_todo.sh` | **Active delivery tool.** The workflow adapter explicitly calls it for accepted delivery. | A replacement delivery adapter and workflow decision. | **Retain.** |

### E. `docs/temp/` unique files

| Candidate | Classification | Required evidence / disposition |
| --- | --- | --- |
| `HDR 双栈路线与 Phase 29-33 讨论纪要.md` | **Historical reference with current inbound links** from the Phase 29 spec and report. | Do not delete until current HDR documentation no longer relies on it or a stable historical index replaces the link. |
| `Interactive Art README Template.md` | **Historical template**, linked only from an archived Plan. | Small and harmless; removable only if broken links from formal archives are accepted or the template is moved to an indexed historical location without rewriting the Plan. |
| `电影宇宙「每日星轨观测」系统 PRD.md` | **Unreferenced cross-domain draft.** Daily owns the current product domain. | Compare once with Daily's current SSOT, preserve any unique Chronicle contract statement in `docs/system/`, then remove. Do not promote this copy to current authority. |
| `项目架构全景.md` | **Unreferenced overview draft.** | Compare with `docs/system/repository-map.md` and current Tech/Data Pipeline docs; preserve only unique current facts, then remove. |

## Cross-repository deletion constraints

### Daily Stargazing

Daily does not import Chronicle source modules, but it directly invokes the repository CLI. Its adapter requires `MOVIE_COSMOS_GALAXY_ROOT`, verifies the root `package.json` contains `planet:export`, expects the CLI's last JSON line, requires the exact `{output}.render.json` path, and verifies release/data/profile provenance. These are live constraints, not historical references: [Daily `planet_renderer.py` at the audited commit](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/blob/a6dde0b0bfa893f2f2fe3d6ac2b90f67b8c2245a/scripts/lib/planet_renderer.py#L48-L99), [render invocation and verification](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/blob/a6dde0b0bfa893f2f2fe3d6ac2b90f67b8c2245a/scripts/lib/planet_renderer.py#L247-L358), and [Galaxy roster loader](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/blob/a6dde0b0bfa893f2f2fe3d6ac2b90f67b8c2245a/scripts/lib/galaxy_roster.py#L50-L65).

Therefore any deletion touching the root script, CLI args/stdout, manifest input, PNG name/dimensions, sidecar name/fields, or active profile needs Chronicle producer tests plus Daily's `tests/test_planet_renderer.py`, roster tests, and a cross-repository smoke. Storybook, Leva, Phase evidence, and `docs/temp` have no Daily consumer found.

### OG Worker and retired Today paths

The OG Worker links Chronicle's current contract and consumes the movie-only KV projection. The current audited Worker still binds `/today`, `/og/today.png`, and `/share/today` as special side-effect-free 404 routes ahead of the Pages fallback: [OG Worker README](https://github.com/XYBuilds/themoviecosmos-og-worker/blob/b08d953b1ea2cf43e14db40cce7e0ad3f2092e9d/README.md#L5-L20). Chronicle's [`CONTEXT.md`](../../CONTEXT.md), [contract index](../system/contract-index.md), and Phase 40 tests encode the same current rule.

The accepted product direction is to make those paths behave like ordinary invalid paths, so their special guard/tests are **planned removals**, but they are not unilateral Chronicle cleanup. Completion evidence must include an OG Worker implementation issue, Worker route/tests update, Chronicle contract/context/test update, and smoke comparison against an ordinary invalid path. Until that cross-repository change lands, Phase 40 fixtures/tests are contract-bearing.

## Recommended deletion batches

1. **Exact duplicates and starter residue:** A1-A4 and A2/A3 verification. No product behavior change.
2. **Lean Storybook:** establish the required HUD/visual catalog, retire Leva, then delete/replace stories that do not serve it. Human visual review is part of acceptance.
3. **Legacy scripts and manual workflow cleanup:** A6, D1-D5, each with its explicit owner/reference gate.
4. **Generated evidence reduction:** C1 only after a compact evidence index makes the reports reproducible without raw files in HEAD.
5. **Diagnostic-code retirement:** C2-C4 as dependency-closed batches after current invariants move to active renderer/CLI tests.
6. **Production/workflow/cross-repository seams last:** nightly/monthly redesign, Planet Export/profile changes, OG producer changes, and Today-route simplification require their own accepted implementation issues.

For any batch that can affect visible output, retain representative before/after screenshots and get human confirmation; for Planet Export also compare sidecar provenance and current active-profile visual hash, not pixels alone. The repository delivery adapter defines the normal frontend/Python verification commands in [`.cursor/rules/workflow-adapter.mdc`](../../.cursor/rules/workflow-adapter.mdc).

## Bottom line

The first cleanup can remove exact duplicates, unused starter residue, Storybook onboarding, and the scaffold story with very little risk. The largest unique tracked cleanup opportunity is the 18.35 MB Phase 41 evidence set, but it is not yet deletion-ready because current reports point at it. Storybook should remain and be rebuilt around the actual HUD/manual-visual catalog; Leva can retire without preserving its controls. Production publishing, OG projection, Planet Export, active-profile code, and their tests are contract-bearing and must survive until explicit replacements and cross-repository acceptance exist.
