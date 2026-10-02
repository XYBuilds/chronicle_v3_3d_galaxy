# GitHub cutback

The maintainer authorized the return to XYBuilds and declared R3 with `publication`, `planet_export`, `og_worker`, and `daily` on 2026-10-02. The owning [Initiative #401](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/issues/401) and repository Issues #402, Worker #9, and Daily #168 hold implementation and acceptance. GitLab shadow backup is deferred. Monthly refit and Daily editorial publication are outside this cutback.

## Development and tracker acceptance

Each delivery branch retains the GitLab main ancestor: Chronicle `6a27d3d`, Worker `ec36760`, Daily `5e2a50d`. GitHub-only research branches and Daily PR #155 remain untouched. The [GitLab export](../history/gitlab-2026-10-02/README.md) preserves original record state, bodies, portable IDs and attributed notes; raw exports and verified Git bundles are retained in the local cutback evidence directory. GitHub #370 is a closed design ticket, while #378 is the separate open simplification Initiative.

1. Verify exported records and the imported open predecessor [Initiative #403](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/issues/403), which retains its original portable ID. All closed predecessor records remain historical rather than reopened work.
2. Verify GitHub PR checks and protected `main`, obtain human merge approval, and merge with ancestry preserved.
3. Freeze the GitLab predecessor and update local remotes only after destination verification. GitHub becomes the one writable tracker; historical exports remain read-only.

## Publication admission

GitHub non-deploying verification runs on PRs and `main` without production secrets. Site and Daily call `scripts/publication/cli.py` and share `galaxy-r2-pages-release` with `cancel-in-progress: false`. GitLab's top-level workflow denies every pipeline. Monthly and hosted Recovery remain disabled; the independent Supabase preflight is read-only.

The default is no production execution: missing `PUBLICATION_AUTHORITY` or a value other than `github` skips the Site/Daily jobs. Both the workflow and shared CLI require the XYBuilds repository, protected `main`, and an allowed event. After operational admission, `PUBLICATION_AUTHORITY=github` permits manual releases. Automatic Site push and Daily schedule remain off until `P1_SITE_TRIGGER_ENABLED=true` and `P1_DAILY_SCHEDULE_ENABLED=true`, respectively. Never configure GitLab and GitHub as simultaneous publishers.

The first 2026-10-02 read-only inventory found the public manifest at `2026.08.02.daily.131` and an existing OG v2 checkpoint, but no R2 publication sequence, Site Artifact registry, or publication-hold object. Supabase was inactive and the maintainer requested its resume. These observations are admission gaps, not successful cutover evidence.

Follow-up inventory confirmed Supabase `ACTIVE_HEALTHY` and a successful repository preflight. The validated OG checkpoint is newer than the public manifest: `2026.08.12.daily.141`, with 62,006 movies. The current Pages production deployment is `8910991e-daf3-4259-86cb-d98a89c2a1c1` (2026-08-02); its source metadata names `dfa54d25` with `commit_dirty=true`, so that commit alone must not be presented as an exact reproducible rollback artifact. Home, movie, ordinary invalid-path, manifest assets/profile, and OG movie/brand/missing-movie fallback returned successfully during read-only checks.

Cloudflare's legacy Git integration had production builds disabled but automatic branch previews enabled with no build command. The first recovery PR triggered an invalid raw-repository upload that exceeded the 25 MiB asset limit. Automatic Git previews were then disabled; production builds stayed disabled and the live deployment ID remained unchanged. Wrangler remains the publication path. The failed preview is retained as historical evidence, not a successful deployment.

Before enabling production:

1. Confirm database readiness through the repository preflight, inspect current Pages/Worker deployment identities, and validate the live manifest, immutable data/profile objects, OG checkpoint and credentials.
2. Preserve and verify the current live Site/Data rollback target. Establish missing sequence, hold and artifact state through a separately recorded recovery procedure using observed identities; ordinary Site/Daily jobs must not silently bootstrap these objects. Sequence must start above every verified production suffix, including OG state rather than only the older public manifest.
3. Verify that GitLab schedules and running/queued publication jobs are absent, then record the authority transfer. Keep automatic trigger variables false.
4. Run one manual Site and one manual Daily from protected `main`. Verify durable receipts, current manifest/profile/data, home/movie/invalid-path smoke, Planet Export-to-Daily compatibility and relevant OG movie/brand/fallback behavior.
5. Only after those pass, enable the corresponding automatic trigger. The Daily cron is 18:00 UTC (02:00 Asia/Shanghai the following day). Monthly requires a separate explicit decision and remains blocked in the shared entry point.

## Recovery and evidence

Site Release fetches the existing registry before building, records the verified new artifact identity after smoke, and uploads the tar plus updated registry. If deployment, smoke, or registry promotion fails, it fetches the previous artifact into a separate directory, composes the selected live manifest onto it, and redeploys only if composition succeeds. Daily retains its whole-entry replay and last-known-good behavior. Completed database/KV/R2 mutations are not a global transaction.

Record test commands and candidate SHAs, provider run/deployment IDs, publication sequence and receipt, observed manifest/profile identities, consumer results, and verified rollback target in the owning Issues. Fixture success proves orchestration boundaries, not real credentials or production success. Merge, Issue closure and production acceptance retain their human gates.

The recovery PRs are [Chronicle #404](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/pull/404), [Worker #10](https://github.com/XYBuilds/themoviecosmos-og-worker/pull/10), and [Daily #169](https://github.com/XYBuilds/themoviecosmos-daily-stargazing/pull/169). Their non-deploying GitHub checks passed on the initial candidates. Local acceptance additionally passed all 14 Chromium journeys, the Planet Export integration, and Storybook capture/a11y. The maintainer's final visual and production acceptance remains separate from those automated results.
