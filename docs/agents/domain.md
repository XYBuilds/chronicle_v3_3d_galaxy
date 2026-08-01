# Domain documentation

## Reading order

Before designing a change, read:

1. The relevant document under `docs/system/`.
2. The relevant document under `docs/project_docs/`.
3. The relevant `.cursor/rules/*.mdc`.
4. Relevant historical Plans and Reports for implementation evidence.
5. Relevant ADRs in the owning repository, when they exist.

## Current layout

- `docs/system/` contains the product-level map and cross-repository contracts.
- `docs/project_docs/` contains Chronicle's current product and implementation SSOTs.
- `.cursor/plans/` and `docs/reports/` are historical execution records.
- `CONTEXT.md` and `docs/adr/` are intentionally created lazily when domain modeling resolves a real terminology or durable design question.

## Cross-repository boundary

Chronicle owns product-level identity and producer contracts. The OG Worker owns its Cloudflare consumer behavior. Daily Stargazing owns its editorial and publication domain. Do not copy another repository's glossary or ADRs into Chronicle; link to the owning repository instead.

## Decision updates

Do not silently edit an accepted architectural decision into a different decision. When a durable design changes, create a new ADR that supersedes the old one and update the relevant system index.