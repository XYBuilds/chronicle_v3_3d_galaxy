#!/usr/bin/env python3
"""P18.4: Seed ``threshold_versions`` from raw TMDB CSV (computes dynamic table on pre-threshold cleaned rows).

Run once after P18.2 import so nightly cron can read ``is_active=true``. Does **not** modify ``movies``.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _SCRIPTS_DIR.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from pipeline.cleaning import (  # noqa: E402
    ABS_MIN,
    ALPHA,
    QUANTILE,
    ROLLING_WINDOW,
    compute_year_to_vote_threshold,
    load_raw_csv,
    run_cleaning_pipeline_before_vote_threshold,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--input",
        type=Path,
        default=_REPO_ROOT / "data" / "raw" / "TMDB_all_movies.csv",
        help="Raw TMDB CSV (same schema as Kaggle daily dump)",
    )
    p.add_argument("--version-label", type=str, default="p18_bootstrap_v1", help="threshold_versions.version PK")
    p.add_argument("--dry-run", action="store_true", help="Print JSON only; do not write Supabase")
    return p.parse_args(argv)


def _deactivate_all_thresholds(supabase: Any) -> None:
    r = supabase.table("threshold_versions").select("version").eq("is_active", True).execute()
    for row in r.data or []:
        v = row["version"]
        supabase.table("threshold_versions").update({"is_active": False}).eq("version", v).execute()
        print(f"[P18.4 seed] Deactivated version={v!r}", flush=True)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    env_path = _REPO_ROOT / ".env"
    if env_path.is_file():
        from dotenv import load_dotenv

        load_dotenv(env_path)

    csv_path = args.input.expanduser().resolve()
    if not csv_path.is_file():
        print(f"Error: raw CSV not found: {csv_path}", file=sys.stderr)
        return 1

    print(f"[P18.4 seed] Loading raw {csv_path} …", flush=True)
    raw = load_raw_csv(csv_path)
    print(f"[P18.4 seed] raw.shape={raw.shape}", flush=True)
    df_pre, _steps, _base = run_cleaning_pipeline_before_vote_threshold(raw)
    print(f"[P18.4 seed] pre-threshold.shape={df_pre.shape}", flush=True)

    thr = compute_year_to_vote_threshold(
        df_pre,
        quantile=QUANTILE,
        alpha=ALPHA,
        abs_min=ABS_MIN,
        rolling_window=ROLLING_WINDOW,
    )
    print(f"[P18.4 seed] thresholds_json years={len(thr)} min_year={min(thr)} max_year={max(thr)}", flush=True)

    row_payload = {
        "version": str(args.version_label).strip(),
        "quantile": float(QUANTILE),
        "alpha": float(ALPHA),
        "rolling_window": int(ROLLING_WINDOW),
        "abs_min": float(ABS_MIN),
        "thresholds_json": thr,
        "is_active": True,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
    if args.dry_run:
        print("[P18.4 seed] --dry-run sample thresholds_json keys:", list(sorted(thr.keys()))[:8], "…", flush=True)
        print(json.dumps({**row_payload, "thresholds_json": "<dict>"}, indent=2))
        return 0

    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("Error: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 1

    from supabase import create_client  # noqa: WPS433

    supabase = create_client(url, key)
    _deactivate_all_thresholds(supabase)
    supabase.table("threshold_versions").insert(row_payload).execute()
    print(f"[P18.4 seed] Inserted active threshold_versions.version={row_payload['version']!r}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
