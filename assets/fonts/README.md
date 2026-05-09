# Bundled fonts

| File         | Family / source                                                                                                              | Used by                                              | License                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| `Inter.ttf`  | [Inter](https://github.com/rsms/inter) variable font, mirrored via [google/fonts (`ofl/inter`)](https://github.com/google/fonts/tree/main/ofl/inter) | `scripts/cron/render_og_today.py` (P23.5 OG card)    | SIL Open Font License v1.1 (`Inter-OFL.txt`) |

The variable font exposes two axes — `opsz` (optical size) and `wght` (weight) — which
the renderer sets per text style via Pillow's `ImageFont.set_variation_by_axes`.

If FreeType cannot apply variations on the host system, the renderer falls back to
the font's default style (regular weight) and prints a warning rather than failing.
