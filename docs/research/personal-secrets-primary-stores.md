# Personal secrets primary stores for Chronicle operations

Research verified: 2026-08-17  
Scope: managed personal password/secrets managers for one novice maintainer, with Windows, browser, and phone access; prices are public USD prices before tax and may change.

## Conclusion

The two-product shortlist is:

1. **Bitwarden Premium — best default fit.** It is the least expensive paid option in this comparison, has a relatively simple zero-knowledge model, supports long hidden custom fields for API keys, includes pre-arranged emergency access, and—most importantly for account-provider failure—can create a password-protected encrypted export that is importable into a different Bitwarden account. The current annual price is **$19.80**. [Bitwarden pricing](https://bitwarden.com/pricing/), [custom fields](https://bitwarden.com/help/custom-fields/), [vault export](https://bitwarden.com/help/export-your-data/)
2. **1Password Individual — best onboarding and printed recovery ergonomics.** Its Emergency Kit, separate Secret Key, and optional recovery code make the recovery model unusually explicit for a new user; its product page explicitly supports SSH keys and API tokens. The regular Individual price is **$47.88/year**; the current page advertises a discounted first year at $2.99/month billed annually. Its main disadvantage for this project is that its complete 1PUX export is plaintext and therefore needs a separate encrypted container or encrypted storage medium. [1Password pricing](https://1password.com/pricing/personal), [Emergency Kit](https://support.1password.com/emergency-kit/), [recovery codes](https://support.1password.com/recovery-codes/), [export](https://support.1password.com/export/)

**Proton Pass Plus remains a qualified alternate, not the default shortlist.** It has strong end-to-end encryption, a good recovery phrase, encrypted PGP export, and paid emergency access. It is less attractive as Chronicle's independent recovery control because Pass shares one Proton Account and recovery boundary with Proton Mail, Drive, and the other Proton products; emergency access grants access to that account, not only to one Pass vault. It is most compelling if its Proton ecosystem or new agent/CI access-token support is specifically desired later. [Proton Pass security](https://proton.me/pass/security), [account recovery](https://proton.me/support/set-account-recovery-methods), [emergency access](https://proton.me/support/emergency-access), [Pass access tokens](https://proton.me/support/pass-access-tokens)

No product removes the need for an independently stored recovery artifact. End-to-end/zero-knowledge encryption deliberately prevents support staff from decrypting the vault. A recovery code, recovery phrase, trusted-contact relationship, or export only helps if it was prepared **before** access was lost.

## What “primary store” means here

The selected vault should be the human-controlled authoritative copy of Cloudflare, Supabase, Kaggle, code-hosting, domain, and other operator credentials. CI/CD systems should receive only the credentials they need as deployment copies. A password manager is not a replacement for a CI secrets store, and a CI secrets screen is not a recoverable primary store: many CI systems never reveal a saved value again.

For each service, a useful vault record contains the account/login, secret or token, purpose, permissions/scope, creation and rotation dates, recovery codes, and a link or note explaining where the credential is deployed. None of these long-lived values should be committed to Git.

## Comparison

| Criterion | Bitwarden | 1Password | Proton Pass |
|---|---|---|---|
| Managed E2EE model | End-to-end, zero-knowledge; Bitwarden says it cannot see vault data or recover/reset an individual master password. [Security FAQ](https://bitwarden.com/help/security-faqs/), [Password Manager FAQ](https://bitwarden.com/help/product-faqs/) | End-to-end encrypted with account password plus a device-generated Secret Key; 1Password has no copy of the Secret Key and cannot recover it. [Security model](https://support.1password.com/1password-security/), [Secret Key](https://support.1password.com/secret-key-security/) | End-to-end/zero-access encryption covers passwords, usernames, URLs, and note contents; Proton says it cannot decrypt them. [Pass security](https://proton.me/pass/security/) |
| Windows/browser/phone | Core plans include desktop, browser, and mobile apps and unlimited devices. [Pricing](https://bitwarden.com/pricing/) | Windows, iOS, Android, Linux, macOS and major browsers; all devices are included. [Pricing](https://1password.com/pricing/personal) | Windows, Android, iOS, web and major browser extensions; the free plan includes unlimited devices and entries. [Pass support](https://proton.me/support/pass), [plans](https://proton.me/support/proton-pass-plans-explained) |
| API credentials | Secure notes plus hidden custom fields; fields can hold up to 5,000 characters and the docs explicitly use an SSH private key as an example. [Custom fields](https://bitwarden.com/help/custom-fields/) | Pricing explicitly lists SSH keys and API tokens among supported stored data. [Pricing](https://1password.com/pricing/personal) | Unlimited notes/entries on Free. Paid access tokens can grant scoped, expiring vault access to an agent, script, or CI/CD process and log access. [Plans](https://proton.me/support/proton-pass-plans-explained), [access tokens](https://proton.me/support/pass-access-tokens) |
| Cost relevant to recovery | Free covers core vault use and encrypted export; **Premium $19.80/year** adds emergency access. [Pricing](https://bitwarden.com/pricing/) | No permanent free tier; **$47.88/year regular Individual price**, with a current first-year promotion. [Pricing](https://1password.com/pricing/personal) | Free covers the core vault; **Pass Plus $35.88/year** adds emergency access and other premium features. [Current comparison](https://proton.me/pass/alternatives/bitwarden-alternative), [plans](https://proton.me/support/proton-pass-plans-explained) |
| Self-recovery prepared in advance | Memorized master password; saved 2FA recovery material; Premium trusted emergency contact; or a password-protected encrypted export. | Emergency Kit for sign-in details/Secret Key, plus a separately stored recovery code and access to account email for recovery of both account and prior data. | A 12-word recovery phrase can reset the password and decrypt existing data; separately configured password-reset and data-recovery methods can also be combined. |
| What the provider cannot do | Bitwarden cannot retrieve or reset the individual master password or decrypt the vault. [FAQ](https://bitwarden.com/help/product-faqs/) | 1Password cannot supply the Secret Key or decrypt an export/vault for the user. [Secret Key](https://support.1password.com/secret-key-security/), [privacy](https://support.1password.com/1password-privacy/) | Proton cannot read the data or reconstruct the password. Email/SMS reset can restore account login while leaving all pre-reset Pass items encrypted. [Recovery explanation](https://proton.me/support/set-account-recovery-methods), [recover encrypted data](https://proton.me/support/recover-encrypted-messages-files) |
| Independent export | Best option is **password-protected encrypted JSON**, which can be imported to any Bitwarden account. Avoid “account restricted” encrypted exports: they only work with the originating account and can be invalidated by encryption-key rotation. [Vault export](https://bitwarden.com/help/export-your-data/) | 1PUX is the complete format, but 1Password states that 1PUX and CSV exports are plaintext. The export must immediately go inside a separately encrypted container/storage medium. [Export](https://support.1password.com/export/), [1PUX format](https://support.1password.com/1pux-format/) | Can export a ZIP containing PGP-encrypted JSON using the browser extension, web app, or Windows app; the encryption passphrase is required outside Proton Pass. Mobile apps cannot perform this export. [Pass export](https://proton.me/support/pass-export) |

## Recovery in plain language

### Bitwarden

Bitwarden cannot rescue a forgotten master password. Premium emergency access instead lets a pre-approved Bitwarden user request either view or takeover access; the owner may approve/deny during the configured wait, and access is granted after that wait if the owner does nothing. This requires choosing a real trusted person and setting it up while the vault is accessible. [Emergency access](https://bitwarden.com/help/emergency-access/), [request and grant](https://bitwarden.com/help/request-and-grant-emergency-access/)

The more provider-independent route is a password-protected encrypted JSON export. Its password must not exist only inside the vault it protects. A paper record or an independently encrypted/offline copy on the MacBook can break that circular dependency.

### 1Password

The Secret Key protects server-side encrypted data from password guessing, but 1Password does not hold it. The Emergency Kit PDF records the sign-in address, email, Secret Key, and a place for the account password; 1Password explicitly recommends printing a copy or moving it off the computer. [Emergency Kit](https://support.1password.com/emergency-kit/), [account security](https://support.1password.com/account-security/)

A separately generated recovery code plus access to the account email can replace a lost password and Secret Key while retaining old vault data. Without one of the prepared recovery paths (or a Family organizer on a Family plan), support still cannot decrypt the vault. [Recovery-code design](https://support.1password.com/recovery-code-security/), [recovery codes](https://support.1password.com/recovery-codes/)

The escape-path weakness is export handling: 1Password's native full export is unencrypted. For a novice, this creates an extra procedure that must be performed correctly every time a backup is refreshed.

### Proton Pass

Proton separates “get back into the account” from “decrypt old data.” Recovery by email or SMS can reset login, but it does not by itself decrypt pre-reset Pass items. A recovery phrase covers both steps; Proton explicitly warns not to store that phrase only in Proton Pass or another Proton service because those services are unavailable when the account is locked. [Recovery phrase](https://proton.me/support/recovery-phrase), [password reset](https://proton.me/support/reset-password)

Paid emergency access lets up to five Proton contacts request the whole Proton Account after a configured wait. That is useful, but it deliberately expands the trusted contact's eventual access to Proton mail, files, passwords, and other account data. [Emergency access](https://proton.me/support/emergency-access)

## Recommended operating baseline, whichever product wins

1. Use a unique, memorable vault password and enable 2FA.
2. Keep the vault password/recovery artifact and 2FA recovery code outside the vault: preferably a printed sealed copy plus a second encrypted/offline copy on the MacBook. Do not put the only copy in the same provider ecosystem.
3. Store one item per external service and record credential scope and rotation context; do not merely upload the three current `.env` files as opaque blobs.
4. After initial migration and after material credential changes, create a portable export. For Bitwarden choose password-protected, not account-restricted, JSON; for Proton choose PGP-encrypted export; for 1Password put the plaintext 1PUX immediately inside independent encryption and remove the plaintext residual.
5. Perform one restore drill into a temporary/local context before treating the export as a backup. Record the date and result without recording any secret value.
6. If emergency access is enabled, choose a genuine trusted human—not a second account controlled by the same person—and test that invitations and notifications work.

## Decision framing for the later selection step

- Choose **Bitwarden Premium** if low cost, native encrypted portable export, and provider independence matter most.
- Choose **1Password Individual** if the clearest beginner onboarding and a printable recovery kit matter enough to justify the higher cost and separately encrypting every full export.
- Reconsider **Proton Pass Plus** if scoped agent/CI credential access becomes a firm requirement or the maintainer intentionally wants the wider Proton ecosystem; otherwise its shared account-recovery boundary works against the present goal of reducing control-plane concentration.

This research does not select or create an account. The safe next step is a short, non-production trial of the two shortlisted products using dummy records, including one export-and-restore exercise, before migrating live credentials.
