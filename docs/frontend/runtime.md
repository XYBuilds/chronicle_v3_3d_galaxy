# Frontend runtime

> Answers: how the Chronicle frontend starts, loads data, routes, separates React/Three/store concerns, supports browsers, and is tested or developed
> Excludes: product journey framing, galaxy visual behavior detail, search UX copy, and data/publication semantics
> Update when: loading phases, routing rules, React↔Three bridge boundaries, browser gates, Storybook/test policy, or developer-tool policy change
> Required authorities: [C-001 movie identity/route](../system/contract-index.md); [C-004 galaxy assets/manifest](../system/planet-export-contract.md)

## Current answer

Stack: Vite + TypeScript + React HUD + raw Three.js canvas + Zustand bridge. Production rendering uses dual `InstancedMesh` + on-demand focus Perlin sphere; WebGL2 is required (`!isWebGL2` fails closed with an upgrade message). Color space is SDR `THREE.SRGBColorSpace`; display HDR is not shipped.

Loading (four stages): download `galaxy_data.json.gz` → decompress → parse/validate → hydrate `galaxy_search_index.json.gz` when declared. App phases: `galaxy-loading` → optional `galaxy-error` with Retry → `index-loading` → mount. Search index `error` or `skipped` does not block mount; it only disables search. There is no Start gate, Today loader, Cover store, or Cover shader branch.

Routing (lightweight path parser; no React Router):

- `/` → galaxy idle after data readiness.
- `/movie/:id` → focus that film; unknown/illegal id → `replaceState('/')`.
- Clearing focus/drawer returns to `/` while preserving allowed `lang` / `theme` / `timeline` query params.
- `/today` and `/og/today.png` must stay 404 and must not be claimed by SPA fallback.

Asset URL resolution order is owned in `frontend/src/lib/galaxyAssetUrls.ts`: Vite overrides → `?dataset=` → Pages manifest → same-origin defaults. Manifest declares galaxy/search assets and may point at the active emission profile (C-004).

React owns DOM HUD. Three.js owns the render loop, materials, and scene-owned animation phase. Zustand bridges selection/hover/locale/data readiness without becoming a second lifecycle SSOT (exploration context remains the lifecycle source).

Browser support: modern desktop WebGL2 browsers; mobile is bonus-only. Accessibility aims for sensible HUD semantics and keyboard reachability for DOM controls; full WCAG AA is not a current gate.

Testing and developer policy (current):

- Python/data assertions and Vitest cover contracts and pure logic; 3D behavior is primarily manual/browser verified.
- Storybook (`@storybook/react-vite`) is for **HUD/DOM isolation and human visual acceptance**, not Three.js scene ownership and not a substitute for production mount.
- Leva is not the product control surface; remaining debug hooks are explicit `window.__*` bridges for local diagnosis.
- Production Bloom stays off unless a debug bridge enables it.

Support env vars (`VITE_KOFI_URL`, `VITE_TALLY_FEEDBACK_FORM_ID`) are build-time; empty/false values hide the corresponding HUD buttons.

## Boundaries and invariants

- Do not reintroduce Cover/Today runtime branches or `today.json` consumption.
- Exact schema field lists belong to [galaxy-model.md](../data/galaxy-model.md).
- Visual interaction rules belong to [galaxy-exploration.md](../product/galaxy-exploration.md) and [search-and-hud.md](../product/search-and-hud.md).
- Site hosting is Cloudflare Pages; GitHub Pages is retired. Publication orchestration belongs to [refresh-and-publication.md](../data/refresh-and-publication.md).

## Verification evidence

- Mount/load/route: `frontend/src/App.tsx`, `loadGalaxyGzip.ts`, `loadGalaxyData.ts`, route helpers, Phase 40 tests/reports.
- Contracts: `scripts/tests/test_phase40_documentation_contract.py`; C-001/C-004 entries in [`contract-index.md`](../system/contract-index.md).
- Storybook config under `frontend/.storybook/`; locale schema Vitest.

## Related topics

- [Supported experience](../product/supported-experience.md)
- [Galaxy exploration](../product/galaxy-exploration.md)
- [Search and HUD](../product/search-and-hud.md)
- [Refresh and publication](../data/refresh-and-publication.md)
