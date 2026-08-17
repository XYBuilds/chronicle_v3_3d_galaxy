# GitHub suspension: account boundaries and content recovery

**Research date:** 2026-08-17  
**Scope:** An ordinary GitHub personal account governed by the GitHub Terms of Service. Corporate/Enterprise contracts can differ.  
**Related ticket:** `docs/wayfinder/github-account-outage-recovery/tickets/clarify-github-suspension-boundaries.md`

## Recommendation

Treat the current event as an account-control-plane outage, not as evidence of any particular violation. Continue recovery on an independent host and keep the existing GitHub secondary account out of production hosting, Actions, secrets, repository transfer, and support discussion until GitHub gives written guidance. This is the lowest-risk boundary because GitHub's published rules do not expressly answer whether an already-existing second account may run the same project during a suspension, while they do restrict multiple free accounts and moderation evasion.

Use GitHub's official Appeal and Reinstatement route. If the existing correspondence has a support or appeal case number, update that case instead of splitting the facts across unrelated channels. Ask GitHub to confirm whether the action is a **suspension, termination, or another restriction**, its effective date, and the policy basis. At the same time, request preservation and a copy/export of all lawful, non-infringing account contents. The content request should be made now: the personal-account Terms give a 90-day request window after cancellation, termination, or downgrade, but do not expressly include a suspension in that window. Making a protective request avoids waiting for a status distinction that GitHub has not yet explained.

## What GitHub explicitly publishes

### Appeal and support procedure

- GitHub distinguishes an **Appeal** (the user disputes that a violation occurred and supplies information supporting a different decision) from **Reinstatement** (the user seeks access back and agrees to make any necessary changes). Both procedures cover suspension or termination of an account or service. Appeals must be submitted through the Appeal and Reinstatement form and may be made for up to six months after the moderation decision; GitHub may decline appeals submitted later. GitHub says legitimate appeals receive a final decision and that appeal decisions are made by humans. It does not publish a resolution-time commitment for an ordinary personal-account appeal. [GitHub Appeal and Reinstatement](https://docs.github.com/en/site-policy/acceptable-use-policies/github-appeal-and-reinstatement)
- A GitHub Free user may contact Support about account, security, and abuse matters. The Support portal offers a **Can't sign in?** route followed by email verification. GitHub asks users to include full URLs, repository names, usernames, exact error text, an existing ticket number, relevant logs, and redacted screenshots. [Creating a support ticket](https://docs.github.com/en/support/contacting-github-support/creating-a-support-ticket)
- GitHub warns that an uploaded image or video receives an anonymized URL viewable without authentication. Therefore, support attachments must not contain tokens, secret values, private keys, or unnecessary personal data. [Creating a support ticket](https://docs.github.com/en/support/contacting-github-support/creating-a-support-ticket)
- GitHub Community directs private contact with staff through the Support portal and strongly discourages unsolicited contact through other channels. [GitHub Community Code of Conduct](https://docs.github.com/en/site-policy/github-terms/github-community-code-of-conduct)

### Second-account boundaries

- The personal-account Terms say that one person or legal entity may maintain no more than one free account. The stated exception is one additional free **machine account**, which may be used only for automated tasks. [GitHub Terms of Service, Account Requirements](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#3-account-requirements)
- GitHub's Acceptable Use Policy prohibits creating alternative accounts specifically to evade moderation action by GitHub staff or users. [GitHub Bullying and Harassment policy](https://docs.github.com/en/site-policy/acceptable-use-policies/github-bullying-and-harassment)
- GitHub Community says additional free accounts created to inquire about a flagged or suspended account will be removed. This sentence addresses newly created inquiry accounts; it does not expressly settle use of an account that already existed before the restriction. [GitHub Community Code of Conduct](https://docs.github.com/en/site-policy/github-terms/github-community-code-of-conduct#what-is-not-allowed)

No first-party page found in this review expressly says that an already-existing second personal account may, or may not, take over the suspended account's repositories, Issues, Actions, and production secrets. The following are therefore **inferences**, not quoted GitHub rules:

1. If both personal accounts are free and controlled by the same person, maintaining both appears inconsistent with the one-free-account rule regardless of when the second account was created.
2. Recreating the same production control plane in the second GitHub account during the unresolved suspension could be interpreted as bypassing the enforcement action. GitHub's published text does not guarantee that it would make that interpretation, but the consequence would defeat the desired account-failure isolation.
3. Paying for an account would not by itself resolve the separate moderation-evasion uncertainty. It should not be treated as a workaround without written confirmation from GitHub.

### Account and repository content

- GitHub's Terms say the user owns their content. Suspension does not, by itself, transfer ownership of the code to GitHub. [GitHub Terms of Service, User-Generated Content](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#d-user-generated-content)
- A signed-in user can request an account-data archive in Settings. GitHub sends a download link to the primary email address; that link normally expires after seven days. This documented self-service path requires account access and therefore is not presently usable if login is fully blocked. [Requesting an archive of your personal account's data](https://docs.github.com/en/get-started/archiving-your-github-personal-account-and-public-repositories/requesting-an-archive-of-your-personal-accounts-data)
- GitHub's user-migration API can produce a richer migration archive containing Git repository data and JSON for items including Issues, issue comments/events, pull requests/reviews, releases, projects, protected branches, and attachments. The API is available only to authenticated account owners, and a generated archive remains downloadable for seven days. A suspended owner should not assume this route still works. [REST API endpoints for user migrations](https://docs.github.com/en/rest/migrations/users)
- Under the personal-account Terms, GitHub says that, absent legal requirements, it will delete the full profile and repository content within 90 days of **cancellation or termination**. It also says that, on request, it will make a reasonable effort to provide the owner a copy of lawful, non-infringing account contents after **cancellation, termination, or downgrade**, provided the request is made within 90 days. The clause does not list a mere suspension, even though the next clause treats suspension and termination as distinct actions. [GitHub Terms of Service, Cancellation and Termination](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#m-cancellation-and-termination)
- Depending on residence, the user may separately have privacy rights to access or port personal data by emailing GitHub's privacy address. This is a personal-data route, not a published guarantee of a complete Git repository, Issue, Actions, or secrets export, so it should supplement rather than replace the account-content request. [GitHub General Privacy Statement, Your Privacy Rights](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement#your-privacy-rights)

## Deadlines and guarantees

| Item | Published boundary | Practical treatment |
|---|---|---|
| Appeal | Up to six months after the moderation decision; GitHub may refuse a later appeal | Confirm that the existing correspondence is attached to a formal appeal; do not wait for recovery work before appealing |
| Copy of account contents under the personal Terms | Request within 90 days after cancellation, termination, or downgrade | Request now and ask GitHub to state the account's classification and effective date |
| Repository/profile deletion | GitHub says deletion occurs within 90 days after cancellation or termination, subject to legal retention and encrypted backups | Treat any termination notice as an immediate recovery deadline |
| Self-service or migration archive download | Link/archive normally available for seven days after generation | Download promptly, hash it, and keep more than one copy if GitHub enables export |
| Appeal response | Legitimate appeals receive a final, human decision | No ordinary-account response-time guarantee was found; do not make the restoration plan depend on a date GitHub has not promised |

## Safe interim operating boundary

### Proceed

- Preserve and verify all three local repositories, their full Git metadata, local-only work, ignored operational data, and encrypted credential backups.
- Restore Git hosting, Issues, and CI on a provider independent of GitHub. This does not use GitHub to bypass the restriction and avoids making another GitHub identity the new single point of failure.
- Keep one factual appeal/support record. Preserve the original notice, timestamps, exact banner/error text, repository URLs, case number, and email headers. Add new evidence to that record and redact secrets.
- Ask for account-content preservation/export in the same case. If GitHub enables a self-service or migration export, download it within seven days and compare it with the local repositories.
- Keep the secondary GitHub account credentials secure but do not make it the project's operational control plane before written clarification.

### Hold pending GitHub's written answer

- Do not transfer or recreate these projects, production Actions, deploy keys, or CI secrets under the secondary GitHub account.
- Do not create another GitHub account or organization to route around the restriction.
- Do not use the secondary account to contact Community or staff about the suspended account; use the official Appeal/Support route and its **Can't sign in?** flow.
- Do not probe the suspended account with automated API calls or repeated pushes merely to discover the enforcement boundary. The policy does not explicitly forbid a single diagnostic, but it provides no benefit that justifies introducing ambiguous activity into the appeal record.
- Do not upload credentials, `.env` files, private keys, raw auth logs, or unredacted screenshots to a support ticket.

## Suggested update to the existing GitHub case

Keep the update short and factual. It should include:

1. The account username, relevant repository URLs, date/time the loss of access was first observed, exact error text, and the existing case number.
2. A statement that the user disputes having violated GitHub's policies and is requesting an Appeal, with any concise facts that could show the decision was mistaken.
3. A request for GitHub to identify whether the action is suspension, termination, or another restriction; the effective date; and the policy or required remediation.
4. A request to preserve and provide a copy/export of all lawful, non-infringing account contents, including repository Git data and collaboration metadata, or temporarily enable the authenticated archive route. State that the request is being made promptly and within any applicable 90-day period.
5. A request for written guidance on whether the already-existing secondary account may remain unused or may be used for ordinary activity while the appeal is unresolved. Do not present migration to that account as a fait accompli.

## Unresolved facts

- GitHub has not explained the reason for this specific restriction; the public policies do not let us infer it from the visible symptom alone.
- The actual account notice must be checked for the words **suspended**, **restricted**, **disabled**, or **terminated**, because those labels affect the content-copy/deletion analysis.
- The plan and contract governing the account must be confirmed. This note assumes the ordinary personal-account Terms; Corporate/Enterprise terms are not interchangeable with them.
- GitHub's public documents do not say whether Support will provide a migration archive during a mere suspension, nor whether it will approve use of the existing second account.
- A GitHub-hosted export, if obtained later, is still needed to test whether Issues, attachments, release assets, Actions history, settings, or remote-only commits exist beyond the current local copies.

## Sources reviewed

Only first-party GitHub sources were used:

- [GitHub Appeal and Reinstatement](https://docs.github.com/en/site-policy/acceptable-use-policies/github-appeal-and-reinstatement)
- [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) (effective 2026-04-27)
- [GitHub Acceptable Use Policies](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies)
- [GitHub Bullying and Harassment policy](https://docs.github.com/en/site-policy/acceptable-use-policies/github-bullying-and-harassment)
- [GitHub Community Code of Conduct](https://docs.github.com/en/site-policy/github-terms/github-community-code-of-conduct)
- [Creating a support ticket](https://docs.github.com/en/support/contacting-github-support/creating-a-support-ticket)
- [Requesting an archive of your personal account's data](https://docs.github.com/en/get-started/archiving-your-github-personal-account-and-public-repositories/requesting-an-archive-of-your-personal-accounts-data)
- [REST API endpoints for user migrations](https://docs.github.com/en/rest/migrations/users)
- [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) (effective 2026-04-27)
