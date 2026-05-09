#!/usr/bin/env python3
"""P23.5: ``render_og_today`` deterministic helpers + offline end-to-end smoke."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

from PIL import Image, ImageDraw, ImageFont

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.render_og_today import (  # noqa: E402
    CANVAS_H,
    CANVAS_W,
    POSTER_H,
    POSTER_W,
    _ellipsize_to_width,
    _genre_palette_rgb,
    _hex_to_rgb,
    _release_year,
    _wrap_title,
    render_og_card,
)


def _draw_with_default_font(size: int = 60) -> tuple[ImageDraw.ImageDraw, ImageFont.ImageFont]:
    img = Image.new("RGB", (1200, 100), color=(0, 0, 0))
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default(size=size)
    return draw, font


class TestHexConversion(unittest.TestCase):
    def test_known_palette_hex(self) -> None:
        self.assertEqual(_hex_to_rgb("#F486AA"), (244, 134, 170))
        self.assertEqual(_hex_to_rgb("FFFFFF"), (255, 255, 255))

    def test_palette_keys_match_frozen_palette(self) -> None:
        rgb = _genre_palette_rgb()
        self.assertEqual(len(rgb), 19)
        self.assertIn("Drama", rgb)
        self.assertIn("Science Fiction", rgb)
        for name, tup in rgb.items():
            self.assertEqual(len(tup), 3, f"{name} rgb tuple bad shape")
            for ch in tup:
                self.assertGreaterEqual(ch, 0)
                self.assertLessEqual(ch, 255)


class TestReleaseYear(unittest.TestCase):
    def test_release_year_iso(self) -> None:
        self.assertEqual(_release_year("1999-12-31"), "1999")
        self.assertEqual(_release_year("2026-05-08"), "2026")

    def test_release_year_blank_or_garbage(self) -> None:
        self.assertIsNone(_release_year(""))
        self.assertIsNone(_release_year("   "))
        self.assertIsNone(_release_year("not-a-date"))


class TestWrapAndEllipsize(unittest.TestCase):
    def test_short_title_single_line(self) -> None:
        draw, font = _draw_with_default_font(size=60)
        self.assertEqual(_wrap_title(draw, "Una", font, max_w=600, max_lines=2), ["Una"])

    def test_long_title_wraps_to_two_lines(self) -> None:
        draw, font = _draw_with_default_font(size=60)
        title = "The Lord of the Rings: The Fellowship of the Ring"
        lines = _wrap_title(draw, title, font, max_w=600, max_lines=2)
        self.assertGreaterEqual(len(lines), 1)
        self.assertLessEqual(len(lines), 2)
        self.assertTrue(all(draw.textlength(line, font=font) <= 600 + 1 for line in lines))

    def test_ellipsize_too_long_for_single_line(self) -> None:
        draw, font = _draw_with_default_font(size=60)
        text = "A very very very long phrase that will not fit"
        out = _ellipsize_to_width(draw, text, font, max_w=120)
        self.assertTrue(out.endswith("…"), f"expected ellipsis suffix, got {out!r}")
        self.assertLessEqual(draw.textlength(out, font=font), 120 + 1)


class TestRenderOgCardOffline(unittest.TestCase):
    def test_render_with_local_poster(self) -> None:
        """End-to-end render with a synthetic poster (no network) ⇒ valid 1200×630 PNG."""
        movie = {
            "id": 12345,
            "title": "Una",
            "release_date": "2017-09-01",
            "genres": ["Drama", "Thriller"],
            "poster_url": "",
        }
        poster = Image.new("RGB", (500, 750), color=(40, 40, 80))
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "og-today.png"
            render_og_card(
                movie,
                output=out,
                today_date=date(2026, 5, 8),
                poster_image=poster,
            )
            self.assertTrue(out.is_file())
            self.assertGreater(out.stat().st_size, 1024, "PNG too small to be valid")
            with Image.open(out) as im:
                self.assertEqual(im.size, (CANVAS_W, CANVAS_H))
                self.assertEqual(im.mode, "RGB")

    def test_render_atomic_overwrite_on_success(self) -> None:
        """Successful render replaces any prior PNG at the output path."""
        with tempfile.TemporaryDirectory() as td:
            out = Path(td) / "og-today.png"
            prior_bytes = b"PRIOR_OG_CARD"
            out.write_bytes(prior_bytes)
            poster = Image.new("RGB", (POSTER_W, POSTER_H), color=(80, 0, 0))
            movie = {"title": "X", "genres": ["Drama"], "release_date": "1999-01-01", "poster_url": ""}
            render_og_card(movie, output=out, today_date=date(2026, 5, 8), poster_image=poster)
            self.assertNotEqual(out.read_bytes(), prior_bytes, "atomic replace should overwrite on success")


class TestEntryPointSkipsWhenInputsMissing(unittest.TestCase):
    def test_entry_returns_none_when_today_missing(self) -> None:
        from cron.render_og_today import render_og_today_after_galaxy_export

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "frontend" / "public" / "data").mkdir(parents=True)
            self.assertIsNone(render_og_today_after_galaxy_export(root))

    def test_entry_returns_none_when_galaxy_missing(self) -> None:
        from cron.render_og_today import render_og_today_after_galaxy_export

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            data = root / "frontend" / "public" / "data"
            data.mkdir(parents=True)
            (data / "today.json").write_text(
                json.dumps({"date": "2026-05-08", "movie_id": 1}),
                encoding="utf-8",
            )
            self.assertIsNone(render_og_today_after_galaxy_export(root))

    def test_entry_preserves_prior_png_when_poster_fetch_fails(self) -> None:
        """Per Phase 23 risk-row: poster fetch failure must NOT overwrite yesterday's PNG."""
        from cron import render_og_today as og_mod

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            data = root / "frontend" / "public" / "data"
            data.mkdir(parents=True)
            (data / "today.json").write_text(
                json.dumps({"date": "2026-05-08", "movie_id": 42}),
                encoding="utf-8",
            )
            (data / "galaxy_data.json").write_text(
                json.dumps(
                    {
                        "movies": [
                            {
                                "id": 42,
                                "title": "Bad Network",
                                "release_date": "2020-01-01",
                                "genres": ["Drama"],
                                "poster_url": "https://image.tmdb.org/t/p/w500/fake.jpg",
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            prior = data / "og-today.png"
            prior_bytes = b"PRIOR_OG_CARD_BYTES"
            prior.write_bytes(prior_bytes)

            with mock.patch.object(og_mod, "download_poster", side_effect=OSError("forced")):
                result = og_mod.render_og_today_after_galaxy_export(root)

            self.assertIsNone(result, "entry point must return None when render raises")
            self.assertEqual(prior.read_bytes(), prior_bytes, "prior PNG must be preserved on poster fetch failure")


if __name__ == "__main__":
    unittest.main()
