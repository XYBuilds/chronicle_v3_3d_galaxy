# Issue tracker: GitHub

Issues and specifications for Chronicle live in the GitHub repository under XYBuilds. Use the `gh` CLI for Issue and pull-request operations. Provider Issue numbers and URLs are aliases; portable identities use `tmc:<repo-key>:<ULID>`.

## New work

- Bug reports and feature requests enter through GitHub Issues.
- Maintainer triage decides whether an Issue is a duplicate, needs more information, is accepted, or needs design work.
- `to-spec` is used only after the direction is accepted and the problem boundary is clear.
- A Spec Issue receives `ready-for-agent` only when its acceptance criteria and implementation seams are sufficiently clear.

## Cross-repository Initiatives

- A parent Initiative is created in the repository that owns the product-level decision.
- Chronicle is the default coordination owner unless the work is primarily Daily-domain work.
- Each affected repository receives a child implementation Issue.
- Child Issues link back to the parent with a titled portable parent reference and name their local tests and delivery constraints.
- The parent closes only after all child Issues and the integration acceptance are complete.
- Use portable identities plus titled references when linking across repositories.

## History

Existing `.cursor/plans/` and `docs/reports/` remain historical records. New Issues do not receive a legacy Phase number.

## Pull requests

Pull requests are implementation and review surfaces, not substitutes for accepted product specifications. The repository does not currently treat external pull requests as an untriaged feature-request queue. Human merge approval is mandatory; do not bypass protected `main`.

## Current labels

The repository keeps ordinary labels such as `bug`, `enhancement`, `documentation`, `duplicate`, `good first issue`, `help wanted`, `invalid`, and `question`. Matt workflows use the canonical `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix` labels defined in `docs/agents/triage-labels.md`.

Wayfinder maps use `wayfinder:map`. Their child tickets use exactly one of `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.

## Wayfinding operations

Wayfinder uses ordinary GitHub Issues plus portable identities. Portable records keep parent and blocker meaning in the Issue body; a native relationship may mirror those lines where available. Do not maintain a second writable tracker.

- **Map:** create one Issue labelled `wayfinder:map`. Its body contains Destination, Notes, Decisions so far, Not yet specified, and Out of scope. Open tickets are discovered through titled child Issues rather than copied into the map body.
- **Child ticket:** create an Issue with exactly one `wayfinder:<type>` label. The body includes `Part of: <map title> (\`<map portable id>\`)`.
- **Blocking:** keep a `Blocked by: <title> (\`<portable id>\`)` line in the Issue body. Portable recovery does not treat native relationships as the only readable truth.
- **Frontier:** list the map's open child Issues in map order, then exclude any Issue with an assignee or a `Blocked by` line whose blockers are still open. The first remaining Issue is the default next ticket.
- **Claim:** assign the ticket before any work with `gh issue edit <number> --add-assignee @me`.
- **Resolve:** post the answer as a resolution comment, close the ticket, and append one linked gist of the answer to the map's Decisions so far section.

If the active tracker becomes unavailable, promote the newest verified normalized export as the sole writable local Markdown tracker and record the failover time. Never reconcile by writing two trackers at once.

## Tracker transition

A tracker transition freezes the predecessor, exports and verifies a normalized Markdown bundle, imports and verifies the destination, and only then promotes the destination. Local Markdown, GitHub, and GitLab are never writable at the same time. Returned GitHub Issue #370 is a closed design ticket; #378 is the separate open simplification Initiative. Preserve both identities.


## GitLab predecessor

The [2026-10-02 export](../history/gitlab-2026-10-02/README.md) preserves Issue and merge-request bodies, state, authorship, timestamps, and comments. Treat it as read-only history. GitHub is the destination tracker; complete the parent cutback Initiative's import verification before freezing the predecessor. Historical GitLab decisions do not authorize shadow backup, which is deferred.
