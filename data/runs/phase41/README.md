# Phase 41 run evidence index

This file is a compact **non-authoritative** reproduction pointer. It is not current product documentation, a governance ledger, or a replacement for the formal Phase 41 Reports. Do not treat restored or regenerated pixels as a product change.

The four raw PNG/JSON run directories listed below were removed from HEAD after this pointer was recorded. Restore them from the last commit that still contained the files. Do not regenerate with a different profile or toolchain and call that a rollback.

## Last commit containing the raw files

[`44acdba30b8ae468535712021a7e93b0f073ae1f`](https://github.com/XYBuilds/chronicle_v3_3d_galaxy/commit/44acdba30b8ae468535712021a7e93b0f073ae1f)

```text
git checkout 44acdba30b8ae468535712021a7e93b0f073ae1f -- \
  data/runs/phase41/p41.4-fixed-shaping-direction-v4-backlight-semantic-fixtures \
  data/runs/phase41/p41.4-fixed-shaping-key-v5-backlight-lightness-066-semantic-fixtures \
  data/runs/phase41/p41.4-fixed-shaping-lightness-v5-backlight-lightness-066-semantic-fixtures \
  data/runs/phase41/p41.5-emission-curve-bloom-off
```

## Environment and provenance

Reproduce only from the last commit that still contained the diagnostic generators, Playwright pin, and authoritative gzip. Local regeneration is not current product work; Issue #386 retired the generator scripts.

| Input | Value |
| --- | --- |
| Authoritative gzip | `frontend/public/data/galaxy_data.json.gz` |
| gzip SHA-256 | `eb15d597479f4f46792c440ae6478ddade9ba1bd95cc623d0dd135e680c60cad` |
| Data version | `2026.07.18.daily.113` |
| Movie count | `61531` |
| Renderer | Playwright 1.52.0 Chromium 136.0.7103.25 (`webgl_renderer`: WebKit WebGL) |
| Generator runtime | `tsx` 4.19.0, `vite` 8.0.4 |
| Diagnostic marker | `phase41-visual-diagnostic-v1` |
| P41.4 fixtures | Semantic rows generated into `data/runs/phase41/baseline/fixtures/semantic/` by `npm run evidence:p41.4` |
| P41.5 fixtures | Baseline rows generated into `data/runs/phase41/baseline/fixtures/` by `npm run evidence:p41.5` |
| Fixture seeds | Derived from the authoritative gzip (not a global seed). Representative: P41.4 `semantic-warm-single-band` `1416710939`; P41.5 `hue-low` `63871841` |
| Resolution / padding / sizeRoot | `1024` / `0.08` / `3` |
| Hash convention | SHA-256 of the git blob at the last-raw-files commit (LF JSON, not a Windows working-tree checkout) |

Package scripts `npm run evidence:p41.4` and `npm run evidence:p41.5` existed in `tools/planet-exporter` at the last-raw-files commit. Issue #386 retired those generators; do not run them from current HEAD.

## Runs

### Direction — `data/runs/phase41/p41.4-fixed-shaping-direction-v4-backlight-semantic-fixtures`

- Reproduction: `npm run evidence:p41.4 -- --checkpoint direction --approve backlight-east-v1`
- Generated at: `c8c645a57d5517a45491c3393ef58de5cce801f4`
- Accepted: `backlight-east-v1`, normalized `[0.700665949127905, 0.4003805423588029, 0.5905612999792342]`
- Fixed for this gate: Lightness `0.50`, Key `0.35`, `flatShadingMix=0.8`, emission `0.005` (`vote-average-power-clamped-v1`), Bloom OFF
- Representative hashes:
  - `contact-sheet.png` `c36e08e4ff977c90487c48295f5cb672aee708ae1f0d6824a8491a1870e96662`
  - `cells/semantic-warm-single-band__backlight-east-v1.png` `32e1bc280e41dbf01d06784e70512f3839eaedb305228deede7fd9cecd0bbe08`
  - `validation.json` `0fb7a736b5262df9dab365b5d32413085bf115857ebe76d87fabfa9ef701ddc2`

### Lightness — `data/runs/phase41/p41.4-fixed-shaping-lightness-v5-backlight-lightness-066-semantic-fixtures`

- Reproduction: `npm run evidence:p41.4 -- --checkpoint lightness --direction backlight-east-v1 --approve lightness-0.66`
- Generated at: `c8c645a57d5517a45491c3393ef58de5cce801f4`
- Accepted: `lightness-0.66`
- Representative hashes:
  - `contact-sheet.png` `21c674f28a0f84cc4ac3f68d0447e6847ff2fb2a53feaed33135848a373fa415`
  - `cells/semantic-warm-single-band__lightness-0.66.png` `af032b3f8b9e97358909283220e2ea0523ddc314aee317fc0f4cec1a8b92d3e7`
  - `validation.json` `27d381207e69a32de2b93cd6baa77f0226afbc7220fce461c0e4bfef67e38a6a`

### Key — `data/runs/phase41/p41.4-fixed-shaping-key-v5-backlight-lightness-066-semantic-fixtures`

- Reproduction: `npm run evidence:p41.4 -- --checkpoint key --direction backlight-east-v1 --lightness lightness-0.66 --approve key-0.45`
- Generated at: `c8c645a57d5517a45491c3393ef58de5cce801f4`
- Accepted: `key-0.45`
- Representative hashes:
  - `contact-sheet.png` `e6e6967c703eadb0f7ae87139a51a4f4c7b80494f48e36f19469634ee63329c7`
  - `cells/semantic-warm-single-band__key-0.45.png` `25ad20f0eb866bc32abcff96d5d57d6723c856a3d40e3d7bf2897ac1680e819f`
  - `validation.json` `2bca0523e402a7643c354a0a9386f81ce511a5ebcb9cc90278bf9e7dfa174ebf`

### Historical emission curve — `data/runs/phase41/p41.5-emission-curve-bloom-off`

- Reproduction: `npm run evidence:p41.5`
- Generated at: `15f0a3f2346b863903e1ab74acef7ea5cfe41240`
- Recorded status: `pending-human-review` / `candidate-no-go` (`vote-average-anchored-smoothstep-v1`). This is historical Bloom-OFF evidence, not the later production CDF/LUT profile.
- Representative hashes:
  - `contact-sheet.png` `9285f3fc54a6f9c8b2540d2d5ac70c76878454aced867d84ea958a2a8b4e7d1e`
  - `cells/hue-low__rating-4.0.png` `8df4379b51151012f0b3e2ee86d6a19a40af4e47272e9656857da1a1530871ee`
  - `validation.json` `86bec18bb293ddf69d9d7387b176ecfa82ff80f5d80cea0e858a6bc1f22effb9`

## Formal Reports

Do not rewrite these Reports. They still name the original directories; this index is the HEAD pointer to the last commit that held the files.

- [Phase 41.4 Focus 固定造型 Gate 实施报告.md](../../../docs/reports/Phase%2041.4%20Focus%20固定造型%20Gate%20实施报告.md)
- [Phase41.5-41.5.1-baseline-and-boundary-report.md](../../../docs/reports/Phase41.5-41.5.1-baseline-and-boundary-report.md)
- [Phase41.5-p41.5.4-bloom-off-evidence-report.md](../../../docs/reports/Phase41.5-p41.5.4-bloom-off-evidence-report.md)
