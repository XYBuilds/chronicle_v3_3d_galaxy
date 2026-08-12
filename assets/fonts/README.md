# Font inventory (current use)

| File | Family / source | Current use | License |
| --- | --- | --- | --- |
| `Butler-Medium.ttf` | [Butler](https://www.fabiandesmet.com/portfolio/butler-font/) — Fabian De Smet | Source for HUD/cover brand WOFF; historical OG brand line | Author states free for personal & commercial use; confirm on the [official Butler page](https://www.fabiandesmet.com/portfolio/butler-font/) |
| `Butler-Bold.ttf` | Same | Heavier brand weight source / reserved variants | Same as Butler-Medium |

## Active web outputs

HUD and cover brand marks load Butler WOFF from `frontend/public/fonts/butler/` (`Butler-Medium.woff`, `Butler-Bold.woff`), built from the TTFs above:

```bash
python scripts/setup/build_butler_webfonts.py
```

`frontend/src/index.css` registers Butler as `--font-butler`. The CSS stack may still list the generic family name `Inter` as a **system** fallback; that does **not** load a bundled Inter file from this directory.

## Removed

`Inter.ttf` and `Inter-OFL.txt` were removed in Issue #380 after confirming no build or tool opens `assets/fonts/Inter.ttf`.

## Attribution

- **Butler** © Fabian De Smet. Per the [official Butler site](https://www.fabiandesmet.com/portfolio/butler-font/), free for personal and commercial projects; keep this credit if you redistribute the font files.
