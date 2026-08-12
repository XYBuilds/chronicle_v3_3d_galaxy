# Domain documentation

## Reading order

Before designing a change, read:

1. [`docs/system/decision-index.md`](../system/decision-index.md) to find the owning current topic or contract.
2. The relevant current topic under `docs/product/`, `docs/frontend/`, or `docs/data/`.
3. Relevant historical Plans and Reports for implementation evidence.
4. Relevant ADRs in the owning repository, when they exist.

## Current layout

- `docs/system/` contains the product-level map, decision/navigation layer, and cross-repository contracts.
- `docs/product/`, `docs/frontend/`, and `docs/data/` contain Chronicle's bounded current topics.
- Stable paths under `docs/project_docs/` for the former omnibus specs remain thin, non-authoritative one-hop pointers while archive references still cite them. Quick-reference tables there are supporting references only.
- `.cursor/plans/` and `docs/reports/` are historical execution records.
- `CONTEXT.md` and `docs/adr/` are intentionally created lazily when domain modeling resolves a real terminology or durable design question.

## Host tooling vs product authority

Cursor rules under `.cursor/rules/` are **host safety and routing pointers** for agents in this workspace. They are **not** cross-tool product authority and must not compete with the six current topics or system contracts. Brand, exploration, search/HUD, runtime, galaxy-model, and refresh truth live in `docs/product/`, `docs/frontend/`, `docs/data/`, and `docs/system/`.

## Cross-repository boundary

Chronicle owns product-level identity and producer contracts. The OG Worker owns its Cloudflare consumer behavior. Daily Stargazing owns its editorial and publication domain. Do not copy another repository's glossary or ADRs into Chronicle; link to the owning repository instead.

## Decision updates

Do not silently edit an accepted architectural decision into a different decision. When a durable design changes, create a new ADR that supersedes the old one and update the relevant system index.
