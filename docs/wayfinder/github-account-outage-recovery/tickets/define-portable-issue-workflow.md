---
id: WFG-007
parent: ../map.md
type: wayfinder:grilling
status: closed
assignee: /root
blocked_by:
  - ./compare-independent-development-hosts.md
  - ./choose-independent-control-plane.md
---

# Define the portable Issue-driven workflow

## Question

How should the Matt-style Issue workflow, Wayfinder maps, child decisions, blockers, claims, resolution comments, risk declarations, and cross-repository Initiatives be represented on the selected platform without making GitHub-native relationships the only readable truth? Decide the fallback representation, export format, stable cross-platform identifiers, and the reconciliation rule for confirmed GitHub Issue 370 when account access returns.

## Resolution comments

### 2026-08-18 — Resolved

Use the standard Matt GitLab setup after the secret-free GitLab admission gate passes. Run setup separately in Chronicle, the OG Worker, and Daily Stargazing so each repository names GitLab as its active Issue tracker. Do not keep GitHub, GitLab, or the temporary local tracker writable at the same time. A tracker transition freezes the old tracker, exports and verifies its records, imports them, and only then promotes the destination and updates `docs/agents/issue-tracker.md`. Actual setup, account creation, and migration remain P0 implementation work.

Add a minimal portable layer to the standard tracker workflow rather than replacing it. Every Wayfinder map or ticket, accepted Spec or Delivery Issue, and cross-repository Initiative or implementation Issue receives one immutable identifier at creation or admission in the form `tmc:<repo-key>:<ULID>`. The current repository keys are `chronicle`, `og-worker`, and `daily`; the later personal-infrastructure repository uses `mirror-control` after its own follow-on Wayfinder effort creates and admits that repository. Existing local identifiers and GitHub or GitLab Issue references remain aliases; provider numbers and URLs never become the portable identity.

Represent the workflow as follows:

| Workflow concept | Active GitLab representation | Portable and fallback representation |
| --- | --- | --- |
| Wayfinder map | Ordinary Issue labelled `wayfinder:map` | Portable ID plus the map's Destination, Notes, Decisions so far, Not yet specified, and Out of scope |
| Decision ticket | Ordinary Issue with one `wayfinder:<type>` label | Portable ID and a titled `Part of` reference carrying the map's portable ID |
| Blocker | `Blocked by` description line on GitLab Free; a native relationship may mirror it where available | Titled blocker references and their portable IDs in the Issue body/export |
| Claim | Current tracker assignee | Exported claimant identity; local fallback records the assignee and status |
| Resolution | Dated resolution note, then closed state, then one linked gist on the map | The dated resolution is retained with its author and timestamp in the exported Issue record |
| Risk declaration | Human-visible R0–R3 tier and protected surfaces, with the existing optional `chronicle-risk-declaration-v1` JSON | The same declaration travels in the Issue body/export; no path-based classifier is introduced |
| Cross-repository Initiative | Parent Initiative in Chronicle and one implementation Issue in every affected repository | Each child owns its portable ID and titled parent reference; the parent indexes titled children without copying their implementation detail |

The normalized export is a versioned bundle designed to restore a readable local Markdown tracker. It contains a manifest with schema version, project identity, export time, provider aliases, record paths, and checksums; one Markdown file per Issue with structured front matter, original body, state, labels, assignees, parent/blocker/cross-repository relationships, comments, and dated resolution; and downloaded attachments or an explicit unavailable-attachment record with the original URL and checksum where available. Keep the bundle in the independently encrypted recovery snapshot rather than committing private Issue content. Retain GitLab project export, Issue CSV, and raw API responses as supplemental evidence, not as the complete backup. The long-term redundancy decision owns the eventual automation cadence; P0 must at least prove a post-migration export and complete local render before the temporary local tracker is frozen.

If the active tracker becomes unavailable, promote the newest verified normalized export to the sole writable local Markdown tracker and record the failover time and source export. When a remote tracker is available again, freeze local writes, export the local delta, reconcile it once, import it, verify portable IDs and relationships, and only then promote the remote tracker. Claims and open/closed state follow the promoted tracker; they are never reconciled by simultaneous dual writes.

When the inaccessible GitHub parent map currently known only as GitHub Issue 370 becomes available, capture its body, comments, labels, status, timestamps, child/dependency metadata, and attachments before editing it. Preserve its GitHub reference as an alias. If it has no portable ID, assign one in the reconciliation record, then have the maintainer classify it as the same record as, a predecessor or successor of, or distinct from any migrated record. Never match by title alone, overwrite either history automatically, or change its open/closed state without explicit human approval. Record the resulting relationship and keep exactly one active representation.
