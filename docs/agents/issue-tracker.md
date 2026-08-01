# Issue tracker: GitHub

Issues and specifications for Chronicle live in GitHub Issues. Use the `gh` CLI for all Issue and PR operations.

## New work

- Public bug reports and feature requests enter through GitHub Issues.
- Maintainer triage decides whether an Issue is a duplicate, needs more information, is accepted, or needs design work.
- `to-spec` is used only after the direction is accepted and the problem boundary is clear.
- A Spec Issue receives `ready-for-agent` only when its acceptance criteria and implementation seams are sufficiently clear.

## Cross-repository Initiatives

- A parent Initiative is created in the repository that owns the product-level decision.
- Chronicle is the default coordination owner unless the work is primarily Daily-domain work.
- Each affected repository receives a child implementation Issue.
- Child Issues link back to the parent and name their local tests and delivery constraints.
- The parent closes only after all child Issues and the integration acceptance are complete.
- Use fully qualified references such as `XYBuilds/themoviecosmos-og-worker#45` when linking across repositories.

## History

Existing `.cursor/plans/` and `docs/reports/` remain historical records. New Issues do not receive a legacy Phase number.

## Pull requests

Pull Requests are implementation and review surfaces, not substitutes for accepted product specifications. The repository does not currently treat external PRs as an untriaged feature-request queue.

## Current labels

The repository keeps GitHub's existing labels such as `bug`, `enhancement`, `documentation`, `duplicate`, `good first issue`, `help wanted`, `invalid`, `question`, and `wontfix`. `ready-for-agent` is the first Matt workflow label added by the control-plane setup; additional triage labels will be introduced only when the corresponding workflow is enabled.