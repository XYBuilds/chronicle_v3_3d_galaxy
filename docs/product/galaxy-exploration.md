# Galaxy exploration

> Answers: how the galaxy looks and behaves in 3D—camera, focus/select lifecycle, masks, and focus-sphere presentation
> Excludes: search/HUD DOM chrome, frontend load/routing stack, data schema and refresh cadence, exact CSS tokens and shader uniform defaults
> Update when: exploration lifecycle semantics, camera/mask/focus interaction, or focus emission presentation contracts change
> Required authorities: [`docs/adr/0001-focus-select-lifecycle.md`](../adr/0001-focus-select-lifecycle.md); active emission / manifest boundary in [`docs/system/planet-export-contract.md`](../system/planet-export-contract.md)

## Current answer

Exploration state is the discriminant union `idle | select(session) | focus(movieId, parent?)` (terminology in [`CONTEXT.md`](../../CONTEXT.md); durable rationale in ADR 0001).

Lifecycle rules currently in production:

- **Nested focus** — focusing a film that belongs to the current person/genre `selectionIds` keeps the select session as parent.
- **Replacing focus** — title search, TMDB ID search, direct `/movie/:id` navigation, or a non-member target replaces any select session.
- Semantic intents only: `select/entered`, `select/cleared`, `focus/requested`, `focus/exited`. Focus requests distinguish `preserve-if-member` vs `replace`.
- The URL stores the focus target only; refresh does not restore an in-memory select session.

Macro (idle) interaction:

- Dual `InstancedMesh` layers for idle and active populations.
- Visible Z slab is approximately `[zCurrent, zCurrent + zVisWindow]`; wheel advances time depth.
- Space + wheel dolly scales the local view within the accepted range; drag trucks/pedestals; idle camera Euler stays axis-fixed for the macro roam contract.
- Hover shows the lightweight tooltip owned by the HUD topic; click enters focus.

Focus interaction:

- Target instance scale goes to zero on both meshes; a Perlin high-detail sphere is the focus visual.
- Orbit camera surrounds the focus; neighborhood active mask uses selection mode for nearby films; clicking a neighbor switches focus.
- Blank-canvas click does not exit focus; wheel does not advance time while focused.
- Exit paths are owned jointly with HUD (drawer “View cosmos”, Esc stack) and route clearing.

Select interaction:

- Person select lights the person’s films and draws three role constellation chains (producers / creative core / cast) ordered by release date.
- Genre select lights films containing every selected genre badge; no constellation lines; does not move `zCurrent`.
- Selection mask overrides the time-window active set while the session is live.
- Precedence: focus presentation > select highlight > macro active/idle/hover.

Visual mapping (stable semantics; exact defaults live in source/profile evidence):

- Particle size ← log-scaled `vote_count`
- Macro luminance cue ← `vote_average`
- Color ← primary genre (`genres[0]`) via the frozen palette
- Focus emission intensity ← active `rating-midrank-cdf-lut-v1` profile from the production manifest (not the retired Phase 39 curve)
- Bloom defaults off in production presentation

WebGL2 is required; hard-fail when unavailable. Unimplemented near-camera occlusion cull remains out of the current contract.

## Boundaries and invariants

- Lifecycle orchestration is an exploration module concern; search drafts, tab chrome, orbit animation caches, and shader uniforms are not the lifecycle SSOT.
- Exact numeric defaults belong in `frontend/src/three/` (including `planetVisualDefaults.ts` / `focusEmission.ts`) and the active profile resource, not in this topic.
- Supporting quick references [`TMDB 数据特征工程与 3D 映射总表.md`](../project_docs/TMDB%20数据特征工程与%203D%20映射总表.md) and [`视觉参数总表.md`](../project_docs/%E8%A7%86%E8%A7%89%E5%8F%82%E6%95%B0%E6%80%BB%E8%A1%A8.md) are non-authoritative.
- Do not treat Cover/Today WebGL paths or Phase 39 emission as production.

## Verification evidence

- ADR 0001 and exploration lifecycle tests under `frontend/`
- `frontend/src/three/`, Zustand exploration adapters, and focus emission profile resolution
- [`docs/system/planet-export-contract.md`](../system/planet-export-contract.md) for manifest/active-profile boundary
- Historical state-machine and Design Spec content remain reachable only as archive/pointer paths under `docs/project_docs/`

## Related topics

- [`supported-experience.md`](./supported-experience.md)
- [`search-and-hud.md`](./search-and-hud.md)
- [`../frontend/runtime.md`](../frontend/runtime.md)
- [`../data/galaxy-model.md`](../data/galaxy-model.md)
