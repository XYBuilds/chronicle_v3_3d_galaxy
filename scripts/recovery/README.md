# P0 recovery CLI

Chronicle-owned fail-closed helpers for common protection (`tmc:chronicle:01M09Y4T00V0P1XJFNPFGE2QDV`) and Chronicle repository restore (`tmc:chronicle:01M09Y4T013PGZBMZYT00FBGTC`). They do not create accounts, enter live secrets, push real repositories, merge, or mutate production.

```bash
python scripts/recovery/cli.py prepare
python scripts/recovery/cli.py synthetic-vault --records scripts/recovery/fixtures/synthetic-vault-records.json
python scripts/recovery/cli.py restic-argv backup --repository sftp:USER@MAC:recovery --path ROOT
python scripts/recovery/cli.py admit-plan --plan path/to/plan.json
python scripts/recovery/cli.py render-issue --issue path/to/export.json
python scripts/recovery/cli.py evidence --gates path/to/gates.json --risk path/to/risk.json --approve-gitlab --residual "GitHub server-only state unknown"
python scripts/recovery/cli.py export-handoff --scratch .scratch/github-account-outage-recovery --wayfinder docs/wayfinder/github-account-outage-recovery --alias-map scripts/recovery/fixtures/wayfinder-portable-ids.json
python scripts/recovery/cli.py restore-plan --plan path/to/restore-plan.json --ci .gitlab-ci.yml
python scripts/recovery/cli.py resume-evidence --gates path/to/resume-gates.json --risk path/to/risk.json --approve-merge
```

Copy `fixtures/risk-declaration.template.json` and fill the R0–R3 tier and protected surfaces by hand. Use `fixtures/disposable-gitlab-ci.yml` only in a private disposable project after the MacBook snapshot is accepted. The repository `.gitlab-ci.yml` is the Chronicle P0 non-deploying adapter; it must not gain production jobs, schedules, or production secrets.

Password material is entered through restic or `getpass` prompts. Do not put live values in command arguments, environment variables, repository files, or this evidence output.
