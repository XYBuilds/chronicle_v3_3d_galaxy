# Bundled fonts

| File                | Family / source                                                                                                              | Used by                                                | License                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------- |
| `Inter.ttf`         | [Inter](https://github.com/rsms/inter) variable font, mirrored via [google/fonts (`ofl/inter`)](https://github.com/google/fonts/tree/main/ofl/inter) | `scripts/cron/render_og_today.py` (P23.5 OG card body) | SIL Open Font License v1.1 (`Inter-OFL.txt`)       |
| `Butler-Medium.ttf` | [Butler](https://www.fabiandesmet.com/portfolio/butler-font/) — Fabian De Smet                                               | `scripts/cron/render_og_today.py` (P23.5 brand line)   | Free for personal & commercial use (Fabian De Smet) |
| `Butler-Bold.ttf`   | [Butler](https://www.fabiandesmet.com/portfolio/butler-font/) — Fabian De Smet                                               | reserved for heavier brand variants if needed          | Free for personal & commercial use (Fabian De Smet) |

## Notes

The Inter variable font exposes two axes — `opsz` (optical size) and `wght` (weight) —
which the renderer sets per text style via Pillow's `ImageFont.set_variation_by_axes`.

Butler ships as static TTFs (one file per weight). The OG card uses **Butler Medium**
for the brand wordmark `the movie cosmos`, intentionally pairing a delicate serif
with the Inter sans body to mirror the cover's typographic hierarchy
(`frontend/src/index.css` registers Butler as `--font-butler` for the Loading + Cover
brand mark at much larger display sizes).

If FreeType cannot apply variations on the host system, the Inter loader falls back to
the font's default style (regular weight) and prints a warning rather than failing.

## Attribution

- **Inter** © Rasmus Andersson and the Inter Project Authors. Licensed under SIL Open
  Font License v1.1 — see `Inter-OFL.txt`.
- **Butler** © Fabian De Smet. Free for personal and commercial use. Official source:
  <https://www.fabiandesmet.com/portfolio/butler-font/>.
