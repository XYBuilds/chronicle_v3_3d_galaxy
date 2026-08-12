# Galaxy exploration

> Answers: how the galaxy looks and behaves during roam, hover, select, and focus, including camera, picking, and 3D interaction
> Excludes: search/HUD chrome details, startup/loading/routing internals, export schema, and publication cadence
> Update when: exploration lifecycle semantics, camera/picking rules, dual-mesh/focus visuals, or constellation/mask behavior change
> Required authorities: [ADR 0001 — focus/select lifecycle](../adr/0001-focus-select-lifecycle.md)

## Current answer

Canonical lifecycle truth is Zustand `explorationContext` with three shapes only: **idle**, **Select session** (person/genre), and **Focus** (with optional parent for nested focus). Scene-owned `selectionPhase`, hover, orbit, neighborhood cache, and search drafts are not lifecycle states. Callers emit four intents: `select/entered`, `select/cleared`, `focus/requested`, `focus/exited`. Terminology remains in [`CONTEXT.md`](../../CONTEXT.md).

Visual mapping (behavior, not numeric SSOT):

- **Size** ← `vote_count` (log scale).
- **Lightness / emission** ← `vote_average` through shader and active emission profile paths.
- **Color** ← primary genre hue; frozen palette semantics live with the data model.

Macro roam (idle):

- Dual full-roster `InstancedMesh` layers (idle + active); production path is not `THREE.Points`.
- Camera stays axis-parallel to Z while idle (`GALAXY_CAMERA_EULER`); truck/pedestal drag; wheel advances `zCurrent`; Space+wheel dolly adjusts `zCamDistance` (clamped) and resets on Space release.
- Timeline slab `[zCurrent, zCurrent + zVisWindow]` drives complementary idle/active scale via smoothstep `inFocus`.
- Idle near-distance fade and optional Z-side dim apply only while macro fades are active; focus sessions disable them.
- Active mesh is opaque with depth write in macro; transparent path is reserved for focus pipeline.

Focus:

- Camera flies to a fixed Perlin-sphere standoff, then uses orbit (yaw/pitch) without wheel dolly.
- Target instance scales to zero on both meshes; a single Perlin focus sphere presents the film.
- Neighborhood mask (`uSelectionMode = 2`) keeps nearby actives pickable for focus switching.
- Nested focus preserves a parent select session when membership holds; replacing focus drops the parent (ADR 0001).
- Blank canvas click in focus is a no-op; drawer close / exit focus / ESC focus step / route home share `focus/exited`.

Select sessions:

- Person or genre collections override the timeline slab for active visibility via selection mask.
- Person sessions may draw three role constellation chains; genre sessions do not.
- Routes encode focus only; refresh cannot restore a select parent from the URL.

Picking uses active-mesh world-sphere intersection aligned with shader scale/`inFocus` (and mask/neighborhood sets). Bloom is off in production by default.

## Boundaries and invariants

- Exact defaults (standoff, fade distances, uniforms, ms timings) live in source (`frontend/src/three/`, `galaxyUniformDefaults.ts`, related modules) and the supporting [visual parameter table](../project_docs/视觉参数总表.md), not as competing SSOTs here.
- Feature→field mapping detail belongs with [galaxy-model.md](../data/galaxy-model.md) and the supporting [feature mapping table](../project_docs/TMDB%20数据特征工程与%203D%20映射总表.md).
- Search ESC stack and HUD layout belong to [search-and-hud.md](./search-and-hud.md).
- Active emission profile pointer is owned by [`planet-export-contract.md`](../system/planet-export-contract.md) (C-004).

## Verification evidence

- Lifecycle: `frontend/src/` exploration module + Vitest coverage; ADR 0001.
- Rendering/camera/picking: `frontend/src/three/scene.ts`, `camera.ts`, `interaction.ts`, `galaxyMeshes.ts`, shaders.
- Historical behavior evidence: Phase 8/11/13/17/19/26/27 reports under `docs/reports/` (archival only).

## Related topics

- [Supported experience](./supported-experience.md)
- [Search and HUD](./search-and-hud.md)
- [Frontend runtime](../frontend/runtime.md)
- [Galaxy data model](../data/galaxy-model.md)
