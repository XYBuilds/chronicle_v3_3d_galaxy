# Butler webfonts (HUD / Loading / Cover)

WOFF files for `font-butler` (`Butler FREE VERSION` in `frontend/src/index.css`).

| File | Source TTF | CSS `font-weight` range |
| --- | --- | --- |
| `Butler-Medium.woff` | `assets/fonts/Butler-Medium.ttf` | 200–600 |
| `Butler-Bold.woff` | `assets/fonts/Butler-Bold.ttf` | 700–900 |

Regenerate after updating TTFs:

```bash
python scripts/setup/build_butler_webfonts.py
```

License: Fabian De Smet — [Butler](https://www.fabiandesmet.com/portfolio/butler-font/) (free personal & commercial). See `assets/fonts/README.md` and root `NOTICE`.
