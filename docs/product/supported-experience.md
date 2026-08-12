# Supported product experience

> Answers: what The Movie Cosmos currently offers visitors, which journeys and surfaces are supported, and which public paths are intentionally retired
> Excludes: galaxy camera/focus math, search HUD interaction detail, frontend load/runtime architecture, data schema and publication workflows, roadmap items not shipped
> Update when: a public journey, route, retirement, support entry, or locale surface changes; or when an accepted product scope decision lands in production
> Required authorities: [`docs/system/og-index-worker-contract.md`](../system/og-index-worker-contract.md) for sharing/OG entry points and retired Today surfaces

## Current answer

The Movie Cosmos is an immersive 2.5D movie-history archive: roughly sixty thousand TMDB films rendered as a particle galaxy. Content similarity maps to the roamable plane; release time maps to physical depth. The brand mark on UI identity surfaces is **the movie cosmos** (all lowercase); narrative copy uses **The Movie Cosmos**.

Supported visitor journeys:

1. **Time-depth roaming** — wheel through the Z timeline from sparse early cinema to dense modern clusters.
2. **Visual discovery** — read size, brightness, and color as popularity, rating, and primary genre cues while hunting films.
3. **Artifact inspection** — hover for a lightweight tooltip, click into focus with an archive drawer (poster, overview, cast/crew, external links).

Entry and routes:

- After gzip galaxy data and search-index hydrate, `/` mounts as **galaxy idle** (no Start gate, no Cover, no `today.json`).
- `/movie/:id` opens that film’s focus when data is available; invalid ids clear back toward idle while preserving allowed query params such as `lang` / `theme` / `timeline`.
- Sharing and social preview keep the brand homepage OG and movie `/movie/:id` OG via the OG Worker. There is no Today share surface.

Progressive HUD intent (detail owned by search/HUD and exploration topics): roam → hover tooltip (title + primary genre) → click focus + drawer. Search adds title → focus, person → select + constellation, and genre → multi-badge select.

Support and community (third-party only; no self-hosted accounts or tickets):

- Voluntary support via Ko-fi when `VITE_KOFI_URL` is configured.
- Structured feedback via Tally when `VITE_TALLY_FEEDBACK_FORM_ID` is configured.
- Discord invitation is configured on the Tally thank-you page, not as an in-app community block.

Locales currently ship EN, zh, zh-Hant, ja, es, fr, and ar for HUD chrome strings. TMDB title/overview fields stay in source language. Desktop/mouse is the primary interaction target; WebGL2 is required.

Retired public surfaces: `/today` (including query), `/og/today.png`, and `/share/today` remain reserved historical routes and return a side-effect-free **404** at the service boundary. That reserved-404 contract is current; an ordinary SPA invalid-path remapping is accepted for later delivery and is **not** live yet.

Not shipped: first-time onboarding, multi-dimensional filters/spotlight roadmap items, and HDR as a production render path.

## Boundaries and invariants

- Product purpose and supported journeys live here; exploration lifecycle math and HUD mechanics do not.
- UI identity surfaces use lowercase `the movie cosmos`; narrative/product-description text uses `The Movie Cosmos`.
- Do not describe Cover, Start-gate, or Today picker flows as current.
- Do not claim GitHub Pages as a site host; Cloudflare Pages is the sole site deployment unit.
- Cross-repository movie identity remains TMDB `id` with canonical site route `/movie/{tmdbId}` ([contract index C-001](../system/contract-index.md)).

## Verification evidence

- Product capability rows in [`docs/system/capability-map.md`](../system/capability-map.md)
- Frontend routes and HUD chrome under `frontend/src/`
- Locale SSOT `frontend/src/lib/locales/en.json` via `frontend/src/lib/strings.ts`
- OG / Today retirement: [`docs/system/og-index-worker-contract.md`](../system/og-index-worker-contract.md) and Worker/producer contract tests
- Branding convention retained for archive compatibility in `.cursor/rules/branding-name-convention.mdc` until its follow-through Issue lands

## Related topics

- [`galaxy-exploration.md`](./galaxy-exploration.md)
- [`search-and-hud.md`](./search-and-hud.md)
- [`../frontend/runtime.md`](../frontend/runtime.md)
- [`../data/refresh-and-publication.md`](../data/refresh-and-publication.md)
