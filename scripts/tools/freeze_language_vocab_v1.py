#!/usr/bin/env python3
"""One-shot audit: print ``collect_sorted_languages`` tuple from a cleaned CSV.

Paste the printed tuple into ``feature_engineering/language_palette.py`` as
``FROZEN_LANG_ORDER_V1`` when the canonical corpus vocabulary changes.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _SCRIPTS_DIR.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

import pandas as pd  # noqa: E402

from feature_engineering.language_encoding import collect_sorted_languages  # noqa: E402


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--input",
        type=Path,
        default=_REPO_ROOT / "data" / "output" / "cleaned.csv",
        help="Cleaned CSV with original_language column",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    inp = args.input.expanduser().resolve()
    if not inp.is_file():
        print(f"Error: file not found: {inp}", file=sys.stderr)
        return 1
    df = pd.read_csv(inp, usecols=["original_language"])
    langs = collect_sorted_languages(df["original_language"])
    print(f"# n_lang={len(langs)}")
    print(repr(tuple(langs)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
