---
portable_id: tmc:chronicle:01M0WFG000000000000000000D
id: WFG-012
parent: ../map.md
type: wayfinder:grilling
status: closed
assignee: /root
blocked_by:
  - ./define-p0-restoration.md
  - ./design-p1-publication-control-plane.md
  - ./design-p2-recovery-path.md
  - ./design-long-term-redundancy.md
---

# Accept the ordered recovery and resilience specification

## Question

Does the integrated P0/P1/P2 specification have enough evidence, explicit dependencies, human risk declarations, protected surfaces, compatibility boundaries, rollback steps, verification gates, and implementation-Issue seams to hand off without hidden decisions? Confirm the first P0 action is the verified MacBook recovery copy and identify any remaining fog that belongs to a new effort rather than this destination.

## Resolution comments

### 2026-08-18 — Accepted and closed with explicit human approval

The maintainer accepted the integrated specification after a final evidence, dependency, compatibility, rollback, risk, verification, and implementation-seam grilling. The route is ready for implementation handoff without unresolved decision fog; this resolution authorizes no recovery execution by itself.

#### Ordered handoff and first protection outcome

- The first P0 execution slice is the recovery-snapshot slice. Bitwarden, restic, capacity, and SSH preparation occur inside it, and its first accepted recovery outcome is the fully checked, completely restored, zero-difference MacBook snapshot. No real forge project, live-secret migration, repository push, or production mutation precedes that acceptance.
- The unowned outbound-mirror trial is removed from P0 GitLab admission. Long-term mirroring has its own later controller admission and no restricted secondary GitHub account is used.
- One Chronicle-owned Recovery Initiative carries six current delivery Issues: common P0 protection/admission; Chronicle P0; OG Worker P0; Daily P0; Chronicle P1; and Chronicle P2. The order is common P0, Chronicle P0, Worker/Daily P0 in parallel, P1 only after all three development-resume gates, then P2.
- The Worker P0 Issue corrects its authoritative README so `.env` is a replaceable deployment copy rather than the secrets authority and rollback never restores the retired Today routes.

#### Compatibility, rollback, and verification acceptance

- Chronicle's global publication sequence replaces `GITHUB_RUN_NUMBER` in Daily/Monthly Data Release suffixes and the Monthly threshold label. Site attempts receive receipts without changing their selected Data Release, and `meta:G` plus manifest/Planet Export/Daily consumers retain opaque-string compatibility.
- P1 cannot use its first production mutation to create a missing Site Artifact registry. A missing or corrupt active artifact or verified rollback target is a hard stop requiring a separate recovery decision.
- The maintainer classifies P1 and P2 as R3 with canonical protected surfaces `publication`, `planet_export`, `og_worker`, and `daily`. Supabase, KV/checkpoint, R2, Cloudflare Pages, production secrets, and other concrete resources belong in declaration notes. Each first delivery runs complete R3 integration acceptance, including Planet Export-to-Daily and relevant OG Worker evidence, without expanding every ordinary publication smoke or manufacturing a Monthly/recovery mutation.
- P0 delivery Issues receive their human-declared tier and canonical surfaces only after their exact implementation scope is known; no path classifier or agent-invented declaration is permitted.

#### Remaining contingencies and future efforts

- GitHub Issue 370 is a conditional P0 reconciliation task using the already-decided capture-first, human-classified procedure. Live Cloudflare, Supabase, and credential state are implementation admission facts. Neither remains Wayfinder fog.
- If GitHub returns, development/publication cutback and `mirror-control` creation begin through a separate Cutback & Resilience Wayfinder effort. Monthly re-enable is a separate Chronicle effort and never occurs automatically with cutback.
- `mirror-control` is a formal fourth personal-infrastructure repository with portable key `mirror-control`, repository-owned delivery rules, a secret-free capability admission, and reciprocal GitHub/GitLab failure reporting. The target topology is decided here; its implementation is not.
- Permanent GitHub non-return, selection of a new cold endpoint, or GitLab replacement/decommission each opens a new Wayfinder effort. No contingency is silently promoted.

The maintainer reviewed these boundaries through two grilling rounds and explicitly instructed: **确认并关闭**.
