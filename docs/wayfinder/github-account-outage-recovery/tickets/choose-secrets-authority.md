---
id: WFG-006
parent: ../map.md
type: wayfinder:grilling
status: closed
assignee: /root
blocked_by:
  - ./compare-personal-secrets-stores.md
---

# Choose the secrets authority and recovery model

## Question

Which personal secrets store becomes the authority for Cloudflare, Supabase, Kaggle, API, and future forge credentials; how are existing `.env` files imported without disclosure; what recovery material is stored offline; and how are scoped deployment copies provisioned into hosted CI and local emergency environments? Define rotation triggers after the current account incident without rotating credentials merely for appearance.

## Resolution comments

### 2026-08-18 — Resolved

[Store comparison evidence](../../../research/personal-secrets-primary-stores.md) — Use Bitwarden Free as the human-controlled secrets authority. It meets the maintainer's zero-cost and simplicity requirements while providing Windows, browser, and phone access plus a password-protected portable JSON export. Do not pay for Premium or configure trusted-person emergency access for this personal project.

Represent each real credential as its own vault item, including its purpose, scope, creation or replacement context, environment-variable aliases, and deployment locations. Existing ignored `.env` files remain replaceable deployment copies rather than authoritative bundles. During migration, the maintainer transfers live values locally and directly into Bitwarden; agents may inventory names, prepare empty structures, and verify completeness, but live values must not enter agent context, chat, logs, screenshots, repository files, or generated plaintext import artifacts.

Keep the recovery model deliberately small: one password-protected, non-account-restricted Bitwarden JSON export on the MacBook and one sealed paper record containing the vault master password, export password, and Bitwarden 2FA recovery material. Refresh the export after a material credential addition or change. Before live migration, prove portability once with synthetic records in an automation-first export/import acceptance test. The agent automates every non-identity-bound step and verifies record equality without live secrets; the maintainer performs only registration, login, 2FA, vault unlock, and any other action that must remain human-controlled. Repeat the drill only if the export or recovery procedure changes.

Provision hosted CI and local emergency environments one way from the authority: copy only the values each project, workload, and environment needs into the destination's native protected secret mechanism or an ignored local `.env`. CI receives no password-manager session and cannot read the whole vault. When a provider can issue independent scoped credentials, give the new GitLab consumer its own least-privilege credential and revoke the old CI-specific credential only after acceptance succeeds. Where a provider exposes one shared credential and there is no evidence of compromise, preserve it and deploy a scoped copy rather than rotating it for appearance.

Use event-triggered rotation, not calendar rotation. Replace a credential after confirmed or suspected disclosure, appearance in a log/chat/commit, loss of trust in a device or operator, an unexplained or materially excessive scope, a consumer-boundary change that supports independent issuance, a provider requirement, or a failed recovery check. GitHub account suspension is an availability incident and does not by itself prove that Cloudflare, Supabase, Kaggle, or other credentials were exposed.
