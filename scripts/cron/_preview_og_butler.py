#!/usr/bin/env python3
"""One-off preview: render today's OG card with the **brand line** typeset in Butler
(loaded from ``.tmp_butler/Butler-Medium.ttf`` if present) and lowercased to
``the movie cosmos``.

This script does NOT modify ``render_og_today.py`` — it monkey-patches ``_load_inter``
just for the BRAND_FONT_SIZE call so we can eyeball the result before deciding whether
to bake the change into the canonical renderer.
"""
from __future__ import annotations

import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _SCRIPTS_DIR.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron import render_og_today as og  # noqa: E402

BUTLER_TTF_DIR = _REPO_ROOT / ".tmp_butler"


def main() -> int:
    butler_medium = BUTLER_TTF_DIR / "Butler-Medium.ttf"
    butler_bold = BUTLER_TTF_DIR / "Butler-Bold.ttf"
    assert butler_medium.is_file(), f"missing {butler_medium} (place Butler-Medium.ttf there)"
    assert butler_bold.is_file(), f"missing {butler_bold}"
    print(f"[preview] butler_medium bytes={butler_medium.stat().st_size}", flush=True)
    print(f"[preview] butler_bold bytes={butler_bold.stat().st_size}", flush=True)

    original_loader = og._load_inter

    def patched_loader(size: float, weight: int = 400):
        from PIL import ImageFont  # noqa: WPS433

        # Brand line ONLY: Butler Medium, slightly larger than the Inter equivalent
        # because Butler's serif lettering reads thinner at the same pixel size.
        if abs(size - og.BRAND_FONT_SIZE) < 0.5:
            f = ImageFont.truetype(str(butler_medium), size=size + 6)
            print(f"[preview] brand → Butler Medium @ {size + 6:.0f}px", flush=True)
            return f
        return original_loader(size, weight=weight)

    og._load_inter = patched_loader
    try:
        return og.main(
            [
                "--brand",
                "the movie cosmos",
                "--output",
                str(_REPO_ROOT / "frontend" / "public" / "data" / "og-today.png"),
            ]
        )
    finally:
        og._load_inter = original_loader


if __name__ == "__main__":
    raise SystemExit(main())
