# Supported product experience

> Answers: what The Movie Cosmos currently offers as a supported product: purpose, journeys, public routes, support surface, and explicit non-goals
> Excludes: galaxy visual math, search UX detail, frontend loading internals, data schema, and publication workflows
> Update when: product purpose, supported journeys, public routes, support/feedback surface, or retired Today boundaries change
> Required authorities: none

## Current answer

The Movie Cosmos is a static, immersive 2.5D archive of roughly sixty thousand TMDB films. Content similarity maps to the XY plane; release time maps to Z depth. There is no account system and no application backend in the current product phase.

Supported journeys:

1. **Time travel** — scroll along Z to move through release years.
2. **Deep-space discovery** — read size, brightness, and genre color while roaming.
3. **Artifact inspection** — hover for a lightweight tooltip; click into focus with a detail drawer.
4. **Search** — title, person, genre, and TMDB ID lookup into focus or select sessions (owned by [search-and-hud.md](./search-and-hud.md)).

Public routes and startup:

- `/` mounts as **galaxy idle** after galaxy data and search-index hydrate complete. There is no Start gate, Cover, or daily picker.
- `/movie/{tmdbId}` opens that film in focus when the id exists; unknown or illegal ids replace to `/`.
- `/today` and `/og/today.png` are retired and return **404** at the service boundary. Brand homepage OG and movie OG remain.

Support surface (third-party only; no first-party tickets or accounts):

- **Ko-fi** voluntary support and **Tally** feedback from the ambient HUD.
- Discord is reached from the Tally thank-you page, not as an in-app channel with SLA.

Branding:

- UI identity surfaces use `the movie cosmos` (lowercase).
- Narrative/product description text uses `The Movie Cosmos`.

Explicit non-goals that remain out of the current supported experience: multi-dimensional filter overlays, spotlight-by-country/company, first-time guided onboarding, mobile/touch-first UX, and WCAG AA as a hard release gate.

## Boundaries and invariants

- Frontend consumes static galaxy/search assets; it does not query Supabase or any app backend.
- Today picker, `today.json`, Cover HUD/shaders, and Today share/OG paths are retired, not degraded compatibility features.
- Roadmap ideas belong in Issues until implemented; do not write them here as live behavior.
- Cross-repository movie identity and OG/Planet contracts live under [`docs/system/`](../system/contract-index.md), not in this topic.

## Verification evidence

- Routes and mount: `frontend/src/` route helpers, App phase machine, Phase 40 reports and locale/route tests.
- Support buttons: `frontend/src/lib/kofiSupport.ts`, `frontend/src/lib/tallyFeedback.ts`, HUD strings in `frontend/src/lib/locales/en.json`.
- Retired Today: [`docs/system/og-index-worker-contract.md`](../system/og-index-worker-contract.md); `scripts/tests/test_phase40_documentation_contract.py`.

## Related topics

- [Galaxy exploration](./galaxy-exploration.md)
- [Search and HUD](./search-and-hud.md)
- [Frontend runtime](../frontend/runtime.md)
- [Refresh and publication](../data/refresh-and-publication.md)
