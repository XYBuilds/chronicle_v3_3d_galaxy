# Frontend runtime

> Answers: how the Chronicle frontend starts, loads data, routes, separates React/Three/store concerns, and which browser/test/tool policies apply
> Excludes: visitor journey prose, galaxy interaction semantics, search UX detail, data cleaning/UMAP math, publication cadence owned by data topics
> Update when: load/mount contracts, asset URL resolution, public route surface, host/deploy assumptions, or test/Storybook policy change
> Required authorities: [`docs/system/planet-export-contract.md`](../system/planet-export-contract.md) for production manifest / active-profile consumption (C-004)

## Current answer

Stack: Vite + TypeScript + React (HUD/DOM) + raw Three.js (canvas) + Zustand as the bridge. There is no React Router; a lightweight path parser owns public routes `/` and `/movie/:id`. Unknown paths, including retired `/today` and `/share/today`, follow ordinary invalid-path handling and canonicalize to galaxy idle. `/og/today.png` is not a frontend route.

### Startup and loading

Production entry hydrates gzip galaxy data and the optional search index through staged download → decompress → parse → index work. WebGL mounts when the index stage is `ready`, `skipped`, or `error` (`error` disables search only). After mount, `/` is galaxy idle and `/movie/:id` enters the matching focus when the id resolves.

Asset resolution (`frontend/src/lib/galaxyAssetUrls.ts`):

1. Explicit `VITE_*` overrides when set
2. Optional `?dataset=` local/debug selection
3. Production manifest fields (`galaxy_data_gzip_url`, optional search gzip URL, `data_version`, optional active focus-emission profile pointer + URL)
4. Bundled gzip fallback

Development skips the remote manifest and uses bundled gzip fixtures so local work does not depend on live R2.

### Runtime boundaries

- React owns HUD/DOM and intent emission.
- Three.js owns scene graph, materials, and time-driven masks/animation.
- Zustand adapters commit exploration context and shared UI state; invalid lifecycle payloads fail closed.
- Exact visual defaults remain source evidence under `frontend/src/three/`.

### Hosting and browser support

- Site host is Cloudflare Pages via GitHub Actions Direct Upload of a composed `dist` (verified site artifact plus the current production manifest); large galaxy/search gzip objects live on R2.
- GitHub Pages and Vercel are not current production hosts.
- WebGL2 is required. Desktop/mouse is the supported interaction class.

### Testing and developer-tool policy

- Python and Vitest cover contracts, locales, and pure helpers.
- Manual/browser checks cover WebGL presentation.
- Storybook is a HUD catalog plus one Visual Gate for Three.js scene states (Storybook args/controls grouped by object; Leva is not part of the catalog). It is not a full 3D acceptance substitute.
- Production remains WebGL2 SDR with Bloom off. Capability probing may inform the SDR fallback policy; `window.__hdrCapabilities` and `window.__hdrProbe` are not installed.

## Boundaries and invariants

- Do not reintroduce same-origin-only gzip assumptions or GitHub Pages as an active deploy path.
- Site Release owns the immutable application-shell artifact. Data Release injects the candidate manifest onto the active artifact and must fail closed on an active/deployed mismatch.
- Runtime docs do not own product scope or data semantics.

## Verification evidence

- `frontend/src/data/loadGalaxyGzip.ts`, `loadGalaxyData.ts`, `App.tsx`
- `frontend/src/lib/galaxyAssetUrls.ts`, `frontend/src/lib/routes.ts`
- `frontend/functions/_middleware.js` for Pages routing/SPA refresh needs
- Workflow build/deploy steps in `.github/workflows/site_release.yml`, `.github/workflows/nightly_vote_refresh.yml`, and `.github/workflows/monthly_refit.yml`
- Locale/schema Vitest suites

## Related topics

- [`../product/supported-experience.md`](../product/supported-experience.md)
- [`../product/galaxy-exploration.md`](../product/galaxy-exploration.md)
- [`../product/search-and-hud.md`](../product/search-and-hud.md)
- [`../data/refresh-and-publication.md`](../data/refresh-and-publication.md)
