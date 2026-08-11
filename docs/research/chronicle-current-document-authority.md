# Chronicle current-document authority audit

Research answer for [Issue #376](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/issues/376), evaluated against repository commit `4ed45a5db75f1c108fec28359358683ba16c542e` and the accepted direction in [Wayfinder map #369](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/issues/369).

## Answer

Chronicle does not need another documentation registry or a rewrite of its archive. It needs one explicit status layer over the 52 current-facing surfaces in scope, followed by targeted correction of the active documents and rules that presently compete for authority.

The intended authority structure is already mostly visible:

- `docs/system/` owns product-level repository, capability, decision, and cross-repository contract indexes.
- Five `docs/project_docs/` files own current Chronicle product, frontend, visual, data, and exploration behavior.
- `AGENTS.md` owns repository-level agent governance; `.cursor/rules/workflow-adapter.mdc` owns the legacy Plan/TODO delivery adapter.
- Source, tests, manifests, and workflows remain implementation evidence. Quick references and runbooks must not redefine their contracts.
- Plans, Reports, and accepted ADRs remain archival evidence. This audit found 44 tracked Plans, 270 tracked Reports, and one accepted ADR; none is a rewrite target under this ticket. This boundary is already explicit in [AGENTS.md](../../AGENTS.md) and the [domain documentation rule](../agents/domain.md).

The primary authority defects are concrete: active Cursor rules still describe Vercel, a `THREE.Points` main path, an always-axis-parallel camera, same-origin gzip loading, and an archived threshold implementation; three Phase 18 runbooks describe obsolete or internally contradictory Pages deployment states; the decision index promotes two self-declared non-SSOT quick references back into SSOT status; and an obsolete Cursor workflow guide points to a rule that no longer exists. The accepted Wayfinder direction also supersedes the current special-404 contract for retired Today paths, but that is a deliberate product/contract change rather than evidence that the existing documents inaccurately describe the current implementation.

## Classification method

- **current** — normative source for a bounded current concern, or an instruction that is actively applied now. A current file can still contain a defect; that makes correction urgent rather than changing its present role.
- **reference** — useful current-facing explanation, translation, quick reference, or setup aid that must defer to a named current source or implementation evidence.
- **historical** — completed/retired decision, procedure, experiment, or evidence. Preserve or index it; do not execute it as current guidance.
- **unclassified** — no reliable status, an orphaned asset, or a document that mixes active and obsolete instructions too deeply to be a safe current reference.

`docs/workflows/` has no tracked files at the audited commit.

## Complete surface classification

### `docs/system/`

| Surface | Class | Bounded role / required pointer |
| --- | --- | --- |
| [`capability-map.md`](../system/capability-map.md) | current | Capability status and owner index. Keep it an index; implementation details point to the owning spec/source. |
| [`contract-index.md`](../system/contract-index.md) | current | Registry and change procedure for C-001 through C-004. Detailed behavior points to the per-contract document. |
| [`decision-index.md`](../system/decision-index.md) | current | Location index for current and historical decisions. It must stop labeling reference tables as SSOT and add the accepted lifecycle ADR/context seam. |
| [`og-index-worker-contract.md`](../system/og-index-worker-contract.md) | current | Single Chronicle-owned C-002 producer/consumer compatibility contract. Worker-local runtime and deploy details remain Worker-owned. |
| [`planet-export-contract.md`](../system/planet-export-contract.md) | current | Single C-003/C-004 boundary for Planet Export, manifest, render receipt, and active emission profile. |
| [`repository-map.md`](../system/repository-map.md) | current | Three-repository ownership and deployment-unit map. |

### `docs/project_docs/`

| Surface | Class | Bounded role / required pointer |
| --- | --- | --- |
| [`Phase 29 发布门槛与技术判定 spec.md`](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md) | historical | Explicitly identifies itself as a historical gate record. Keep it as evidence and reach it through the historical index; it must not remain a current Tech Spec dependency. |
| [`TMDB 数据特征工程与 3D 映射总表.md`](../project_docs/TMDB%20数据特征工程与%203D%20映射总表.md) | reference | Self-declared field/mapping quick reference. Data rules point to Data Pipeline; exact mappings point to source/schema. |
| [`TMDB 电影宇宙 Data Pipeline.md`](../project_docs/TMDB%20电影宇宙%20Data%20Pipeline.md) | current | Current data cleaning, feature, export, automation, R2, and Pages model until the Wayfinder selects a replacement refresh/publication shape. |
| [`TMDB 电影宇宙 Design Spec.md`](../project_docs/TMDB%20电影宇宙%20Design%20Spec.md) | current | Current user-visible visual, HUD, and interaction behavior. |
| [`TMDB 电影宇宙 PRD.md`](../project_docs/TMDB%20电影宇宙%20PRD.md) | current | Product goals, supported journey, and product-scope decisions. |
| [`TMDB 电影宇宙 Tech Spec.md`](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) | current | Current Chronicle frontend architecture, schemas, loading, routing, testing, and developer-tool policy. |
| [`星球状态机 spec.md`](../project_docs/星球状态机%20spec.md) | current | Current exploration lifecycle and render/interaction boundary; terminology and durable rationale point to `CONTEXT.md` and ADR 0001. |
| [`视觉参数总表.md`](../project_docs/视觉参数总表.md) | reference | Self-declared human quick reference, not agent or implementation SSOT. Exact static defaults point to source; active emission points to the manifest/profile contract. |

### README surfaces and `AGENTS.md`

| Surface | Class | Bounded role / required pointer |
| --- | --- | --- |
| [`AGENTS.md`](../../AGENTS.md) | current | Repository agent governance, product-control boundary, archive policy, and pointer to the authoritative delivery adapter. |
| [`README.md`](../../README.md) | reference | Canonical Chinese public/onboarding entry. Product and implementation claims point into current project/system docs. |
| [`README.en.md`](../../README.en.md) | reference | English translation/mirror of `README.md`, not a second architectural authority. |
| [`frontend/README.md`](../../frontend/README.md) | reference | Thin frontend entry that correctly redirects readers to the root READMEs. |
| [`data/README.md`](../../data/README.md) | reference | Local data-layout and command aid. Current pipeline semantics and parameter values point to Data Pipeline and the invoked scripts. |
| [`assets/fonts/README.md`](../../assets/fonts/README.md) | unclassified | Mixes valid licensing/provenance with deleted Today-renderer usage. Re-establish as a font inventory/license reference or retire redundant prose. |
| [`frontend/public/fonts/butler/README.md`](../../frontend/public/fonts/butler/README.md) | reference | Generated webfont inventory and regeneration pointer; license authority points to the upstream notice/license sources. |

### `docs/guides/`

| Surface | Class | Bounded role / required pointer |
| --- | --- | --- |
| [`Cursor Agent TODO 工作流指南.md`](../guides/Cursor%20Agent%20TODO%20工作流指南.md) | unclassified | Claims a missing `.cursor/rules/agent-todo-workflow.mdc` as its source. Current delivery points to `AGENTS.md` and `workflow-adapter.mdc`. |
| [`GitHub Pages 上线教程（Phase 7 I6）.md`](../guides/GitHub%20Pages%20上线教程（Phase%207%20I6）.md) | historical | Explicit tombstone for the retired GitHub Pages surface. |
| [`P18.4 每日投票刷新与导出入口指南.md`](../guides/P18.4%20每日投票刷新与导出入口指南.md) | unclassified | Mixes an active nightly runbook with contradictory pre-Pages deployment claims. Current behavior points to Data Pipeline and the workflow/source. |
| [`P18.5 月度星系 refit 操作指南.md`](../guides/P18.5%20月度星系%20refit%20操作指南.md) | unclassified | Mixes an active monthly runbook with deprecated `pages-action` and contradictory commented/enabled deployment claims. |
| [`P18.6 Cloudflare Pages 切换操作指南.md`](../guides/P18.6%20Cloudflare%20Pages%20切换操作指南.md) | unclassified | Correct host boundary mixed with obsolete `pages-action`, obsolete same-origin loading, and a superseded migration narrative. |
| [`P18.6b Cloudflare R2 上线操作手册.md`](../guides/P18.6b%20Cloudflare%20R2%20上线操作手册.md) | unclassified | Contains a useful Phase 40 overlay but also stale fallback/rollback and future-suggestion sections. Current R2 semantics point to Data Pipeline, workflows, uploader source, and system contracts. |
| [`P20.5 Cloudflare Web Analytics 接入操作指南.md`](../guides/P20.5%20Cloudflare%20Web%20Analytics%20接入操作指南.md) | reference | Optional control-plane setup aid; build behavior is evidenced by `frontend/vite.config.ts` and the workflows. |
| [`P23.1 The Movie Today 验收指南.md`](../guides/P23.1%20The%20Movie%20Today%20验收指南.md) | historical | Explicit non-executable Today evidence. |
| [`P23.5 OG image 验收指南.md`](../guides/P23.5%20OG%20image%20验收指南.md) | historical | Explicit non-executable Today OG evidence. |
| [`P23.6 自定义域名上线后运维清单.md`](../guides/P23.6%20自定义域名上线后运维清单.md) | historical | Explicitly classified as historical because its runbook is entangled with retired Today behavior. |
| [`P34.3 OG Index KV 上线操作指南.md`](../guides/P34.3%20OG%20Index%20KV%20上线操作指南.md) | current | Chronicle producer operational entry for C-002; compatibility rules continue to point to the system contract. |
| [`P34.4 OG Worker PNG 部署说明.md`](../guides/P34.4%20OG%20Worker%20PNG%20部署说明.md) | historical | Explicit non-executable Phase 34 deployment evidence; current Worker operations belong in the Worker repository. |
| [`P34.5 OG Worker HTML meta 部署说明.md`](../guides/P34.5%20OG%20Worker%20HTML%20meta%20部署说明.md) | historical | Explicit non-executable Phase 34 deployment evidence; current Worker operations belong in the Worker repository. |
| [`P34.7 TMDB 合规检查清单.md`](../guides/P34.7%20TMDB%20合规检查清单.md) | current | Local TMDB attribution/compliance checklist; upstream TMDB terms remain the external authority. |
| [`P34.9 测试与验收回滚指南.md`](../guides/P34.9%20测试与验收回滚指南.md) | historical | Explicit non-executable Phase 34 acceptance/rollback evidence. |
| [`Phase 6M7 后续数据处理流程.md`](../guides/Phase%206M7%20后续数据处理流程.md) | historical | Phase-bounded pre-production data procedure superseded by the current Data Pipeline and scripts. |
| [`Supabase 操作教程.md`](../guides/Supabase%20操作教程.md) | reference | Setup/initial-import aid. Current schema and operating semantics point to Data Pipeline and `scripts/supabase/`. |

### `.cursor/rules/`

These files are classified **current** because their frontmatter actively applies them globally or to matching files. Incorrect facts in an active rule are high-priority documentation defects.

| Surface | Class | Bounded role / required pointer |
| --- | --- | --- |
| [`ai-workflow.mdc`](../../.cursor/rules/ai-workflow.mdc) | current | Defensive/verifiable-generation instruction. It should contain stable practices, not mandate incidental logging patterns as product architecture. |
| [`branding-name-convention.mdc`](../../.cursor/rules/branding-name-convention.mdc) | current | Product-name casing by UI versus narrative context. |
| [`data-protection.mdc`](../../.cursor/rules/data-protection.mdc) | current | Raw-dataset safety and subsample routing. |
| [`frontend-threejs.mdc`](../../.cursor/rules/frontend-threejs.mdc) | current | Frontend/Three.js coding context, but its rendering, camera, and loading sections are materially stale and must point to Tech/State/source. |
| [`project-overview.mdc`](../../.cursor/rules/project-overview.mdc) | current | Always-applied project orientation, but its Vercel and architecture claims are stale; it should become a small pointer to system/project current sources. |
| [`python-pipeline.mdc`](../../.cursor/rules/python-pipeline.mdc) | current | Python coding context, but current thresholds/model/pipeline facts must point to Data Pipeline and active `scripts/pipeline`/`scripts/cron` source rather than archive code. |
| [`workflow-adapter.mdc`](../../.cursor/rules/workflow-adapter.mdc) | current | Authoritative legacy Plan/TODO branch, verification, acceptance, report, PR, and merge adapter when its named skills are active. |

### `docs/temp/`

| Surface | Class | Bounded role / required pointer |
| --- | --- | --- |
| [`HDR 双栈路线与 Phase 29-33 讨论纪要.md`](../temp/HDR%20双栈路线与%20Phase%2029-33%20讨论纪要.md) | historical | Temporary Phase 29/33 discussion record, now subordinate to the historical gate/report evidence. |
| [`Interactive Art README Template.md`](../temp/Interactive%20Art%20README%20Template.md) | reference | Generic authoring template, not Chronicle product documentation. |
| [`电影宇宙「每日星轨观测」系统 PRD.md`](../temp/电影宇宙「每日星轨观测」系统%20PRD.md) | unclassified | Unmarked Daily/editorial proposal in a Chronicle temp directory; current Daily domain belongs to the Daily repository. |
| [`项目架构全景.md`](../temp/项目架构全景.md) | unclassified | Current-looking architecture overview that still describes `today.json`, Today share, and a deleted renderer. It must not be an authority surface. |
| [`cosmos focus_resized.gif`](../temp/cosmos%20focus_resized.gif) | unclassified | Unreferenced 29.9 MB binary evidence/asset with no stated owner or regeneration path. |
| [`focus_resized.gif`](../temp/focus_resized.gif) | unclassified | Unreferenced 21.6 MB binary evidence/asset with no stated owner or regeneration path. |
| [`Title.svg`](../temp/Title.svg) | unclassified | Unreferenced duplicate/title asset with no stated owner; the root README uses `docs/assets/readme/title.svg` instead. |

## Contradictions and authority seams

| Seam | Primary evidence | Classification | Required resolution |
| --- | --- | --- | --- |
| **Retired Today paths** | Current docs define special side-effect-free 404s in the [OG contract](../system/og-index-worker-contract.md), [PRD](../project_docs/TMDB%20电影宇宙%20PRD.md), [Tech Spec](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md), and [README](../../README.md). Wayfinder [#369](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/issues/369) accepts removing special Worker treatment so these paths follow ordinary invalid-path behavior. | accepted product/contract change, not a current-doc factual defect | Implement through the Worker exception Issue, then update C-002 and every current route summary together. Historical guides remain historical and should not be rewritten as current runbooks. |
| **Production host** | [`project-overview.mdc`](../../.cursor/rules/project-overview.mdc) says static Vercel; the [repository map](../system/repository-map.md), [Data Pipeline](../project_docs/TMDB%20电影宇宙%20Data%20Pipeline.md), root [README](../../README.md), and both current [nightly](../../.github/workflows/nightly_vote_refresh.yml) and [monthly](../../.github/workflows/monthly_refit.yml) workflows show R2 + Cloudflare Pages. | documentation correction | Remove Vercel from the active rule. Data Pipeline owns the documented publication model; workflows own executable evidence. |
| **Pages deploy mechanism/state** | [P18.4](../guides/P18.4%20每日投票刷新与导出入口指南.md) says both that Pages deploy exists and that it is not connected. [P18.5](../guides/P18.5%20月度星系%20refit%20操作指南.md) says both built-in `pages-action` and commented deployment. [P18.6](../guides/P18.6%20Cloudflare%20Pages%20切换操作指南.md) freezes deprecated `cloudflare/pages-action@v1.5.0`; current workflows use `cloudflare/wrangler-action@v3` and `pages deploy`. | documentation correction | Mark the three guides historical or replace them with one small current operational reference after the future publication model is decided. Do not preserve `pages-action` prose. |
| **Three.js main path and camera** | [`frontend-threejs.mdc`](../../.cursor/rules/frontend-threejs.mdc) describes a `THREE.Points` main layer and an always-axis-parallel camera. Current source uses dual [`THREE.InstancedMesh`](../../frontend/src/three/galaxyMeshes.ts) and focus yaw/pitch orbit in [`camera.ts`](../../frontend/src/three/camera.ts); the [Tech Spec](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) and [state spec](../project_docs/星球状态机%20spec.md) describe that behavior. | documentation correction | Reduce the rule to stable coding constraints and pointers. Tech/State own behavior; source owns implementation detail. |
| **Galaxy asset loading** | [`frontend-threejs.mdc`](../../.cursor/rules/frontend-threejs.mdc) says startup reads same-origin `BASE_URL/data/galaxy_data.json.gz`; current [`galaxyAssetUrls.ts`](../../frontend/src/lib/galaxyAssetUrls.ts), [C-004](../system/planet-export-contract.md), and Data Pipeline use a manifest and controlled R2 URLs. | documentation correction | Replace the stale rule claim with the manifest boundary and point to C-004/source. |
| **Python threshold authority** | [`python-pipeline.mdc`](../../.cursor/rules/python-pipeline.mdc) points dynamic thresholds to `scripts/_archive/filter_dynamic_baseline_vote_count.py`; current calculation is in [`scripts/pipeline/cleaning.py`](../../scripts/pipeline/cleaning.py) and used by [`monthly_refit.py`](../../scripts/cron/monthly_refit.py). | documentation correction | Point the rule to Data Pipeline plus active source; archive code remains historical. |
| **Delivery workflow source** | [`Cursor Agent TODO 工作流指南.md`](../guides/Cursor%20Agent%20TODO%20工作流指南.md) names missing `.cursor/rules/agent-todo-workflow.mdc`; [AGENTS.md](../../AGENTS.md) explicitly names [`workflow-adapter.mdc`](../../.cursor/rules/workflow-adapter.mdc) as authoritative. | documentation correction | Retire or tombstone the guide; do not create a replacement parallel workflow document. |
| **Reference tables promoted to SSOT** | [`decision-index.md`](../system/decision-index.md) lists the feature-mapping and visual-parameter tables under “Current Chronicle SSOT”; the [mapping table](../project_docs/TMDB%20数据特征工程与%203D%20映射总表.md) says it is not pipeline SSOT, and the [visual table](../project_docs/视觉参数总表.md) says it is not agent/implementation SSOT. The root README's “implementation SSOT” index reinforces the ambiguity. | documentation correction | Classify both as `reference` in the decision index and route their concerns to Data Pipeline, Tech/Design/State, source defaults, and the active-profile contract. |
| **Lifecycle decision not indexed** | The [state spec](../project_docs/星球状态机%20spec.md) points terminology to [`CONTEXT.md`](../../CONTEXT.md) and durable rationale to accepted [ADR 0001](../adr/0001-focus-select-lifecycle.md), but the [decision index](../system/decision-index.md) omits both. | authority-index gap | Add pointers only. Preserve the accepted ADR unchanged. |
| **Historical Phase 29 still presented as current dependency** | The [Phase 29 spec](../project_docs/Phase%2029%20发布门槛与技术判定%20spec.md) explicitly says it is historical, while the [Tech Spec](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) still calls it the section's “条文 SSOT”. | documentation correction | Keep Phase 29 in the historical index; rewrite current Tech sections directly around supported SDR/routing behavior and source evidence. |
| **Storybook and Leva** | Wayfinder [#369](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/issues/369) makes HUD development and human visual acceptance Storybook's first responsibility and retires Leva. The [Tech Spec](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) already limits Storybook to non-3D HUD and asks each reusable HUD component for a story, but the repository contains 3D/HDR/benchmark stories and a [`GalaxyThreeLayerLabLevaHost`](../../frontend/src/storybook/GalaxyThreeLayerLabLevaHost.tsx), while many HUD components have no story. | accepted tooling direction plus implementation conformance | Keep the policy in Tech Spec §9.3, clarify the accepted purpose and Leva retirement there, then curate stories/dependencies in a later implementation Issue. New args/controls are designed from current HUD acceptance needs, not migrated from Leva. |
| **Font inventory cites deleted runtime** | [`assets/fonts/README.md`](../../assets/fonts/README.md) says Inter and Butler are used by deleted `scripts/cron/render_og_today.py`; the surviving Butler path is the webfont build script and [`frontend/src/index.css`](../../frontend/src/index.css). | documentation correction | Keep licensing/provenance, replace deleted-use claims with current consumers, and decide whether the unused Inter TTF remains necessary in the cleanup inventory. |
| **Temp architecture is a shadow spec** | [`docs/temp/项目架构全景.md`](../temp/项目架构全景.md) claims current-looking coverage while still loading `today.json`, mounting a Today flow, and naming deleted `render_og_today.py`; no current document points to it. | unclassified shadow authority | Do not merge its prose into current specs wholesale. Preserve only unique useful facts after checking them against current owners, then classify or remove the temp surface in an implementation Issue. |

## Single current source per bounded concern

This is the minimal destination model. “Implementation evidence” is deliberately not another documentation authority.

| Concern | Single current documentation source | Implementation / historical evidence |
| --- | --- | --- |
| Repository ownership and deployment units | [`docs/system/repository-map.md`](../system/repository-map.md) | Repository source and deployment configuration |
| Capability status and owner | [`docs/system/capability-map.md`](../system/capability-map.md) | Source/tests/production observation |
| Contract registry and change procedure | [`docs/system/contract-index.md`](../system/contract-index.md) | Repository-local contract tests and consumer checks |
| OG Index / OG Worker compatibility | [`docs/system/og-index-worker-contract.md`](../system/og-index-worker-contract.md) | Chronicle producer source/tests; Worker source/tests/README |
| Planet Export, manifest, render receipt, active profile | [`docs/system/planet-export-contract.md`](../system/planet-export-contract.md) | `tools/planet-exporter`, manifest/profile loaders, focused tests, Daily adapter tests |
| Product goal, supported journey, scope | [`docs/project_docs/TMDB 电影宇宙 PRD.md`](../project_docs/TMDB%20电影宇宙%20PRD.md) | User acceptance and product Issues |
| Frontend architecture, schemas, loading, routing, test/tool policy | [`docs/project_docs/TMDB 电影宇宙 Tech Spec.md`](../project_docs/TMDB%20电影宇宙%20Tech%20Spec.md) | Frontend source/tests and package configuration |
| Visual and interaction intent | [`docs/project_docs/TMDB 电影宇宙 Design Spec.md`](../project_docs/TMDB%20电影宇宙%20Design%20Spec.md) | Storybook/HUD acceptance, application visual evidence, source/tests |
| Exploration terminology | [`CONTEXT.md`](../../CONTEXT.md) | Domain-modeling history |
| Durable focus/select lifecycle decision | [ADR 0001](../adr/0001-focus-select-lifecycle.md) | Immutable accepted ADR; supersede with a new ADR if changed |
| Current exploration lifecycle behavior | [`docs/project_docs/星球状态机 spec.md`](../project_docs/星球状态机%20spec.md) | Exploration module/store/route/scene tests |
| Data, refresh, export, and publication model | [`docs/project_docs/TMDB 电影宇宙 Data Pipeline.md`](../project_docs/TMDB%20电影宇宙%20Data%20Pipeline.md) | Active Python source, nightly/monthly workflows, manifests, validation tests |
| Exact static visual defaults | Source modules, especially [`planetVisualDefaults.ts`](../../frontend/src/three/planetVisualDefaults.ts) | Tests; `视觉参数总表.md` remains a human reference |
| Active rating-to-emission mapping | Manifest-selected profile under C-004 | Profile resource, loader/generator, validation tests |
| Agent/product-control governance | [`AGENTS.md`](../../AGENTS.md) | `docs/agents/*` supporting rules |
| Plan/TODO delivery execution | [`.cursor/rules/workflow-adapter.mdc`](../../.cursor/rules/workflow-adapter.mdc) | Plans and Reports as historical execution evidence |
| Public onboarding | [`README.md`](../../README.md) | `README.en.md` as translation mirror; root package/source for commands |
| TMDB attribution checklist | [`docs/guides/P34.7 TMDB 合规检查清单.md`](../guides/P34.7%20TMDB%20合规检查清单.md) | Upstream TMDB terms, `NOTICE`, UI/source checks |

## Recommended documentation slices

1. Correct active automatic context first: `project-overview.mdc`, `frontend-threejs.mdc`, and `python-pipeline.mdc`. These currently inject stale facts directly into implementation work.
2. Make `decision-index.md` the small human-readable classification/index surface already accepted by Wayfinder #369. Do not add JSON metadata or a universal ledger.
3. Rewrite the five current project documents to current-state prose only, keeping Phase history as links to Plans, Reports, the historical Phase 29 record, and ADRs.
4. Resolve the Phase 18 guide cluster only after the future refresh/publication model is decided. Until then, label the mixed guides unsafe as operational authority and protect the existing workflows/scripts they describe.
5. Update the Tech Spec's Storybook section to the accepted HUD/human-acceptance purpose and explicit Leva retirement; leave story and dependency edits to a repository implementation Issue.
6. Add short status notes only to genuinely ambiguous files. Existing strong historical tombstones are sufficient; do not rewrite the bodies of archival evidence merely to modernize terminology.

## Confidence and limits

This audit classifies repository intent and checked it against local source, tests, package configuration, and workflows. It did not treat production observations as perpetual proof, did not validate third-party dashboard state, and did not rewrite or delete any existing documentation. The future nightly/monthly implementation remains intentionally undecided in Wayfinder #369; this artifact therefore identifies the current authority and unsafe runbooks without choosing that future model.
