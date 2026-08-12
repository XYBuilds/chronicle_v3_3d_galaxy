# Issue #380 evidence

## Disposition table

| Path | Disposition |
| --- | --- |
| `README.md` | Current — English-default visitor entry |
| `README.zh-CN.md` | Current — Chinese authoring/reading mirror |
| `README.en.md` | Compatibility pointer (temporary; removal condition recorded) |
| `AGENTS.md` | Current — tool-neutral repository guidance |
| `docs/agents/domain.md` | Current — reading order; Cursor rules ≠ product authority |
| `docs/system/decision-index.md` | Current — navigation only (unchanged ownership) |
| Six topics under `docs/product|frontend|data/` | Current authority (from #379) |
| `.cursor/rules/project-overview.mdc` | Host bootstrap pointer |
| `.cursor/rules/data-protection.mdc` | Host ~771 MB CSV guard |
| `.cursor/rules/branding-name-convention.mdc` | Non-applying compatibility pointer |
| `.cursor/rules/frontend-threejs.mdc` | Glob-scoped pointers |
| `.cursor/rules/python-pipeline.mdc` | Glob-scoped pointers |
| `.cursor/rules/ai-workflow.mdc` | Deleted |
| `.cursor/rules/workflow-adapter.mdc` | Deleted |
| `finish_todo.sh` | Retained legacy helper (not governance) |
| `assets/fonts/README.md` | Current font inventory (Butler only) |
| `assets/fonts/Inter.ttf` / `Inter-OFL.txt` | Removed (unreferenced) |
| Butler TTF + `frontend/public/fonts/butler/*.woff` | Retained active assets |
| Feature / visual quick tables under `docs/project_docs/` | Supporting references |
| `docs/guides/P20.5`, `P34.3`, `P34.7`, `Supabase…` | Supporting reference only |
| `docs/guides/P18.*`, Cursor TODO guide, Phase 6M7, retired P23/P34 Today guides | Historical / non-executable or non-authoritative operating handbooks |
| `docs/temp/` Daily PRD + shadow architecture | Removed after fact-routing (no unique Chronicle current facts) |
| Interactive Art template + HDR discussion | Historical at existing paths |
| Duplicate README media / Vite starters | Out of scope (later R0) |

## Font reference / license proof

- No build/tool opens `assets/fonts/Inter.ttf` (legacy OG renderer gone; frontend loads Butler WOFF; CSS may list system family name `Inter` only).
- Removed Inter TTF + OFL; updated `NOTICE`, READMEs, font inventory, readme-parts legal slices.
- Frontend production build succeeded after removal.

## Typography

- Production `document.fonts`: `Butler FREE VERSION:loaded`.
- `typography-cover-loading.png` — cover brand mark (`the movie cosmos`).
- `typography-galaxy-idle.png` — post-cover HUD (shipped Butler path unchanged).

## Checks

- `python -m pytest scripts/tests/test_current_documentation_authority.py scripts/tests/test_phase40_documentation_contract.py`
- `git diff --check`
- `npm run build -w frontend`
