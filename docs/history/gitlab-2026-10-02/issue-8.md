# Restore development and operations without a GitHub account single point of failure



Source: https://gitlab.com/yixie.ixd/chronicle_v3_3d_galaxy/-/work_items/8

State at capture: **closed**

Original author: @yixie.ixd

Created: 2026-08-18T09:52:33.655Z; updated: 2026-08-18T09:52:35.050Z



Labels at capture: wayfinder:map

Assignees at capture: (none)

## Original body



**Portable ID:** `tmc:chronicle:01M0WFG0000000000000000001`
**Parent:** None
**Blocked by:** None
**Local state:** closed
## Destination

Produce an accepted, evidence-backed, execution-ordered specification for restoring The Movie Cosmos development and operations after the entire GitHub account became unavailable, while removing GitHub-account lockout as a single point of failure.

The specification must cover P0 protection and restoration of all three repositories plus Issue-driven development, P1 restoration of Chronicle Site and Daily Data Releases, and P2 migration with deliberate GitLab-period suspension of Monthly Data Release plus GitHub-independent Production Recovery. Execution is handed off after the route is decided.

## Notes

- This is a temporary local Markdown tracker because the GitHub account and its Issues are inaccessible. When an approved remote tracker is available, migrate the map, tickets, dependency links, and resolution context; do not maintain two live copies.
- Child tickets live in [`tickets/`](./tickets/). The local frontier is the ordered set of open, unassigned tickets whose `Blocked by` entries are all closed.
- Every decision session uses the Wayfinder, Grilling, and Domain Modeling workflows. Research tickets use the Research workflow and primary sources.
- Chronicle is the product-control owner. The OG Worker and Daily Stargazing remain independent repositories and deployment units.
- Planning preference: simple, direct recovery over the fastest patch. There is no calendar deadline.
- Platform boundary: preserve Cloudflare, Supabase, DNS, and production data. Replace or supplement the unavailable GitHub control plane.
- GitHub small-account boundary: do not move repositories, production secrets, Actions, or Issues to the small account until GitHub clarifies whether that use is allowed during the main-account suspension.
- New-host boundary: prefer a managed SaaS that can provide Git, Issues, hosted CI, private repositories, and export or mirror capabilities. Do not introduce self-hosted forge operations.
- Initial visibility: new remote repositories remain private until recovery history and secret exposure checks pass.
- Source-recovery boundary: preserve full Git stores before migration, including stash, reflog-only objects, dangling WIP, and Codex refs. No up-front manual classification is required, and no `git gc`, `repack`, or `prune` runs before an independent snapshot exists.
- Backup boundary: after this map reaches the destination, the first P0 execution slice and first accepted recovery outcome is a verified copy to the maintainer's MacBook on the same LAN. Bitwarden, restic, capacity, and SSH preparation are internal prerequisites of that slice; no real forge migration, live-secret migration, repository push, or production change precedes snapshot acceptance.
- Secrets boundary: choose a personal, non-self-hosted, end-to-end encrypted primary store with Windows, browser, and phone support plus an emergency export. CI secrets are deployment copies, not the authority.
- CI boundary: normal schedules use hosted CI; local execution is a tested emergency fallback rather than the normal scheduler.
- P2 Monthly boundary: migrate one intact Monthly entry point, but keep every production trigger disabled while GitLab is the temporary primary; Daily continues on the last active membership, arrangement, and profile until an approved GitHub cutback and Monthly re-enable gate.
- Issue continuity: all implementation subissues were closed before suspension. Chronicle's sole remaining parent map is confirmed as GitHub Issue 370; its inaccessible body and final status are reconciled if GitHub access returns.
- Production observation on 2026-08-17: the site, public manifest, OG brand endpoint, and current immutable R2 galaxy object returned HTTP 200. The public manifest still identified `2026.08.02.daily.131`, exported at `2026-08-02T20:45:51.264Z`; P1 restores publication freshness and control, not an offline site.
- Local audit boundary: the three current repository branches match their last locally cached remote-tracking refs and all three Git object stores pass integrity checks. This cannot prove that GitHub had no newer server-only refs, Issues, comments, settings, artifacts, caches, or secrets after the last fetch.
- Current repository authority remains [`docs/system/decision-index.md`](../../system/decision-index.md). This temporary tracker does not rewrite accepted ADRs, historical `.cursor/plans/`, or `docs/reports/`.

## Decisions so far

<!-- One linked gist per closed ticket. Detailed answers live in the ticket resolution comments. -->

- [Clarify GitHub suspension boundaries and account-content recovery](./tickets/clarify-github-suspension-boundaries.md) — Keep the secondary GitHub account outside project operations pending written guidance; continue one formal appeal and request protective content preservation/export now.
- [Compare independent Git, Issue, CI, and mirror hosts](./tickets/compare-independent-development-hosts.md) — Trial GitLab.com first, retain Azure DevOps Services as a private-only contingency, and exclude Codeberg and Bitbucket Cloud from the unified-control-plane shortlist.
- [Compare personal secrets primary stores](./tickets/compare-personal-secrets-stores.md) — Shortlist Bitwarden Premium as the default fit and 1Password Individual as the onboarding-focused alternative; require an independent recovery artifact and tested portable export.
- [Define the complete recovery snapshot and its proof](./tickets/define-complete-recovery-snapshot.md) — Create one client-encrypted restic snapshot on the MacBook that preserves all three worktrees and physical Git stores, then require full-data checking and a zero-difference complete restore before migration.
- [Choose the independent development control plane](./tickets/choose-independent-control-plane.md) — Use GitLab.com Free in one personal namespace as an automated-acceptance-gated temporary primary; return primary to GitHub and retain GitLab only as a zero-cost cold-recovery endpoint.
- [Choose the secrets authority and recovery model](./tickets/choose-secrets-authority.md) — Use Bitwarden Free as the authority, keep CI and `.env` values as scoped copies, prove a synthetic automated restore, and rotate only on evidence-based triggers.
- [Define the portable Issue-driven workflow](./tickets/define-portable-issue-workflow.md) — Use the standard per-repository GitLab setup with one active tracker, portable `tmc:<repo>:<ULID>` identities, body-readable relationships, normalized Markdown recovery exports, and capture-first human reconciliation of the inaccessible GitHub parent map.
- [Define the P0 repository and development restoration plan](./tickets/define-p0-restoration.md) — Pass the verified MacBook snapshot, Bitwarden migration, and GitLab admission gates first; then restore Chronicle before parallel Worker/Daily gates, resuming each repository only after automated private-remote, protected-branch, single-tracker, and bootstrap-MR proof.
- [Design the P1 Chronicle publication control plane](./tickets/design-p1-publication-control-plane.md) — Run Site and Data publication as serialized GitLab jobs over shared cross-platform entry points, with Chronicle-owned monotonic R2 receipts, whole-entry replay, tested manual Windows fallback, and a free-budget daily-or-weekly cutover.
- [Design the P2 Monthly and Production Recovery path](./tickets/design-p2-recovery-path.md) — Migrate but suspend one intact Monthly job during the GitLab-primary period, preserve its bundle on MacBook and private R2, and keep Recovery as a local audited planner plus repository-owned manual commands rather than a new live executor.
- [Design the long-term mirror and failover topology](./tickets/design-long-term-redundancy.md) — Use one account-wide GitHub-to-GitLab cold recovery mirror with a 24-hour recovery point, Mac/R2 encrypted retention, fully automated restore drills, no dormant production secrets, and human-gated promotion or decommission.
- [Accept the ordered recovery and resilience specification](./tickets/accept-ordered-specification.md) — Accept the strict MacBook-snapshot-first P0 → all-repository development restoration → P1 → P2 handoff, with explicit Issue seams, canonical R3 evidence, fail-closed compatibility and rollback gates, and future cutback/permanent-primary work separated into new efforts.

## Not yet specified

None. GitHub Issue 370 already has a capture-first, human-reconciled conditional P0 procedure, and live Cloudflare, Supabase, and token state are implementation-time read-only admission facts rather than unresolved design decisions.

## Out of scope

- Executing backups, creating third-party accounts, pushing repositories, migrating Issues, copying secrets, changing CI, or deploying production during the wayfinding map itself. These are implementation handoffs after the specification is accepted.
- Moving Cloudflare Pages, R2, KV, Supabase, DNS, or the production domain to new providers unless later evidence shows that keeping them blocks the destination.
- Reconstructing every closed historical Issue or classifying every reflog/stash/dangling object when preservation alone satisfies recovery.
- Re-enabling retired GitHub Pages behavior or rewriting historical Plans, Reports, and accepted ADRs.
- Guaranteeing repository-specific product, CI, deployment, or recovery semantics for GitHub repositories outside Chronicle, the OG Worker, and Daily Stargazing; the account-wide mirror protects them generically without transferring their ownership to Chronicle.
- Executing a GitLab-to-GitHub development or publication cutback, re-enabling Monthly Data Release, or creating the `mirror-control` repository. If GitHub returns, those actions begin through separate Cutback & Resilience and Monthly-re-enable Wayfinder efforts.
- Choosing a permanent primary and a new independent cold endpoint if GitHub never returns, or replacing/decommissioning GitLab if it becomes unsuitable. Each changed external condition opens a new Wayfinder effort rather than silently promoting a contingency.



## Original notes
