#!/usr/bin/env python3
"""P23.5: Render today's social-share OG card (1200x630 PNG) with Pillow.

Inputs (typical nightly use):
    - ``frontend/public/data/galaxy_data.json`` — galaxy export (the source of movie metadata)
    - ``frontend/public/data/today.json`` — output of ``pick_movie_today.py``

Output:
    - ``frontend/public/data/og-today.png`` — 1200x630 PNG referenced by ``og:image`` /
      ``twitter:image`` meta tags. Tightly written atomically; on poster fetch failure the
      previous file (if any) is preserved (Phase 23 risk mitigation).

Layout (logical, left → right):
    [ poster 380x570 ]   [ overline · today's pick · YYYY-MM-DD          ]
                         [ TITLE (large bold, up to 2 lines, ellipsized) ]
                         [ release year                                  ]
                         [ genre pill x N (color from frozen palette)    ]
                         [ ... (spacer) ...                              ]
                         [ brand "The Movie Cosmos" + URL footer         ]

Fonts: ``assets/fonts/Inter.ttf`` (variable; opsz/wght axes). Falls back to Pillow's
bundled DejaVu Sans if the Inter file is missing (still produces a valid card).
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _SCRIPTS_DIR.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from feature_engineering.genre_palette import build_frozen_genre_palette_v1  # noqa: E402

# --- Layout constants ---------------------------------------------------------------------
CANVAS_W = 1200
CANVAS_H = 630
POSTER_W = 380
POSTER_H = 570
POSTER_X = 60
POSTER_Y = (CANVAS_H - POSTER_H) // 2  # vertically centered
POSTER_RADIUS = 14

RIGHT_X = POSTER_X + POSTER_W + 56  # text column origin x
RIGHT_W = CANVAS_W - RIGHT_X - 60   # 60px right gutter

TITLE_FONT_SIZE = 60
TITLE_LINE_GAP = 8
OVERLINE_FONT_SIZE = 22
META_FONT_SIZE = 28
PILL_FONT_SIZE = 22
# Brand line uses Butler Medium (display serif). Butler reads thinner than Inter at the
# same pixel size, so we render the brand a notch larger than the URL footer to keep the
# wordmark visually dominant.
BRAND_FONT_SIZE = 30
URL_FONT_SIZE = 20

# --- Color tokens (P23.4b 宇宙黑 + #f2f2f2 SSOT 与品牌一致) -------------------------------
COSMOS_BLACK = (10, 10, 12)        # background
TEXT_PRIMARY = (242, 242, 242)     # #f2f2f2 — title/brand
TEXT_SECONDARY = (170, 170, 175)   # supporting copy
ACCENT_BAR_W = 6                   # left edge accent stripe (tinted by genre[0])

# --- Fonts --------------------------------------------------------------------------------
_INTER_VAR = _REPO_ROOT / "assets" / "fonts" / "Inter.ttf"
_INTER_AXES = {"opsz": "Optical size", "wght": "Weight"}
_BUTLER_MEDIUM = _REPO_ROOT / "assets" / "fonts" / "Butler-Medium.ttf"

# --- Network ------------------------------------------------------------------------------
POSTER_FETCH_TIMEOUT_S = 10
POSTER_USER_AGENT = "the-movie-cosmos/og-renderer (+https://github.com/XYBuilds)"

# --- Brand text ---------------------------------------------------------------------------
# UI-identity surface: lowercase per ``branding-name-convention`` rule (matches Loading /
# Cover wordmark). Narrative copy elsewhere still uses title-case "The Movie Cosmos".
DEFAULT_BRAND = "the movie cosmos"
DEFAULT_FOOTER_URL = "themoviecosmos.com"  # P23.6 production custom domain (apex)


def _hex_to_rgb(hx: str) -> tuple[int, int, int]:
    s = hx.strip().lstrip("#")
    assert len(s) == 6, f"unexpected hex color: {hx!r}"
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


def _genre_palette_rgb() -> dict[str, tuple[int, int, int]]:
    palette_hex, _, _ = build_frozen_genre_palette_v1()
    return {g: _hex_to_rgb(hx) for g, hx in palette_hex.items()}


def _load_inter(size: float, weight: int = 400) -> Any:
    """Return a Pillow ``ImageFont`` at the requested size + variable weight.

    Falls back to Pillow's bundled DejaVu Sans (regular only) if Inter is missing.
    """
    from PIL import ImageFont  # noqa: WPS433

    if _INTER_VAR.is_file():
        font = ImageFont.truetype(str(_INTER_VAR), size=size)
        try:
            opsz = float(min(max(size, 14.0), 32.0))
            font.set_variation_by_axes([opsz, float(weight)])
        except (OSError, AttributeError) as err:  # FreeType lacking variation support
            print(f"[render_og_today] WARN variation unsupported (weight={weight}): {err}", flush=True)
        return font

    print(
        f"[render_og_today] WARN Inter not found at {_INTER_VAR}; falling back to default font",
        flush=True,
    )
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1 — should not happen given requirements.cpu.txt pin
        return ImageFont.load_default()


def _load_butler_medium(size: float) -> Any:
    """Return Butler Medium TTF for the brand wordmark.

    Falls back to ``_load_inter(size, weight=500)`` if Butler is missing so the renderer
    still produces a valid card on environments without the bundled serif.
    """
    from PIL import ImageFont  # noqa: WPS433

    if _BUTLER_MEDIUM.is_file():
        return ImageFont.truetype(str(_BUTLER_MEDIUM), size=size)
    print(
        f"[render_og_today] WARN Butler not found at {_BUTLER_MEDIUM}; brand falls back to Inter Medium",
        flush=True,
    )
    return _load_inter(size, weight=500)


def _release_year(release_date: str) -> str | None:
    s = (release_date or "").strip()
    if len(s) >= 4 and s[:4].isdigit():
        return s[:4]
    return None


def _ellipsize_to_width(draw: Any, text: str, font: Any, max_w: int) -> str:
    """Truncate ``text`` so that drawing it fits within ``max_w`` pixels (adds an ellipsis)."""
    if draw.textlength(text, font=font) <= max_w:
        return text
    ell = "…"
    cut = len(text)
    while cut > 1:
        candidate = text[: cut - 1].rstrip() + ell
        if draw.textlength(candidate, font=font) <= max_w:
            return candidate
        cut -= 1
    return ell


def _wrap_title(draw: Any, text: str, font: Any, max_w: int, max_lines: int = 2) -> list[str]:
    """Greedy word-wrap; if more than ``max_lines`` produced, ellipsize the last visible line."""
    words = text.strip().split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for w in words[1:]:
        candidate = current + " " + w
        if draw.textlength(candidate, font=font) <= max_w:
            current = candidate
        else:
            lines.append(current)
            current = w
            if len(lines) == max_lines:
                break
    if len(lines) < max_lines:
        lines.append(current)
    if len(lines) == max_lines and (
        draw.textlength(current, font=font) > max_w
        or len(" ".join(lines)) < len(text)
    ):
        lines[-1] = _ellipsize_to_width(draw, lines[-1], font, max_w)
    return lines


def download_poster(url: str, *, timeout_s: float = POSTER_FETCH_TIMEOUT_S) -> Any:
    """Fetch a remote poster URL and return a Pillow ``Image`` (RGB).

    Raises ``urllib.error.URLError`` / ``OSError`` on network or decoding failures so callers
    can decide whether to fall back / abort.
    """
    from PIL import Image  # noqa: WPS433

    assert url and url.startswith(("http://", "https://")), f"poster url must be absolute http(s): {url!r}"
    print(f"[render_og_today] fetch poster url={url} timeout={timeout_s}s", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": POSTER_USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:  # noqa: S310 — explicit https URL only
        ctype = resp.headers.get("Content-Type", "")
        body = resp.read()
    print(f"[render_og_today] poster bytes={len(body)} content_type={ctype!r}", flush=True)
    img = Image.open(io.BytesIO(body))
    img.load()
    return img.convert("RGB")


def _placeholder_poster(*, accent_rgb: tuple[int, int, int]) -> Any:
    """Solid-color poster used when the remote fetch fails (deterministic, never empty)."""
    from PIL import Image  # noqa: WPS433

    return Image.new("RGB", (POSTER_W, POSTER_H), color=accent_rgb)


def _resize_cover(img: Any, target_w: int, target_h: int) -> Any:
    from PIL import Image  # noqa: WPS433

    src_w, src_h = img.size
    src_ratio = src_w / src_h
    target_ratio = target_w / target_h
    if src_ratio > target_ratio:
        new_h = target_h
        new_w = int(round(src_ratio * new_h))
    else:
        new_w = target_w
        new_h = int(round(new_w / src_ratio))
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def _round_corners(img: Any, radius: int) -> Any:
    from PIL import Image, ImageDraw  # noqa: WPS433

    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)
    rgba = img.convert("RGBA")
    rgba.putalpha(mask)
    return rgba


def render_og_card(
    movie: dict[str, Any],
    *,
    output: Path,
    today_date: date,
    brand: str = DEFAULT_BRAND,
    footer_url: str = DEFAULT_FOOTER_URL,
    poster_image: Any | None = None,
) -> Path:
    """Render the OG card to ``output`` atomically. Returns the final path."""
    from PIL import Image, ImageDraw  # noqa: WPS433

    title = str(movie.get("title", "")).strip() or "Untitled"
    genres = [str(g) for g in (movie.get("genres") or []) if g]
    palette = _genre_palette_rgb()
    accent_rgb = palette.get(genres[0], (90, 181, 255)) if genres else (90, 181, 255)

    canvas = Image.new("RGB", (CANVAS_W, CANVAS_H), color=COSMOS_BLACK)
    draw = ImageDraw.Draw(canvas)

    canvas.paste(
        Image.new("RGB", (ACCENT_BAR_W, CANVAS_H), color=accent_rgb),
        (0, 0),
    )

    if poster_image is None:
        poster_url = str(movie.get("poster_url", "")).strip()
        if poster_url:
            # Per Phase 23 risk row "TMDB poster 拉取失败 → 复用上一日 og-today.png（不覆盖）":
            # propagate fetch errors so the caller (entry point) returns None and the atomic
            # rename never executes — yesterday's PNG (if any) stays in place.
            poster_image = download_poster(poster_url)
        else:
            print("[render_og_today] WARN movie has empty poster_url; using accent placeholder", flush=True)
            poster_image = _placeholder_poster(accent_rgb=accent_rgb)

    poster = _resize_cover(poster_image, POSTER_W, POSTER_H)
    poster_rgba = _round_corners(poster, POSTER_RADIUS)
    canvas.paste(poster_rgba, (POSTER_X, POSTER_Y), poster_rgba)

    overline_font = _load_inter(OVERLINE_FONT_SIZE, weight=600)
    title_font = _load_inter(TITLE_FONT_SIZE, weight=700)
    meta_font = _load_inter(META_FONT_SIZE, weight=500)
    pill_font = _load_inter(PILL_FONT_SIZE, weight=600)
    # Brand wordmark in Butler Medium (display serif) — pairs with Inter body to mirror the
    # Loading/Cover typographic hierarchy in the frontend. URL line stays Inter for legibility.
    brand_font = _load_butler_medium(BRAND_FONT_SIZE)
    url_font = _load_inter(URL_FONT_SIZE, weight=400)

    cur_y = POSTER_Y
    overline = f"today's pick · {today_date.isoformat()}"
    draw.text((RIGHT_X, cur_y), overline, font=overline_font, fill=accent_rgb)
    cur_y += OVERLINE_FONT_SIZE + 18

    title_lines = _wrap_title(draw, title, title_font, RIGHT_W, max_lines=2)
    print(f"[render_og_today] title={title!r} lines={len(title_lines)}", flush=True)
    for line in title_lines:
        draw.text((RIGHT_X, cur_y), line, font=title_font, fill=TEXT_PRIMARY)
        cur_y += TITLE_FONT_SIZE + TITLE_LINE_GAP
    cur_y += 12

    year = _release_year(str(movie.get("release_date", "")))
    if year:
        draw.text((RIGHT_X, cur_y), year, font=meta_font, fill=TEXT_SECONDARY)
        cur_y += META_FONT_SIZE + 18

    pill_x = RIGHT_X
    pill_y = cur_y
    pill_pad_x = 18
    pill_pad_y = 8
    pill_gap = 12
    for g in genres[:3]:
        text_w = int(round(draw.textlength(g, font=pill_font)))
        pill_w = text_w + pill_pad_x * 2
        pill_h = PILL_FONT_SIZE + pill_pad_y * 2
        if pill_x + pill_w > RIGHT_X + RIGHT_W:
            break
        bg = palette.get(g, accent_rgb)
        draw.rounded_rectangle(
            (pill_x, pill_y, pill_x + pill_w, pill_y + pill_h),
            radius=pill_h // 2,
            fill=bg,
        )
        draw.text((pill_x + pill_pad_x, pill_y + pill_pad_y - 2), g, font=pill_font, fill=COSMOS_BLACK)
        pill_x += pill_w + pill_gap

    footer_baseline = POSTER_Y + POSTER_H
    brand_y = footer_baseline - BRAND_FONT_SIZE - URL_FONT_SIZE - 10
    draw.text((RIGHT_X, brand_y), brand, font=brand_font, fill=TEXT_PRIMARY)
    draw.text(
        (RIGHT_X, brand_y + BRAND_FONT_SIZE + 6),
        footer_url,
        font=url_font,
        fill=TEXT_SECONDARY,
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    tmp = output.with_suffix(output.suffix + ".tmp")
    canvas.save(tmp, format="PNG", optimize=True)
    out_size = tmp.stat().st_size
    print(
        f"[render_og_today] wrote tmp={tmp.relative_to(_REPO_ROOT) if tmp.is_relative_to(_REPO_ROOT) else tmp} "
        f"bytes={out_size} dims=({CANVAS_W}, {CANVAS_H})",
        flush=True,
    )
    assert out_size > 0, "OG card PNG produced 0 bytes"
    os.replace(tmp, output)
    print(f"[render_og_today] finalized {output}", flush=True)
    return output


def _load_today_payload(today_json: Path) -> dict[str, Any]:
    raw = json.loads(today_json.read_text(encoding="utf-8"))
    assert isinstance(raw, dict), "today.json root must be object"
    assert isinstance(raw.get("movie_id"), int), "today.movie_id must be int"
    assert isinstance(raw.get("date"), str) and raw["date"], "today.date must be non-empty string"
    return raw


def _load_movie_by_id(galaxy_json: Path, movie_id: int) -> dict[str, Any]:
    raw = json.loads(galaxy_json.read_text(encoding="utf-8"))
    movies = raw.get("movies")
    assert isinstance(movies, list), "galaxy.movies must be array"
    for m in movies:
        if int(m.get("id", -1)) == int(movie_id):
            return m
    raise KeyError(f"movie_id={movie_id} not found in {galaxy_json}")


def render_og_today_after_galaxy_export(repo_root: Path) -> Path | None:
    """Convenience entry point used by ``nightly_vote_refresh.py``.

    Reads ``today.json`` + ``galaxy_data.json`` from disk, renders the card next to them.
    Returns the output path on success, ``None`` on recoverable failure (caller logs warn).
    """
    public_data = repo_root / "frontend" / "public" / "data"
    today_json = (public_data / "today.json").resolve()
    galaxy_json = (public_data / "galaxy_data.json").resolve()
    out = (public_data / "og-today.png").resolve()
    if not today_json.is_file():
        print(f"[render_og_today] WARN today.json missing at {today_json}; skip", flush=True)
        return None
    if not galaxy_json.is_file():
        print(f"[render_og_today] WARN galaxy_data.json missing at {galaxy_json}; skip", flush=True)
        return None
    try:
        today = _load_today_payload(today_json)
        movie = _load_movie_by_id(galaxy_json, int(today["movie_id"]))
        date_utc = date.fromisoformat(today["date"])
        return render_og_card(movie, output=out, today_date=date_utc)
    except Exception as err:  # noqa: BLE001 — caller decides; we keep prior PNG by atomic replace
        print(f"[render_og_today] ERROR rendering OG card: {err}", flush=True)
        return None


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--galaxy-json",
        type=Path,
        default=Path("frontend/public/data/galaxy_data.json"),
        help="Path to galaxy_data.json (default: frontend/public/data/galaxy_data.json)",
    )
    p.add_argument(
        "--today-json",
        type=Path,
        default=Path("frontend/public/data/today.json"),
        help="Path to today.json (default: frontend/public/data/today.json)",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=Path("frontend/public/data/og-today.png"),
        help="Output PNG path (default: frontend/public/data/og-today.png)",
    )
    p.add_argument(
        "--brand",
        type=str,
        default=DEFAULT_BRAND,
        help=f"Brand text shown in footer (default: {DEFAULT_BRAND!r})",
    )
    p.add_argument(
        "--footer-url",
        type=str,
        default=os.environ.get("OG_FOOTER_URL", DEFAULT_FOOTER_URL),
        help="Hostname shown under the brand (P23.6 will replace with the custom domain)",
    )
    p.add_argument(
        "--poster-file",
        type=Path,
        default=None,
        help="Skip remote poster fetch; use this local image instead (testing/offline use)",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    galaxy = args.galaxy_json.expanduser().resolve()
    today = args.today_json.expanduser().resolve()
    out = args.output.expanduser().resolve()
    if not galaxy.is_file():
        print(f"Error: --galaxy-json not found: {galaxy}", file=sys.stderr)
        return 1
    if not today.is_file():
        print(f"Error: --today-json not found: {today}", file=sys.stderr)
        return 1
    today_payload = _load_today_payload(today)
    movie = _load_movie_by_id(galaxy, int(today_payload["movie_id"]))
    print(
        f"[render_og_today] today_date={today_payload['date']} "
        f"movie_id={today_payload['movie_id']} title={movie.get('title')!r} "
        f"genres={movie.get('genres')}",
        flush=True,
    )
    poster_img = None
    if args.poster_file is not None:
        from PIL import Image  # noqa: WPS433

        pf = args.poster_file.expanduser().resolve()
        if not pf.is_file():
            print(f"Error: --poster-file not found: {pf}", file=sys.stderr)
            return 1
        poster_img = Image.open(pf).convert("RGB")
        print(f"[render_og_today] using local poster file {pf} dims={poster_img.size}", flush=True)
    date_utc = date.fromisoformat(today_payload["date"])
    render_og_card(
        movie,
        output=out,
        today_date=date_utc,
        brand=args.brand,
        footer_url=args.footer_url,
        poster_image=poster_img,
    )
    print(
        f"[render_og_today] done at {datetime.now(timezone.utc).isoformat()}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
