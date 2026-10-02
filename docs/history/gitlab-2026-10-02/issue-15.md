# Define the complete recovery snapshot and its proof



Source: https://gitlab.com/yixie.ixd/chronicle_v3_3d_galaxy/-/work_items/15

State at capture: **closed**

Original author: @yixie.ixd

Created: 2026-08-18T09:52:50.613Z; updated: 2026-08-18T09:52:52.566Z



Labels at capture: wayfinder:grilling

Assignees at capture: (none)

## Original body



**Portable ID:** `tmc:chronicle:01M0WFG0000000000000000005`
**Parent:** Restore development and operations without a GitHub account single point of failure (`tmc:chronicle:01M0WFG0000000000000000001`)
**Blocked by:** Compare personal secrets primary stores (`tmc:chronicle:01M0WFG0000000000000000004`)
**Local state:** closed
# Define the complete recovery snapshot and its proof

## Question

What exact snapshot format, inclusion boundary, encryption boundary, checksums, copy procedure, and restore test prove that Chronicle, OG Worker, and Daily Stargazing are protected before migration? The answer must preserve full Git stores—including Chronicle's local-only objects and Daily's external gitdir—plus required ignored operational data, while keeping plaintext secrets out of ordinary repository mirrors. It must not require up-front classification of stash, reflog, dangling WIP, or Codex refs.

## Resolution comments

### 2026-08-18 — Resolved

Use one client-side-encrypted restic repository on the maintainer's MacBook and create one jointly accepted pre-migration snapshot for Chronicle, OG Worker, and Daily Stargazing. This **recovery snapshot** is a physical preservation boundary, not an ordinary Git mirror: it keeps the complete local recovery state, while later forge repositories receive only reviewed refs and never receive plaintext secret files.

#### Preservation and mirror boundaries

- Preserve Chronicle's complete worktree and `E:\projects\chronicle_v3_3d_galaxy\.git\`.
- Preserve the OG Worker's complete worktree and `E:\projects\themoviecosmos-og-worker\.git\`.
- Preserve Daily's complete worktree at `\\192.168.1.110\Hermes_Workspace\themoviecosmos-daily-stargazing\` (normally mounted as `T:\themoviecosmos-daily-stargazing\`), including its `.git` pointer file, and separately preserve its actual Git store at `C:\Users\pexy9\.git-dirs\themoviecosmos-daily-stargazing\`.
- Physical Git-store preservation includes every ref namespace, stash, reflog, index, loose and packed object, reflog-only object, unreachable/dangling object, and Codex ref. No object-by-object classification or promotion is required before the snapshot.
- Preserve every other tracked, untracked, and ignored file, including `.env`, `.dev.vars`, local operational state, raw/index/output/run data, `.tmp`, `.wrangler`, editor metadata, logs, evidence, and the untracked outage-recovery map.
- The fixed exclusion manifest may remove only reproducible dependencies, interpreter/test caches, and build output: every `node_modules/`, `.venv/`, `venv/`, `__pycache__/`, `.pytest_cache/`, Python bytecode, Vite cache, Chronicle `frontend/dist/` and `frontend/storybook-static/`, and OG Worker `dist/`. No operator may add an exclusion to make the copy fit; insufficient capacity or an unreadable source stops the snapshot.
- A later ordinary remote is populated only from explicitly reviewed Git refs. Reflogs, dangling objects, stash, Codex refs, ignored data, and secret-bearing files remain in the encrypted recovery snapshot unless a later P0 decision explicitly promotes a ref after review.

#### Encryption and access

- restic encrypts and authenticates the repository on Windows before SFTP transport; no plaintext staging directory is created on either machine.
- Use one high-entropy, randomly generated restic password. Its primary copy lives in the personal secrets authority selected by [Choose the secrets authority and recovery model](./choose-secrets-authority.md); the identical password has one physically separate offline recovery copy. Do not place it in a command argument, environment variable, repository file, evidence log, or persistent plaintext password file. Enter or paste it only through restic's interactive password prompt.
- Loss of both password copies makes the snapshot unrecoverable. Loss of the MacBook copy leaves only the still-existing sources until the later long-term-redundancy decision creates another ciphertext copy; these are accepted residual risks for this first personal-project snapshot.
- Use the maintainer's existing Mac account rather than creating a dedicated account. macOS Remote Login is temporarily enabled for only that account, without Full Disk Access. Verify the SSH host-key fingerprint locally on the Mac before first connection, write only to a new recovery directory under that account, and disable Remote Login after acceptance.

#### Acquisition procedure and hard stops

1. Confirm Mac free space covers the encrypted repository plus a complete temporary restore. Install a pinned restic release on Windows and macOS and record the versions and binary SHA-256 values.
2. Freeze all repository writers: editors, agents, scheduled/local pipelines, and Git-mutating commands. Do not run `git gc`, `repack`, `prune`, reflog expiry, stash cleanup, or ref cleanup.
3. Materialize the fixed source-root and exclusion manifests. Record UTC acquisition time and encrypted evidence for each repository: resolved worktree/gitdir/common-dir paths, HEAD and branch, worktrees, all refs and their object IDs, stash entries, porcelain status, object counts, reflog-only and unreachable/dangling inventories, and `git fsck --full --strict` results. Record object IDs and digests without inspecting or classifying their contents.
4. While the freeze remains in force, calculate an encrypted source manifest covering the four source roots. It contains the logical source label, normalized relative path, entry type, symlink target where applicable, byte size, and SHA-256 for every included regular file under those roots. Create a separate evidence index containing the size and SHA-256 of every other acquisition-evidence file; the evidence index does not list itself. File paths and hashes for secret-bearing files never appear in the public receipt.
5. Initialize one restic repository over SFTP in the new Mac recovery directory, then create one snapshot containing all four source roots plus the finalized acquisition-evidence directory. Give it the fixed tag `github-account-outage-pre-migration` and record its UTC timestamp, snapshot ID, tree ID, source paths, file/byte totals, exclusion-manifest hash, evidence-index hash, and exit status.
6. A nonzero or incomplete backup status, any unreadable file, a source mutation warning, changed manifest, missing source root, unresolved external gitdir, or capacity failure rejects the entire snapshot. Partial success for one or two repositories is not acceptance; correct the cause and create a new joint snapshot while retaining the freeze.
7. Run `restic check --read-data` against the Mac repository. Any metadata, pack, authentication, or data-read error rejects the snapshot.

#### Restore proof and release gate

1. On the Mac, unlock the repository using the offline copy of the same restic password and restore the complete joint snapshot into a new empty directory on the Mac's local filesystem.
2. Recalculate the full file/type/symlink SHA-256 manifest and compare it with the encrypted acquisition manifest. The comparison must have zero missing, extra, type-changed, target-changed, size-changed, or content-changed entries.
3. Before any command can refresh a restored index, compare the restored Git-store file hashes and the normalized ref, stash, reflog-only, and unreachable/dangling evidence with acquisition. Run `git fsck --full --strict` on all three restored stores. For Daily, explicitly pair the restored external gitdir and restored worktree; do not rely on the restored Windows absolute path in the `.git` pointer.
4. A restore warning, checksum difference, Git integrity error, missing ref/stash/object class, or inability to open ignored operational data rejects the snapshot. Sampling is not an acceptable substitute.
5. After every gate passes, write a sanitized receipt containing only the UTC times, tool versions, snapshot and tree IDs, source labels, aggregate counts, exclusion-policy identifier, check/restore pass results, and evidence-bundle hash. It contains no secret values, sensitive paths, per-file hashes, or object inventory.
6. Disable Mac Remote Login and release the repository write freeze only after the receipt is complete. The temporary restored tree may then be removed after evidence review; retain the restic repository unchanged, and do not run `forget` or `prune` before the later retention decision.

The implementation may use the documented restic [SFTP backend](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html), [full repository check and restore workflow](https://restic.readthedocs.io/en/stable/010_introduction.html), and authenticated content-addressed repository format described in the [restic design](https://restic.readthedocs.io/en/stable/design.html). macOS access follows Apple's [Remote Login guidance](https://support.apple.com/guide/mac-help/allow-a-remote-computer-to-access-your-mac-mchlp1066/mac). Git proof follows the official [`git fsck`](https://git-scm.com/docs/git-fsck) reachability boundary and [`git reflog`](https://git-scm.com/docs/git-reflog) recovery semantics.

## Resolution comments

### 2026-08-18 — Resolved

Use one client-side-encrypted restic repository on the maintainer's MacBook and create one jointly accepted pre-migration snapshot for Chronicle, OG Worker, and Daily Stargazing. This **recovery snapshot** is a physical preservation boundary, not an ordinary Git mirror: it keeps the complete local recovery state, while later forge repositories receive only reviewed refs and never receive plaintext secret files.

#### Preservation and mirror boundaries

- Preserve Chronicle's complete worktree and `E:\projects\chronicle_v3_3d_galaxy\.git\`.
- Preserve the OG Worker's complete worktree and `E:\projects\themoviecosmos-og-worker\.git\`.
- Preserve Daily's complete worktree at `\\192.168.1.110\Hermes_Workspace\themoviecosmos-daily-stargazing\` (normally mounted as `T:\themoviecosmos-daily-stargazing\`), including its `.git` pointer file, and separately preserve its actual Git store at `C:\Users\pexy9\.git-dirs\themoviecosmos-daily-stargazing\`.
- Physical Git-store preservation includes every ref namespace, stash, reflog, index, loose and packed object, reflog-only object, unreachable/dangling object, and Codex ref. No object-by-object classification or promotion is required before the snapshot.
- Preserve every other tracked, untracked, and ignored file, including `.env`, `.dev.vars`, local operational state, raw/index/output/run data, `.tmp`, `.wrangler`, editor metadata, logs, evidence, and the untracked outage-recovery map.
- The fixed exclusion manifest may remove only reproducible dependencies, interpreter/test caches, and build output: every `node_modules/`, `.venv/`, `venv/`, `__pycache__/`, `.pytest_cache/`, Python bytecode, Vite cache, Chronicle `frontend/dist/` and `frontend/storybook-static/`, and OG Worker `dist/`. No operator may add an exclusion to make the copy fit; insufficient capacity or an unreadable source stops the snapshot.
- A later ordinary remote is populated only from explicitly reviewed Git refs. Reflogs, dangling objects, stash, Codex refs, ignored data, and secret-bearing files remain in the encrypted recovery snapshot unless a later P0 decision explicitly promotes a ref after review.

#### Encryption and access

- restic encrypts and authenticates the repository on Windows before SFTP transport; no plaintext staging directory is created on either machine.
- Use one high-entropy, randomly generated restic password. Its primary copy lives in the personal secrets authority selected by [Choose the secrets authority and recovery model](./choose-secrets-authority.md); the identical password has one physically separate offline recovery copy. Do not place it in a command argument, environment variable, repository file, evidence log, or persistent plaintext password file. Enter or paste it only through restic's interactive password prompt.
- Loss of both password copies makes the snapshot unrecoverable. Loss of the MacBook copy leaves only the still-existing sources until the later long-term-redundancy decision creates another ciphertext copy; these are accepted residual risks for this first personal-project snapshot.
- Use the maintainer's existing Mac account rather than creating a dedicated account. macOS Remote Login is temporarily enabled for only that account, without Full Disk Access. Verify the SSH host-key fingerprint locally on the Mac before first connection, write only to a new recovery directory under that account, and disable Remote Login after acceptance.

#### Acquisition procedure and hard stops

1. Confirm Mac free space covers the encrypted repository plus a complete temporary restore. Install a pinned restic release on Windows and macOS and record the versions and binary SHA-256 values.
2. Freeze all repository writers: editors, agents, scheduled/local pipelines, and Git-mutating commands. Do not run `git gc`, `repack`, `prune`, reflog expiry, stash cleanup, or ref cleanup.
3. Materialize the fixed source-root and exclusion manifests. Record UTC acquisition time and encrypted evidence for each repository: resolved worktree/gitdir/common-dir paths, HEAD and branch, worktrees, all refs and their object IDs, stash entries, porcelain status, object counts, reflog-only and unreachable/dangling inventories, and `git fsck --full --strict` results. Record object IDs and digests without inspecting or classifying their contents.
4. While the freeze remains in force, calculate an encrypted source manifest covering the four source roots. It contains the logical source label, normalized relative path, entry type, symlink target where applicable, byte size, and SHA-256 for every included regular file under those roots. Create a separate evidence index containing the size and SHA-256 of every other acquisition-evidence file; the evidence index does not list itself. File paths and hashes for secret-bearing files never appear in the public receipt.
5. Initialize one restic repository over SFTP in the new Mac recovery directory, then create one snapshot containing all four source roots plus the finalized acquisition-evidence directory. Give it the fixed tag `github-account-outage-pre-migration` and record its UTC timestamp, snapshot ID, tree ID, source paths, file/byte totals, exclusion-manifest hash, evidence-index hash, and exit status.
6. A nonzero or incomplete backup status, any unreadable file, a source mutation warning, changed manifest, missing source root, unresolved external gitdir, or capacity failure rejects the entire snapshot. Partial success for one or two repositories is not acceptance; correct the cause and create a new joint snapshot while retaining the freeze.
7. Run `restic check --read-data` against the Mac repository. Any metadata, pack, authentication, or data-read error rejects the snapshot.

#### Restore proof and release gate

1. On the Mac, unlock the repository using the offline copy of the same restic password and restore the complete joint snapshot into a new empty directory on the Mac's local filesystem.
2. Recalculate the full file/type/symlink SHA-256 manifest and compare it with the encrypted acquisition manifest. The comparison must have zero missing, extra, type-changed, target-changed, size-changed, or content-changed entries.
3. Before any command can refresh a restored index, compare the restored Git-store file hashes and the normalized ref, stash, reflog-only, and unreachable/dangling evidence with acquisition. Run `git fsck --full --strict` on all three restored stores. For Daily, explicitly pair the restored external gitdir and restored worktree; do not rely on the restored Windows absolute path in the `.git` pointer.
4. A restore warning, checksum difference, Git integrity error, missing ref/stash/object class, or inability to open ignored operational data rejects the snapshot. Sampling is not an acceptable substitute.
5. After every gate passes, write a sanitized receipt containing only the UTC times, tool versions, snapshot and tree IDs, source labels, aggregate counts, exclusion-policy identifier, check/restore pass results, and evidence-bundle hash. It contains no secret values, sensitive paths, per-file hashes, or object inventory.
6. Disable Mac Remote Login and release the repository write freeze only after the receipt is complete. The temporary restored tree may then be removed after evidence review; retain the restic repository unchanged, and do not run `forget` or `prune` before the later retention decision.

The implementation may use the documented restic [SFTP backend](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html), [full repository check and restore workflow](https://restic.readthedocs.io/en/stable/010_introduction.html), and authenticated content-addressed repository format described in the [restic design](https://restic.readthedocs.io/en/stable/design.html). macOS access follows Apple's [Remote Login guidance](https://support.apple.com/guide/mac-help/allow-a-remote-computer-to-access-your-mac-mchlp1066/mac). Git proof follows the official [`git fsck`](https://git-scm.com/docs/git-fsck) reachability boundary and [`git reflog`](https://git-scm.com/docs/git-reflog) recovery semantics.



## Original notes
