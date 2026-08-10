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

The repository keeps GitHub's existing labels such as `bug`, `enhancement`, `documentation`, `duplicate`, `good first issue`, `help wanted`, `invalid`, and `question`. Matt workflows use the canonical `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix` labels defined in `docs/agents/triage-labels.md`.

Wayfinder maps use `wayfinder:map`. Their child tickets use exactly one of `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.

## Wayfinding operations

Wayfinder uses GitHub's native, UI-visible sub-issue and issue-dependency relationships.

- **Map:** create one Issue labelled `wayfinder:map`. Its body contains Destination, Notes, Decisions so far, Not yet specified, and Out of scope. Open tickets are discovered through its child Issues rather than copied into the map body.
- **Child ticket:** create an Issue with exactly one `wayfinder:<type>` label, then link it to the map through the sub-issues API. Resolve the parent Issue's database ID with `gh api repos/XYBuilds/chronicle_v3_3d_galaxy/issues/<map> --jq .id`, then run `gh api --method POST repos/XYBuilds/chronicle_v3_3d_galaxy/issues/<map>/sub_issues -F sub_issue_id=<child-database-id>`.
- **Blocking:** resolve the blocker's numeric database ID with `gh api repos/XYBuilds/chronicle_v3_3d_galaxy/issues/<number> --jq .id`, then run `gh api --method POST repos/XYBuilds/chronicle_v3_3d_galaxy/issues/<blocked>/dependencies/blocked_by -F issue_id=<blocker-database-id>`. Do not substitute the Issue number or GraphQL node ID.
- **Frontier:** list the map's open sub-issues in map order, then exclude any Issue with an assignee or with `issue_dependencies_summary.blocked_by > 0`. The first remaining Issue is the default next ticket.
- **Claim:** assign the ticket before any work with `gh issue edit <number> --add-assignee @me`.
- **Resolve:** post the answer as a resolution comment, close the ticket, and append one linked gist of the answer to the map's Decisions so far section.

If GitHub removes either native capability, use a map task list for children and a `Blocked by: #<number>` line in ticket bodies until the native relationship is restored; do not maintain both representations concurrently.
