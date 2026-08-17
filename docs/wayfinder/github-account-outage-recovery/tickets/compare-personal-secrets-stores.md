---
id: WFR-003
parent: ../map.md
type: wayfinder:research
status: closed
assignee: /root/research_secrets_store
blocked_by: []
asset: ../../../research/personal-secrets-primary-stores.md
---

# Compare personal secrets primary stores

## Question

Using current first-party security, recovery, export, platform-support, and pricing documentation, compare a small set of mature personal secrets stores for a maintainer who is new to password managers. The solution should be managed rather than self-hosted, end-to-end encrypted, usable on Windows, browsers, and a phone, free or low-cost, suitable for Cloudflare/Supabase/API credentials, and provide a comprehensible emergency-access or export path. Explain what the provider can and cannot recover if the maintainer loses credentials.

## Resolution comments

### 2026-08-17 — Resolved

[Research evidence](../../../research/personal-secrets-primary-stores.md) — Shortlist Bitwarden Premium as the best default fit and 1Password Individual as the beginner-onboarding alternative. Bitwarden is lower-cost and supports password-protected portable exports independent of the originating account; 1Password has clearer printed recovery ergonomics but its complete export is plaintext and requires separate encryption. Proton Pass remains a qualified alternate rather than the default because its recovery boundary is shared with the wider Proton Account. No zero-knowledge provider can recover an unprepared vault, so the later decision must include an independently stored recovery artifact and an export/restore drill.
