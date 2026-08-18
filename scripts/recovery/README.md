# P0 common protection CLI

Chronicle-owned fail-closed helpers for Issue `tmc:chronicle:01M09Y4T00V0P1XJFNPFGE2QDV`. They encode the snapshot/restore and disposable GitLab admission seams. They do not create Bitwarden or GitLab accounts, enter live secrets, push real repositories, or mutate production.

```bash
python scripts/recovery/cli.py prepare
python scripts/recovery/cli.py synthetic-vault --records scripts/recovery/fixtures/synthetic-vault-records.json
python scripts/recovery/cli.py restic-argv backup --repository sftp:USER@MAC:recovery --path ROOT
python scripts/recovery/cli.py admit-plan --plan path/to/plan.json
python scripts/recovery/cli.py render-issue --issue path/to/export.json
python scripts/recovery/cli.py evidence --gates path/to/gates.json --risk path/to/risk.json --approve-gitlab --residual "GitHub server-only state unknown"
```

Copy `fixtures/risk-declaration.template.json` and fill the R0–R3 tier and protected surfaces by hand. Use `fixtures/disposable-gitlab-ci.yml` only in a private disposable project after the MacBook snapshot is accepted.

Password material is entered through restic or `getpass` prompts. Do not put live values in command arguments, environment variables, repository files, or this evidence output.
