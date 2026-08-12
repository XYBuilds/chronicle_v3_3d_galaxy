# Chronicle Repository Guidance

Chronicle is the product-control repository for The Movie Cosmos. It owns the primary site, galaxy data pipeline, planet-export producer, and the product-level system map. The OG Worker and Daily Stargazing remain separate repositories and deployment units.

## Agent skills

### Issue tracker

GitHub Issues are the public entry point for new work in this repository. Use `gh` for Issue operations. Accepted specifications are published as Issues; implementation work stays in the repository that owns the code. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five canonical Matt skills labels. See `docs/agents/triage-labels.md`.

### Domain docs

Chronicle uses a single repository context plus a federated system map under `docs/system/`. Read the relevant product documents and system maps before designing work. Create or update `CONTEXT.md` and ADRs only when domain terms or durable design decisions are actually resolved through the domain-modeling workflow. See `docs/agents/domain.md`.

## Product-control rules

- Historical `.cursor/plans/` and `docs/reports/` are archival records. Index them; do not migrate or renumber them.
- New cross-repository work starts as one parent Initiative and has one implementation Issue per affected repository.
- The parent Initiative owns the product goal, contract, dependency order, compatibility window, rollback plan, and integration acceptance.
- Each repository owns its branch, tests, PR, deployment, and implementation evidence.
- Chronicle is the temporary coordination owner for product-level Initiatives. It does not own Worker or Daily runtime behavior.
- Cross-repository contracts must be recorded in `docs/system/contract-index.md`.

## Delivery workflow

Repository delivery is **tool-neutral**. External discovery, specification, and review skills (including Matt skills) may help agents work, but they are not repository authority and must not be copied into Chronicle as product rules.

Required delivery checks, regardless of host:

- Work from an Issue-owned branch off an up-to-date default base (`main` unless otherwise specified).
- Run the verification that matches the changed scope (frontend Vitest/lint/build, `scripts/tests/` pytest, locale schema checks, documentation authority tests, `git diff --check`, and any Issue-named checks).
- Keep Plans and Reports historical; do not rewrite accepted ADRs as silent edits.
- **Human merge and Issue closure approval are mandatory.** Agents may prepare evidence and open a PR when authorized, but must not merge or close the Issue without explicit human approval.

Current documentation navigation starts at [`docs/system/decision-index.md`](docs/system/decision-index.md).
