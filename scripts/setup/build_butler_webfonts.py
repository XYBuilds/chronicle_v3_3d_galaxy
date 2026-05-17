#!/usr/bin/env python3
"""Build Butler WOFF files for the frontend from tracked TTFs in assets/fonts/."""
from __future__ import annotations

import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
_TTF_DIR = _REPO / "assets" / "fonts"
_OUT_DIR = _REPO / "frontend" / "public" / "fonts" / "butler"
_WEIGHTS = ("Butler-Medium", "Butler-Bold")


def main() -> int:
    try:
        from fontTools.ttLib import TTFont
    except ImportError as exc:
        print("[build_butler_webfonts] fonttools required: pip install fonttools", file=sys.stderr)
        raise SystemExit(1) from exc

    _OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stem in _WEIGHTS:
        src = _TTF_DIR / f"{stem}.ttf"
        if not src.is_file():
            print(f"[build_butler_webfonts] missing {src}", file=sys.stderr)
            return 1
        font = TTFont(src)
        font.flavor = "woff"
        dest = _OUT_DIR / f"{stem}.woff"
        font.save(dest)
        size = dest.stat().st_size
        assert size > 1024, f"{dest} too small ({size} bytes); expected real WOFF"
        print(f"[build_butler_webfonts] {dest.name} {size:,} bytes <- {src.name}")

    print(f"[build_butler_webfonts] done -> {_OUT_DIR}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
