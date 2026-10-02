# Compare independent Git, Issue, CI, and mirror hosts



Source: https://gitlab.com/yixie.ixd/chronicle_v3_3d_galaxy/-/work_items/13

State at capture: **closed**

Original author: @yixie.ixd

Created: 2026-08-18T09:52:45.773Z; updated: 2026-08-18T09:52:47.044Z



Labels at capture: (none)

Assignees at capture: (none)

## Original body



**Portable ID:** `tmc:chronicle:01M0WFG0000000000000000003`
**Parent:** Restore development and operations without a GitHub account single point of failure (`tmc:chronicle:01M0WFG0000000000000000001`)
**Blocked by:** None
**Local state:** closed
# Compare independent Git, Issue, CI, and mirror hosts

## Question

Using current first-party documentation and pricing, compare managed hosts suitable for this personal three-repository project. Evaluate GitLab.com, Codeberg, Bitbucket Cloud, and any materially stronger candidate against private repositories, public-readiness, Issues with labels and dependency/child representation, hosted CI schedules and Windows/Linux constraints, artifacts/caches/secrets, repository and Issue export, push mirroring, API/CLI automation, cost, and mainland-China operational caveats that official sources can substantiate. Recommend the smallest viable shortlist; do not recommend a self-hosted forge.

## Resolution comments

### 2026-08-17 — Resolved

[Research evidence](../../../research/independent-git-issue-ci-hosts.md) — GitLab.com is the recommended primary acceptance-trial candidate because it is the only reviewed managed service that fits private-to-public Git, Issue hierarchy, scheduled hosted CI, artifacts/caches/secrets, project export, API/CLI automation, and Free-tier outbound push mirroring in one control plane. Azure DevOps Services is the private-only contingency if GitLab fails a two-machine connectivity or runner trial. Codeberg does not fit the private repository size/mission and hosted-CI requirements; Bitbucket Cloud does not fit the Issue model, CI allowance, or managed-mirroring requirement. Selection remains gated on a disposable, secret-free trial and measured CI minutes.

## Resolution comments

### 2026-08-17 — Resolved

[Research evidence](../../../research/independent-git-issue-ci-hosts.md) — GitLab.com is the recommended primary acceptance-trial candidate because it is the only reviewed managed service that fits private-to-public Git, Issue hierarchy, scheduled hosted CI, artifacts/caches/secrets, project export, API/CLI automation, and Free-tier outbound push mirroring in one control plane. Azure DevOps Services is the private-only contingency if GitLab fails a two-machine connectivity or runner trial. Codeberg does not fit the private repository size/mission and hosted-CI requirements; Bitbucket Cloud does not fit the Issue model, CI allowance, or managed-mirroring requirement. Selection remains gated on a disposable, secret-free trial and measured CI minutes.



## Original notes
