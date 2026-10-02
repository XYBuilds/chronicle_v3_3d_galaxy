---
portable_id: tmc:chronicle:01M0WFG0000000000000000006
id: WFG-005
parent: ../map.md
type: wayfinder:grilling
status: closed
assignee: /root
blocked_by:
  - ./clarify-github-suspension-boundaries.md
  - ./compare-independent-development-hosts.md
---

# Choose the independent development control plane

## Question

Which managed platform should temporarily own the three private Git repositories, new Issues, and hosted CI while GitHub is unavailable, and what evidence would make that choice suitable for continued use after GitHub returns? Decide the account/namespace shape, repository ownership boundary, acceptable cost, and what must remain portable rather than platform-specific.

## Resolution comments

### 2026-08-18 — Resolved

[Host comparison evidence](../../../research/independent-git-issue-ci-hosts.md) — Select GitLab.com Free as the acceptance-gated temporary development control plane while GitHub is unavailable. Azure DevOps Services remains a contingency only if GitLab fails a reproducible core connectivity or hosted-runner requirement. Start free, cap ordinary control-plane spend at USD 10 per month, and do not buy Premium merely for native blocker links or additional CI capacity.

Use one maintainer-controlled GitLab account with three private projects directly in its personal namespace; do not create a group initially. This is an explicit simplicity choice. It accepts the remaining single-account lockout risk and the fact that project paths follow the username. Reconsider a group only if collaboration, shared group configuration, or an independent product namespace later earns the migration cost. GitLab documents private projects, [personal namespaces](https://docs.gitlab.com/user/namespace/), and [additional compute-minute purchases for personal namespaces](https://docs.gitlab.com/subscriptions/gitlab_com/compute_minutes/).

Sharing one development control plane does not change the repository responsibility boundary. Chronicle remains the product-control and cross-repository-contract owner; Chronicle, the OG Worker, and Daily Stargazing continue to own their repository-local implementation, tests, deployment, and delivery evidence. A change may touch more than one repository without transferring those responsibilities.

Admission is proven with one disposable, secret-free, agent-automated harness rather than a full recovery rehearsal. From the Windows workstation and MacBook it verifies clone, commit, push, and fetch against a private test project. It runs one representative non-deploying Node/Python CI job with a dummy secret and downloadable artifact, records elapsed and billed compute minutes, and creates then exports one labelled Issue carrying portable parent and `blocked_by` metadata. The human performs only identity-bound steps such as registration, CAPTCHA, email verification, 2FA and recovery-code custody, CLI/API authorization, payment approval, and—if the agent cannot access the MacBook—one generated command there. The later real migration must still compare promoted branch and tag refs for each repository.

Keep standard Git refs independently reproducible; keep stable Issue identity, parent, `blocked_by`, and decision text in Markdown-visible or API-exportable data; keep CI behavior in repository-owned scripts with thin provider adapters; keep the password manager as secrets authority; and keep durable release artifacts in the existing product storage rather than forge artifacts or caches.

When GitHub access returns, restore GitHub as the development primary. Retain GitLab only as a zero-cost cold backup and disaster-recovery endpoint: no normal schedules, no production-secrets authority, and no second live Issue tracker. Continued retention requires a successful repository sync followed by fresh-clone verification of the intended branches and tags for all three repositories, plus readable Issue exports. If GitLab ceases to be free or becomes a material maintenance burden, take and verify the final portable exports and then decommission it. The later long-term redundancy decision owns the exact synchronization mechanism, cadence, and failover drills.
