# Search and HUD

> Answers: how search, HUD chrome, keyboard behavior, and DOM interaction work for visitors
> Excludes: 3D camera/focus lifecycle math, gzip load/routing architecture, data export schema, publication workflows
> Update when: search UX or index-consumption rules, Esc/keyboard seams, HUD chrome, or locale key surfaces change
> Required authorities: [`docs/adr/0001-focus-select-lifecycle.md`](../adr/0001-focus-select-lifecycle.md) when a change crosses into nested vs replacing focus; otherwise none

## Current answer

Search and HUD are the DOM layer over the galaxy. Search requires a hydrated search index (`meta.has_search_index`); otherwise the control stays disabled.

### Search

Tabs: **movie / person / genre**. Switching tabs clears the current query.

- **Movie** — minimum length 3 characters (CJK/Hangul/Kana may use a lower threshold); debounced suggestions; ranking prefers prefix matches and weights `log10(vote_count+1) × vote_average`. Choosing a title requests **replacing focus**.
- **Person** — token-prefix suggestions (bounded list); covers cast plus creative roles (director, DOP, writers, producers, music). Choosing a person enters a **select session** with `selectionPersonKey` and three constellation chains. Archive-drawer person names can enter the same session when the index resolves them.
- **Genre** — nineteen frozen official-genre badges; multi-select is AND; impossible badges disable; no constellation lines; does not move `zCurrent`.
- **TMDB ID** — numeric id lookup enters replacing focus when the id exists in the loaded galaxy.

Esc stack (outermost first): blur search → close drawer → exit focus while keeping an underlying select session → clear select.

### HUD chrome

- Timeline control defaults to a vertical track; `?timeline=horizontal` opts into the horizontal layout.
- Hover tooltip shows title + primary genre without interrupting roam.
- Focus opens the archive drawer; exit uses the floating “View cosmos” control or the Esc stack—not blank-canvas click.
- Top utility order: Feedback → Support → Info → Lang → Fullscreen.
- Keyboard: `F` toggles fullscreen; Cmd/Ctrl+K focuses search; Esc follows the stack above.

### Localization

HUD-visible English copy is authored in `frontend/src/lib/locales/en.json` and exported through `frontend/src/lib/strings.ts` / `useStrings()`. Locale resolution uses `?lang=` → localStorage → navigator → `en`; `ar` sets `dir=rtl`.

Storybook remains a DOM/HUD catalog surface, not a substitute for WebGL end-to-end proof.

## Boundaries and invariants

- Search emits exploration intents; it does not own the lifecycle SSOT (see galaxy exploration + ADR 0001).
- Exact CSS tokens, spacing, and motion curves live in frontend source; this topic owns interaction meaning.
- Fuzzy search, non-genre multi-filters, and first-time onboarding are not current product.
- Do not restore Today/Cover HUD controls or the retired Today-share button ordering.

## Verification evidence

- `frontend/src/components/` (Search, Drawer, Timeline, HUD utilities)
- `frontend/src/utils/` search helpers and related Vitest coverage
- Locale schema tests under `frontend/src/lib/locales/`
- Storybook HUD stories (catalog only)

## Related topics

- [`supported-experience.md`](./supported-experience.md)
- [`galaxy-exploration.md`](./galaxy-exploration.md)
- [`../frontend/runtime.md`](../frontend/runtime.md)
