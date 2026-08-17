# Local ticket index

This directory is the query surface for the temporary local Markdown tracker. Ticket order is the order below. A ticket is on the frontier when it is open, unassigned, and every linked blocker is closed.

| Ticket | Type | Status | Blocked by |
| --- | --- | --- | --- |
| [Clarify GitHub suspension boundaries and account-content recovery](./clarify-github-suspension-boundaries.md) | `wayfinder:research` | closed | — |
| [Compare independent Git, Issue, CI, and mirror hosts](./compare-independent-development-hosts.md) | `wayfinder:research` | closed | — |
| [Compare personal secrets primary stores](./compare-personal-secrets-stores.md) | `wayfinder:research` | closed | — |
| [Define the complete recovery snapshot and its proof](./define-complete-recovery-snapshot.md) | `wayfinder:grilling` | closed | [Compare personal secrets primary stores](./compare-personal-secrets-stores.md) |
| [Choose the independent development control plane](./choose-independent-control-plane.md) | `wayfinder:grilling` | closed | first two research tickets |
| [Choose the secrets authority and recovery model](./choose-secrets-authority.md) | `wayfinder:grilling` | closed | [Compare personal secrets primary stores](./compare-personal-secrets-stores.md) |
| [Define the portable Issue-driven workflow](./define-portable-issue-workflow.md) | `wayfinder:grilling` | closed | host comparison and control-plane choice |
| [Define the P0 repository and development restoration plan](./define-p0-restoration.md) | `wayfinder:grilling` | closed | snapshot, control plane, secrets, Issue workflow |
| [Design the P1 Chronicle publication control plane](./design-p1-publication-control-plane.md) | `wayfinder:grilling` | closed | control plane, secrets, P0 plan |
| [Design the P2 Monthly and Production Recovery path](./design-p2-recovery-path.md) | `wayfinder:grilling` | closed | P1 publication control plane |
| [Design the long-term mirror and failover topology](./design-long-term-redundancy.md) | `wayfinder:grilling` | closed | account boundaries, control plane, P0/P1/P2 plans |
| [Accept the ordered recovery and resilience specification](./accept-ordered-specification.md) | `wayfinder:grilling` | closed | every preceding decision ticket |

Ticket identifiers are metadata only. Human-facing narration refers to linked ticket names.

## Current frontier

None. Every decision ticket is closed and the parent map has reached its destination.
