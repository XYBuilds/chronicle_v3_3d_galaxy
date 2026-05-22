#!/usr/bin/env python3
"""Phase 34.3: Sync OG index metadata to Cloudflare KV after galaxy export.

Scopes:
  - ``daily`` (nightly): ``meta:G`` + ``today`` only
  - ``full`` (monthly / one-time): ``meta:G`` + ``today`` + all ``movie:{id}``

Required env (all or none — otherwise skip with exit 0):
  CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, OG_INDEX_KV_NAMESPACE_ID

Optional:
  OG_INDEX_SYNC_SCOPE — default CLI scope when ``--scope`` omitted
  OG_INDEX_KV_BATCH_SIZE — bulk batch size (default 1000, max 10000)
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCRIPTS_DIR = _REPO_ROOT / "scripts"
_DEFAULT_PUBLIC_DATA = _REPO_ROOT / "frontend" / "public" / "data"

if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from cron.og_index_kv import (  # noqa: E402
    DEFAULT_BULK_BATCH_SIZE,
    _required_kv_env,
    iter_og_index_entries,
    load_galaxy_and_today,
    sync_entries_to_kv,
)


def sync_og_index_after_galaxy_export(
    repo_root: Path,
    *,
    scope: str = "daily",
    batch_size: int = DEFAULT_BULK_BATCH_SIZE,
) -> bool | None:
    """Sync KV after export. Returns True on success, None when env not configured."""
    public_data = (repo_root / "frontend" / "public" / "data").resolve()
    scope_norm = scope.strip().lower()
    if scope_norm not in ("daily", "full"):
        raise ValueError(f"scope must be daily or full, got {scope!r}")

    env = _required_kv_env()
    if env is None:
        print(
            "[og_index_kv] skip: set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, "
            "OG_INDEX_KV_NAMESPACE_ID to enable KV sync",
            flush=True,
        )
        return None

    data_version, today_payload, movies = load_galaxy_and_today(public_data)
    movie_count = len(movies)
    print(
        f"[og_index_kv] scope={scope_norm} data_version={data_version!r} "
        f"movies_in_galaxy={movie_count} today_date={today_payload.get('date')!r}",
        flush=True,
    )

    movies_for_kv = movies if scope_norm == "full" else None
    entries = list(
        iter_og_index_entries(
            data_version=data_version,
            today_payload=today_payload,
            movies=movies_for_kv,
        )
    )
    assert len(entries) >= 2, "must at least write meta:G and today"
    written = sync_entries_to_kv(entries, batch_size=batch_size)
    assert written == len(entries), f"written {written} != entries {len(entries)}"
    print(f"[og_index_kv] done keys_written={written}", flush=True)
    return True


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--public-data-dir",
        type=Path,
        default=_DEFAULT_PUBLIC_DATA,
        help="Directory with galaxy_data.json and today.json",
    )
    p.add_argument(
        "--scope",
        choices=("daily", "full"),
        default=os.environ.get("OG_INDEX_SYNC_SCOPE", "daily").strip().lower() or "daily",
        help="daily = meta:G + today; full = also all movie:{id}",
    )
    p.add_argument(
        "--batch-size",
        type=int,
        default=int(os.environ.get("OG_INDEX_KV_BATCH_SIZE", str(DEFAULT_BULK_BATCH_SIZE))),
        help=f"KV bulk batch size (default {DEFAULT_BULK_BATCH_SIZE})",
    )
    args = p.parse_args(argv)

    if _required_kv_env() is None:
        print(
            "[og_index_kv] skip: set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, "
            "OG_INDEX_KV_NAMESPACE_ID",
            flush=True,
        )
        return 0

    public_data: Path = args.public_data_dir.resolve()
    data_version, today_payload, movies = load_galaxy_and_today(public_data)
    movies_for_kv = movies if args.scope == "full" else None
    entries = list(
        iter_og_index_entries(
            data_version=data_version,
            today_payload=today_payload,
            movies=movies_for_kv,
        )
    )
    written = sync_entries_to_kv(entries, batch_size=args.batch_size)
    print(f"[og_index_kv] CLI done scope={args.scope} keys_written={written}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
