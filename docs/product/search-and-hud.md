# Search and HUD

> Answers: how search, HUD chrome, keyboard shortcuts, localization, and DOM interaction behave for the supported site
> Excludes: 3D mesh/camera math, exploration lifecycle intent core (beyond HUD-facing nesting), data schema internals, and publication
> Update when: search modes, ESC stack, HUD layout/tool order, keyboard bindings, locale/string policy, or drawer/search interaction change
> Required authorities: none

## Current answer

HUD is a React DOM overlay over the Three.js canvas. User-visible English strings are keyed in `frontend/src/lib/locales/en.json` and exposed through `frontend/src/lib/strings.ts` (`useStrings` / `getStrings`). Other locales must keep the same leaf key paths. TMDB field values (titles, people, genres, overviews) are not translated.

Top search bar (three segments):

1. **Movie** — title / `original_title` autocomplete → replacing focus on the chosen film (also TMDB ID lookup path).
2. **Person** — cast/crew index → select session for that person's films, with constellation chains; drawer person names can enter the same session when the index resolves them.
3. **Genre** — AND multi-select badges over the frozen palette; intersection drives the select session; no constellation lines.

When `meta.has_search_index` is not true, search is disabled without blocking the scene. Query thresholds: default trim length ≥ 3; CJK/kana/hangul scripts may trigger at length 1. Debounce is 200 ms. Normalization is v2 NFKC/`casefold`-style mirroring between Python and JS when `search_normalize_version` is `"v2"`.

ESC focus stack (one step per press):

1. Blur search input (keep query/session).
2. Close drawer.
3. Exit focus (keep select parent if present).
4. Clear select session.

Search clear (X) aligns with the focus-exit step when a film is focused. Nested focus inside a select session is allowed; priority is focus > select > macro active/idle/hover.

Ambient top-right tools, left to right: **Feedback → Support → Info → Lang → Fullscreen**.

Global shortcuts (outside text inputs where noted):

- `F` toggles fullscreen.
- `Cmd/Ctrl+K` focuses the search input when search is enabled.
- Search combobox owns arrow/Enter keys while open.

Other HUD surfaces: timeline (default vertical; `?timeline=` may select horizontal; read-only while focused), hover tooltip, detail drawer (poster, metadata, cast/crew, outbound links, share to `/movie/:id`), Info modal, and locale switch (`?lang=` / localStorage / navigator heuristic; `ar` sets `dir=rtl`).

Desktop pointer input is the design target (~1600×900 landscape baseline). Touch-first mobile is non-goal. HUD spacing/z-index tokens live in `frontend/src/index.css`.

## Boundaries and invariants

- Exploration lifecycle ownership remains [galaxy-exploration.md](./galaxy-exploration.md) + ADR 0001; this topic owns HUD-facing search/ESC/UX only.
- Exact CSS tokens, badge formulas, and constellation opacities stay in source / the supporting visual parameter table.
- Search index schema fields are owned with [galaxy-model.md](../data/galaxy-model.md).
- Ko-fi/Tally env wiring detail is owned with [frontend runtime](../frontend/runtime.md); product intent is in [supported-experience.md](./supported-experience.md).

## Verification evidence

- Components: `frontend/src/components/` SearchBar/Drawer/Timeline/Tooltip, `frontend/src/hud/`.
- Locale schema: `frontend/src/lib/locales/locales.schema.spec.ts`.
- Search/normalize helpers and Vitest coverage under `frontend/src/utils/` and related specs.
- Phase 12/21/26/28 reports remain archival evidence only.

## Related topics

- [Supported experience](./supported-experience.md)
- [Galaxy exploration](./galaxy-exploration.md)
- [Frontend runtime](../frontend/runtime.md)
- [Galaxy data model](../data/galaxy-model.md)
