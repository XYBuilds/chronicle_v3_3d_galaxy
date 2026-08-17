---
id: WFG-008
parent: ../map.md
type: wayfinder:grilling
status: closed
assignee: /root
blocked_by:
  - ./define-complete-recovery-snapshot.md
  - ./choose-independent-control-plane.md
  - ./choose-secrets-authority.md
  - ./define-portable-issue-workflow.md
---

# Define the P0 repository and development restoration plan

## Question

What exact, reversible order restores independently backed-up Git repositories, private remotes, protected default branches, Issue-driven planning, agent instructions, and normal branch/review delivery for Chronicle, OG Worker, and Daily Stargazing? Define verification evidence, stop conditions, rollback, and the point at which each repository is safe to resume development.

## Resolution comments

### 2026-08-18 — Resolved

Restore development through common protection gates followed by one repository-local **development-resume gate** per repository. Chronicle crosses that gate first because it owns product coordination and the cross-repository Initiative; the OG Worker and Daily Stargazing may then cross their gates in parallel. A repository may resume Issue-owned branch and merge-request work as soon as its own gate passes, but cross-repository work waits for every affected repository. Deployment, publication, production secrets in CI, and scheduled jobs remain disabled until the later P1/P2 decisions authorize them.

P0 is a strict priority barrier for the recovery program: P1 does not begin until Chronicle, the OG Worker, and Daily Stargazing have all crossed their repository-local development-resume gates. This deliberately avoids restoring production publication while either consumer repository still lacks a recovered development and evidence path.

The [development-resume gate](../../../../CONTEXT.md) is deliberately small: prove the approved Git refs can be recovered from a private remote, prove `main` is protected, promote exactly one writable Issue tracker with current agent instructions, and complete one real automated non-deploying Issue-to-merge-request cycle with human merge approval. It does not claim that deployment or production recovery is ready.

#### Automation and human boundary

- Agents perform every non-identity-bound step that the platform permits: manifests and inventories without secret values, API configuration, repository creation after authorization, explicit-ref pushes, settings reads, normalized Issue export/import, relationship checks, CI adapters, tests, fresh clones, ref comparisons, `git fsck`, and evidence assembly.
- The maintainer performs registration, CAPTCHA or email verification, 2FA and recovery-code custody, vault unlock, entry of live secret values, payment approval if later required, the required R0–R3/protected-surface declaration, visual review where a declared surface requires it, and final merge/Issue-closure approval.
- A human is not asked to repeat an automatable test. If identity or device access makes one command unavoidably manual, the agent generates the exact command and validates its returned evidence.

#### Exact recovery order

1. **Begin the first recovery-snapshot slice without touching a forge.** Set up Bitwarden Free, prove synthetic password-protected export/import, create the offline recovery record, generate the restic password, verify MacBook capacity, verify the Mac SSH host key locally, and pin/checksum restic. These are internal prerequisites of the first P0 slice; the first accepted P0 recovery outcome is the verified MacBook snapshot in the next step. Do not create real GitLab projects, migrate live secrets, push repository objects, run Git maintenance, or change production before that snapshot is accepted.
2. **Create and accept the joint recovery snapshot.** Follow [Define the complete recovery snapshot and its proof](./define-complete-recovery-snapshot.md): freeze every repository writer; preserve the three complete worktrees plus all three physical Git stores, including Daily's external gitdir; run the encrypted restic backup, `check --read-data`, complete Mac restore, zero-difference manifest comparison, and restored-store Git integrity checks; then write the sanitized receipt. Any failure is a common hard stop. Release the write freeze only after acceptance.
3. **Finish the P0 secrets-authority migration.** After the snapshot protects the source copies and before a real repository enters GitLab, inventory credential names and consumers, have the maintainer enter live values directly into Bitwarden, check completeness without exposing values to agents, and create the password-protected MacBook export and sealed paper recovery material required by [Choose the secrets authority and recovery model](./choose-secrets-authority.md). Do not copy Cloudflare, Supabase, Kaggle, domain, or deployment credentials into GitLab CI during P0.
4. **Admit GitLab with disposable data.** Run the secret-free two-machine acceptance harness from [Choose the independent development control plane](./choose-independent-control-plane.md): private test project; Windows and Mac web/Git/API connectivity; representative transfer; one non-deploying Node/Python pipeline; dummy protected variable and artifact; portable parent/blocker Issue export; and public read-only endpoint checks. Record elapsed and billed compute. There is no P0 outbound-mirror trial because no independent target has been selected and the restricted secondary GitHub account is unavailable for that role. No real repository or live secret crosses this gate.
5. **Restore Chronicle first.** Create a private project in the maintainer's personal GitLab namespace and add it locally as `gitlab-candidate`, leaving the suspended GitHub remote named `origin`. From the accepted frozen evidence, review for secrets and push only the approved `main`, formal tags, and Issue-owned active branches with explicit refspecs—never `--mirror`. Set the default branch to `main`, disable force push and direct default-branch push, and verify the settings through the API. Import the local Wayfinder map/tickets and their resolution context with portable identities, verify a normalized export and complete local render, freeze the local tracker, and only then promote GitLab as the sole writable tracker. Create the Chronicle P0 implementation Issue under the product-level recovery Initiative.
6. **Use the Chronicle P0 implementation Issue for the one bootstrap merge request.** Its branch updates the permanent `CONTEXT.md`, `AGENTS.md`, Issue-tracker guidance, and thin GitLab non-deploying CI adapter. The temporary `docs/wayfinder/` tracker and its `docs/research/` source files migrate into the remote Issue record and encrypted recovery archive; they do not become a second live or committed tracker on `main`. The agent runs Chronicle test, lint, build, the documentation-authority check required by the changed scope, and `git diff --check`; GitLab records the green pipeline; the maintainer approves the declared risk and merges. The agent then fresh-clones to an empty directory, compares the approved branches/tags and `main` object ID with acquisition evidence, and runs `git fsck`. Chronicle may resume repository-local development when every gate item passes.
7. **Restore the OG Worker and Daily Stargazing in parallel.** For each, create a private candidate project, explicitly set/protect `main`, push only reviewed refs, create one repository-owned P0 implementation Issue with its portable parent link, and use its bootstrap merge request to install the minimal root agent instructions, current GitLab Issue guidance, and thin non-deploying CI. The Worker P0 Issue also corrects its authoritative README so `.env` is a replaceable Bitwarden deployment copy rather than the secrets authority and so Worker rollback never restores the retired Today routes. The Worker gate runs `npm test` and `npm run typecheck`; its secret-bearing `npm run dry-run` waits for the appropriate scoped deployment copy and is not a P0 development gate. The Daily gate runs `python -m pytest tests`; its fresh clone must be a normal self-contained Git repository and therefore also proves that future development no longer depends on accidentally copying only the old `T:` worktree without its external gitdir. Each repository gets its own fresh-clone/ref/`git fsck` proof and may resume independently when green.
8. **Close P0 coordination without claiming operational recovery.** Verify the Chronicle Initiative indexes the titled repository implementation Issues and that every portable parent/child reference resolves. Cross-repository development may begin only when every participating repository has passed its gate. P1 remains blocked until all three repository gates pass. Keep all production deploy jobs, schedules, and secret-bearing CI disabled for [Design the P1 Chronicle publication control plane](./design-p1-publication-control-plane.md) and [Design the P2 Monthly and Production Recovery path](./design-p2-recovery-path.md).

#### Recovery Initiative and implementation-Issue seams

Before any P0 operation, the active local tracker records one Chronicle-owned **Recovery Initiative** and one **P0 Common Protection and GitLab Admission** Issue. Creating those records is administrative handoff preparation rather than a recovery mutation. The common Issue owns steps 1–4, their human risk declaration, stop decisions, and sanitized evidence; both records migrate to GitLab with their portable identities when the tracker transition gate passes.

The current recovery handoff contains exactly these six delivery Issues under that parent Initiative:

1. P0 Common Protection and GitLab Admission;
2. Chronicle P0 repository restoration;
3. OG Worker P0 repository restoration;
4. Daily Stargazing P0 repository restoration;
5. Chronicle P1 publication-control restoration; and
6. Chronicle P2 Monthly-suspension and Production-Recovery migration.

The dependency order is common P0, then Chronicle P0, then the Worker and Daily P0 Issues in parallel, then Chronicle P1, then Chronicle P2. The parent owns the compatibility window, rollback coordination, integration evidence, and final human closure approval. Each repository Issue owns its branch, tests, merge request, deployment boundary, evidence, and separate human risk/merge/closure approvals. P1 and P2 obtain consumer evidence through owner-check handoffs; they do not create empty Worker or Daily Issues when those repositories require no change.

#### Ref and history boundary

- The encrypted recovery snapshot is the complete physical preservation authority. It keeps stash, reflogs, reflog-only and dangling objects, Codex refs, ignored operational data, and unclassified WIP without forcing classification.
- A forge receives only reviewed ordinary development refs. Do not push remote-tracking refs, stash, provider/Codex refs, dangling objects, or an entire physical ref namespace. Chronicle's current recovery documentation and glossary work is preserved by the snapshot; only the accepted durable terminology and permanent operating guidance enter the bootstrap merge request.
- Before any real push, scan the intended reachable history for secret material. A finding stops that repository. Rotate a credential only when the evidence meets the triggers in [Choose the secrets authority and recovery model](./choose-secrets-authority.md), and decide any history rewrite explicitly; never rewrite merely to make migration look clean.
- The locally observed `main` branches matched their last cached GitHub remote-tracking refs when this plan was made, but that cannot prove GitHub had no server-only changes. This uncertainty does not block recovery. Record the frozen object IDs and cached-ref timestamps; if GitHub returns, fetch/capture its state into isolated recovery refs and reconcile it with human approval rather than overwriting GitLab history or Issue state.

#### Repository development-resume gate and evidence

A repository is safe to resume development only when one sanitized evidence bundle proves all four items:

1. **Code recovery:** project visibility is private; the intended explicit refs exist; a fresh clone reproduces the approved `main` and tag object IDs; `git fsck` succeeds; and there are zero unexpected or missing promoted refs.
2. **Default-branch control:** `main` is the declared default; force push and direct push are disabled; protected-branch settings are captured through API output; and the bootstrap change entered through a branch and merge request rather than a direct default-branch write.
3. **One work authority:** GitLab is the sole writable tracker; the P0 implementation Issue has a portable identity, titled parent reference, explicit risk declaration, and current repository agent/tracker instructions; the frozen predecessor and normalized export are checksum-verifiable recovery material rather than live copies.
4. **One automated delivery cycle:** the repository's minimal non-deploying pipeline passes on the bootstrap merge request, the maintainer records human approval, the merge completes without bypassing protection, and the post-merge fresh-clone proof passes.

The evidence bundle records the recovery-snapshot receipt identifier, tool versions, source and remote ref manifests, sanitized project visibility/default/protection settings, tracker export-manifest hash and portable identities, CI pipeline and merge-request references, declared risk/protected surfaces, human approval, test results, clone object IDs, `git fsck` result, UTC times, and any accepted residual uncertainty. It contains no secret values, sensitive per-file inventory, tokens, or `.env` content.

No second reviewer, synthetic second merge request, production smoke, scheduled job, full deployment harness, or secret-bearing CI run is required merely to cross this gate. Later repository work still runs every check required by its own scope and risk declaration.

#### Promotion, stops, and rollback

- While a repository is being tested, GitLab remains `gitlab-candidate` and GitHub remains `origin`; the candidate is not authoritative merely because objects were uploaded. After the repository passes its gate, rename GitHub to `github-suspended` and promote GitLab to `origin`. Keep the suspended URL as an alias for later capture and reconciliation.
- Snapshot failure, incomplete vault recovery, or GitLab admission failure stops all real migration. A reproducible GitLab failure may trigger an equivalent Azure DevOps trial, but no real repository is uploaded there until [Choose the independent development control plane](./choose-independent-control-plane.md) and [Define the portable Issue-driven workflow](./define-portable-issue-workflow.md) are reopened and resolved for the changed platform.
- Non-private visibility, an unreviewed ref, secret-scan evidence, ref/hash mismatch, inability to enforce or verify `main` protection, dual-writable trackers, incomplete portable relationships/export, failed CI, bypassed human approval, failed fresh clone, or Git integrity error stops only the affected repository after the common gates have passed. Its dependent cross-repository work also remains stopped; already accepted repositories do not roll back.
- On a repository-local failure, freeze new work, leave the candidate non-authoritative, preserve every local ref and the accepted restic repository, and correct the cause from the last passed gate. Do not delete the source, run `gc`/`repack`/`prune`, rewrite refs, or remove the recovery archive as cleanup.
- If failure occurs after tracker or remote promotion but before development resumes, freeze writes again, demote the candidate remote name, and promote the newest verified normalized Issue export as the sole writable local tracker with a recorded failover time. Never repair the situation through simultaneous writes. After a repository has resumed, ordinary code regressions use Issue-owned revert merge requests; provider-wide failover and long-term mirror behavior belong to [Design the long-term mirror and failover topology](./design-long-term-redundancy.md).
