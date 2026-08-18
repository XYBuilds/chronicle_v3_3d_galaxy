# 01 — P0 Common Protection and GitLab Admission

**Portable ID:** `tmc:chronicle:01M09Y4T00V0P1XJFNPFGE2QDV`

**Parent:** [Restore development and operations without a GitHub account single point of failure](../spec.md) (`tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q`)

**What to build:** Give the maintainer one proven recovery baseline before anything moves: a recoverable secrets authority, a complete encrypted MacBook snapshot of all three repositories and their non-Git operational state, and a disposable-data proof that GitLab can serve as the temporary development control plane. The completed slice must make it safe to begin real repository restoration without having pushed source, copied production secrets into CI, or changed production.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent
**Assignee:** PEXY98

**Risk declaration:** R0; protected surfaces none. Machine-readable copy: `scripts/recovery/fixtures/risk-declaration.template.json`.

```json
{
  "schema": "chronicle-risk-declaration-v1",
  "tier": "R0",
  "surfaces": [],
  "notes": "Issue 01 exact scope after review: Bitwarden Free as secrets authority, one verified MacBook restic snapshot of Chronicle / OG Worker / Daily including Daily's external Git store, then disposable private GitLab admission. No production mutation, no real repository push, no production secrets in CI, and no change to visual output, browser journeys, publication, Planet Export, OG Worker runtime, or Daily editorial/publication behavior. P1 and P2 remain separately declared R3 with publication, planet_export, og_worker, and daily."
}
```

- [x] The maintainer records the Issue's R0–R3 tier and canonical protected surfaces after reviewing the exact execution scope; no automated path classifier supplies the declaration.
- [x] Bitwarden Free is configured as the secrets authority, and a synthetic password-protected export/import drill proves record equality without using live credentials.

  Evidence: `python scripts/recovery/cli.py synthetic-vault --records scripts/recovery/fixtures/synthetic-vault-records.json` returned `{"count": 2, "equal": true}` on 2026-08-18. Sanitized gate: `bitwarden_synthetic_drill.ok=true`, `count=2`. Live values were not used.
- [x] The independent vault recovery material and restic recovery credentials are prepared without placing live values in agent context, chat, logs, screenshots, repository content, command arguments, or persistent plaintext files.

  Evidence: maintainer confirmed the sealed paper record on 2026-08-18. restic repository ID `da8038c190` was created. No live password values were placed in agent context.
- [x] MacBook capacity, pinned restic binaries and checksums, Mac SSH host identity, fixed source roots, and the fixed exclusion policy are verified before repository writers are frozen.

  Evidence recorded 2026-08-18 (sanitized): restic 0.19.1 on windows/amd64 (`C:\Users\pexy9\.local\bin\restic.exe` SHA-256 `B0DD1FD21EEA5D8FE1325F55F7118213C21F36DE8A261E04C0624A5AB9FD7830`) and darwin/arm64 (`/Users/pexy/.local/bin/restic` SHA-256 `06582569ff2f10e1935a6f12187c76db02f0bae99e6e54098f2cdc374766d768`); Mac Data volume about 313 Gi available vs about 15 Gi combined source roots; four roots present (`chronicle`, `og-worker`, `daily-worktree`, `daily-gitdir`); exclusion policy `tmc-p0-exclusion-v1`; Mac Remote Login on at `192.168.1.110`; Windows `known_hosts` ED25519 fingerprint equals Mac-local `SHA256:GumwrzSZuJOZNdlyUKeBX6PfR3vvrMOAPB4zH3P6xAM`. Writers are not frozen yet.
- [x] One encrypted acquisition preserves the complete Chronicle, OG Worker, and Daily Stargazing worktrees and physical Git stores, including Daily's external Git store, ignored operational data, and unclassified recovery objects.

  Evidence: restic repository `da8038c190`, snapshot `9938a021`, tag `github-account-outage-pre-migration`, 19192 files processed (19164 source files plus 28 acquisition-evidence files), `files_changed=0`.
- [x] Any unreadable source, missing root, source mutation, unresolved external Git store, capacity error, incomplete backup, or changed manifest rejects the joint snapshot rather than accepting a partial result.

  Evidence: backup completed with no incomplete status; source-file count matched the acquisition manifest; the extra 28 files were the evidence directory.
- [x] The restic repository passes a full-data integrity check, then the complete snapshot is restored into a new MacBook location and compared with zero missing, extra, type-changed, link-changed, size-changed, or content-changed entries.

  Evidence: `restic check --read-data` reported no errors; restore compared equal after recreating two empty excluded Chronicle directories (`frontend/dist`, `frontend/storybook-static`) that restic omit because of `--exclude`. Residual: those two directory nodes are excluded build-output roots, not missing recovered files.
- [x] All restored Git stores pass full strict integrity checks and reproduce the recorded refs, stash, reflog-only, and unreachable-object evidence; Daily is explicitly paired with its restored external Git store for verification.

  Evidence: chronicle, og-worker, and daily-worktree all `fsck_ok`, `head_match`, `ref_count_match`, and `stash_count_match`; Daily used the restored external gitdir, not the Windows `.git` pointer.
- [x] A sanitized acceptance receipt records aggregate identities, versions, counts, evidence hashes, and pass/fail results without exposing secret values, sensitive paths, per-file hashes, or object inventories; Mac Remote Login is disabled after acceptance.

  Receipt: snapshot `9938a021`, tree `6269a4ffdf3ad4809eb116530942a84d5e4a8287b987e7a7c4d8cce132300a19`, `check_read_data=pass`, `restore_compare=pass`, `git_integrity=pass`, `file_count=19164`, `evidence_bundle_hash=7c033f0dbfed108d55c6062055cab9b9475435a4f236b79047f3cf516db18956`. Maintainer exception 2026-08-18: Mac Remote Login stays enabled for ongoing LAN use after host-key verification; this is residual uncertainty, not a failed snapshot. Write freeze released after receipt.
- [x] Only after snapshot acceptance, the maintainer completes the live Bitwarden migration locally and creates the required password-protected MacBook export and sealed offline recovery record; agents verify completeness by names and consumers only.

  Evidence recorded 2026-08-18 (names and consumers only; no values): Mac `bw list items` returned 22 item names, including `MIMO_API_KEY` and `TMDB_API_KEY`. Required live consumers covered: Chronicle/Daily Supabase and Kaggle; Cloudflare account/token, OG KV, R2 five-item set, and Web Analytics; Daily MIMO/TMDB; restic snapshot recovery item. Maintainer confirmed a password-protected MacBook export at `~/recovery/bitwarden-vault-password-protected.json` (file not inspected). Sealed paper recovery material was already confirmed. Residuals: `DEEPSEEK_API_KEY` unused and absent; inventory name `KAGGLE_KEY` is live `KAGGLE_API_KEY`; extra names `CLOUDFLARE_PAGES_PROJECT_NAME`, `MIMO_BASE_URL`, `MIMO_MODEL`, `GUARDIAN_API_KEY`, `GUARDIAN_API_KEY_BACKUP`. `live_vault_completeness.name_count=22`.
- [x] A disposable private GitLab project proves Windows and Mac web/Git/API connectivity, clone/commit/push/fetch, one representative non-deploying Node/Python pipeline, a dummy protected value, a downloadable artifact, and portable parent/blocker Issue export and local rendering.

  Evidence recorded 2026-08-18 (sanitized): private project `yixie.ixd/tmc-p0-admission` (id 85504604). Unauthenticated web `302` to sign-in and API `404`. Windows push `53f5860`; Mac clone/commit/push `a4f7e45`; Windows fetch fast-forwarded to `a4f7e45`. `main` protected (Maintainers only, force push disabled). Protected masked CI variable `ADMISSION_DUMMY` only. Pipelines `#2` `2768460489` and `#3` `2768472925` both success with `node_test` and `python_test`; `node_test` artifact `admission.txt`. Portable Issue https://gitlab.com/yixie.ixd/tmc-p0-admission/-/work_items/1 locally rendered parent `tmc:chronicle:01M08QA80S7XA8P5ZVKM3EVD8Q`, blocked by none. `python scripts/recovery/cli.py admit-plan` accepted. No real product repository was pushed.
- [x] GitLab elapsed and billed compute usage is recorded, every tested project remains private, and no real repository, live production credential, deployment job, schedule, or production mutation crosses the admission gate.

  Evidence: pipeline wall time 27s + 32s = `compute_seconds=59`; GraphQL `ciMinutesUsage` for 2026-08 = **1 billed minute**. Visibility remained private. No production credential names in CI variables. No deploy job and no schedule. Pipeline `#1` `2768430669` failed before identity verification with zero jobs; recorded as residual, not a passing run.
- [x] The sanitized evidence bundle identifies every passed gate and residual uncertainty, and explicit human approval admits GitLab for the next ticket.

  Evidence recorded 2026-08-18: maintainer explicitly approved GitLab as the temporary development control plane for Issue 02. `python scripts/recovery/cli.py evidence --approve-gitlab` produced `gitlab_admitted=true` at `C:\Users\pexy9\recovery\tmc-p0-admission-evidence.json`. Residual uncertainty recorded: GitHub server-only state unknown; Mac Remote Login left enabled for LAN use; two empty excluded Chronicle dirs recreated on restore; secrets inventory name drift (`KAGGLE_API_KEY` vs `KAGGLE_KEY`, unused `DEEPSEEK_API_KEY` absent); GitLab pipeline `#1` `2768430669` failed before identity verification with zero jobs. Human merge and Issue closure remain required.

