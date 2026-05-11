#!/usr/bin/env python3
"""P25.4 — Quantify impact of shipping full `cast[]` vs cap-at-20 in `galaxy_data.json.gz`.

Compares UTF-8 JSON size, gzip (level 9) size, and Python zlib gunzip + json.loads latency.
Does not write production assets unless ``--write-temp-gz`` is set (for optional Node bench).

Cast is a display-only field in the galaxy JSON; it is not used in embeddings / UMAP / Procrustes.
"""
from __future__ import annotations

import argparse
import contextlib
import gzip
import io
import json
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from export.export_galaxy_json import _split_list_cell, build_galaxy_payload  # noqa: E402

_DEFAULT_CSV = _REPO_ROOT / "data" / "output" / "cleaned.csv"
_DEFAULT_XY = _REPO_ROOT / "data" / "output" / "umap_xy.npy"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="P25.4 full cast vs cap-20 payload impact (size + parse bench).")
    p.add_argument("--input", type=Path, default=_DEFAULT_CSV, help="cleaned.csv (same row order as umap_xy.npy)")
    p.add_argument("--xy-input", type=Path, default=_DEFAULT_XY, help="umap_xy.npy")
    p.add_argument("--bench-iters", type=int, default=7, help="Repeat count for gunzip+parse timing (median reported)")
    p.add_argument(
        "--node-bench",
        action="store_true",
        help="After building temp .gz files, run Node zlib+JSON.parse benchmark (requires node on PATH)",
    )
    p.add_argument(
        "--write-temp-gz",
        type=Path,
        default=None,
        help="Directory to write cast20.gz and castfull.gz for external tools (optional)",
    )
    return p.parse_args(argv)


def _payload_bytes(payload: dict[str, object]) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")


def _gzip9(raw: bytes) -> bytes:
    return gzip.compress(raw, compresslevel=9)


def _bench_gunzip_parse(raw_gz: bytes, *, iters: int) -> tuple[list[float], list[float]]:
    gunzip_ms: list[float] = []
    parse_ms: list[float] = []
    for _ in range(iters):
        t0 = time.perf_counter()
        raw_json = gzip.decompress(raw_gz)
        t1 = time.perf_counter()
        json.loads(raw_json.decode("utf-8"))
        t2 = time.perf_counter()
        gunzip_ms.append((t1 - t0) * 1000.0)
        parse_ms.append((t2 - t1) * 1000.0)
    return gunzip_ms, parse_ms


def _cast_stats(df: pd.DataFrame) -> dict[str, float | int]:
    lengths: list[int] = []
    over20 = 0
    max_len = 0
    total_extra_names = 0
    for _, row in df.iterrows():
        n = len(_split_list_cell(row.get("cast")))
        lengths.append(n)
        max_len = max(max_len, n)
        if n > 20:
            over20 += 1
            total_extra_names += n - 20
    arr = np.asarray(lengths, dtype=np.int64)
    return {
        "movies": int(len(df)),
        "cast_names_total": int(arr.sum()),
        "cast_len_min": int(arr.min()) if len(arr) else 0,
        "cast_len_max": max_len,
        "cast_len_mean": float(arr.mean()) if len(arr) else 0.0,
        "cast_len_p95": float(np.percentile(arr, 95)) if len(arr) else 0.0,
        "cast_len_p99": float(np.percentile(arr, 99)) if len(arr) else 0.0,
        "movies_with_cast_gt_20": over20,
        "extra_cast_names_if_uncapped_vs_20": total_extra_names,
    }


def _node_bench_one(gz_path: Path, iters: int) -> dict[str, float]:
    # Node omits `-e` / the inline script from `process.argv`; user args start at index 1.
    js = r"""
const fs = require('fs');
const zlib = require('zlib');
const p = process.argv[1];
const iters = parseInt(process.argv[2], 10);
const buf = fs.readFileSync(p);
let g = 0, j = 0;
for (let i = 0; i < iters; i++) {
  const t0 = performance.now();
  const raw = zlib.gunzipSync(buf);
  const t1 = performance.now();
  JSON.parse(raw.toString('utf8'));
  const t2 = performance.now();
  g += t1 - t0;
  j += t2 - t1;
}
console.log(JSON.stringify({
  gunzip_ms_mean: g / iters,
  parse_ms_mean: j / iters,
}));
"""
    proc = subprocess.run(
        ["node", "-e", js, str(gz_path), str(iters)],
        check=False,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        err = (proc.stderr or "").strip() or (proc.stdout or "").strip() or f"exit {proc.returncode}"
        raise RuntimeError(f"node bench failed: {err}")
    line = proc.stdout.strip().split("\n")[-1]
    return json.loads(line)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    csv_path = args.input.expanduser().resolve()
    xy_path = args.xy_input.expanduser().resolve()
    if not csv_path.is_file():
        print(f"Error: CSV not found: {csv_path}", file=sys.stderr)
        return 1
    if not xy_path.is_file():
        print(f"Error: umap_xy.npy not found: {xy_path}", file=sys.stderr)
        return 1

    df = pd.read_csv(csv_path)
    xy = np.load(xy_path)
    print(f"[Input] rows={len(df)} xy_shape={xy.shape}")
    stats = _cast_stats(df)
    print("[Cast CSV stats]", json.dumps(stats, indent=2))

    now = datetime.now(timezone.utc)
    version = f"p25.4-eval.{now.strftime('%Y%m%d')}"
    generated_at = now.isoformat()

    common_kw = dict(
        version=version,
        generated_at=generated_at,
    )

    _buf = io.StringIO()
    with contextlib.redirect_stdout(_buf):
        payload_20, _genre_order = build_galaxy_payload(df, xy, cast_max=20, **common_kw)
        payload_full, _ = build_galaxy_payload(df, xy, cast_max=0, **common_kw)

    n_mov = len(payload_20["movies"])
    assert n_mov == len(payload_full["movies"]), "movie count mismatch"
    print(f"[Export] movies in payload: {n_mov}")

    raw20 = _payload_bytes(payload_20)
    raw_full = _payload_bytes(payload_full)
    gz20 = _gzip9(raw20)
    gz_full = _gzip9(raw_full)

    delta_raw = len(raw_full) - len(raw20)
    delta_gz = len(gz_full) - len(gz20)
    pct_gz = (delta_gz / len(gz20)) * 100.0 if gz20 else 0.0

    print(
        json.dumps(
            {
                "utf8_json_mb_cap20": len(raw20) / (1024 * 1024),
                "utf8_json_mb_full": len(raw_full) / (1024 * 1024),
                "utf8_delta_mb": delta_raw / (1024 * 1024),
                "gzip9_mb_cap20": len(gz20) / (1024 * 1024),
                "gzip9_mb_full": len(gz_full) / (1024 * 1024),
                "gzip9_delta_mb": delta_gz / (1024 * 1024),
                "gzip9_delta_percent_vs_cap20": round(pct_gz, 3),
            },
            indent=2,
        )
    )

    iters = max(1, int(args.bench_iters))
    g20, p20 = _bench_gunzip_parse(gz20, iters=iters)
    gf, pf = _bench_gunzip_parse(gz_full, iters=iters)
    print(
        "[Python bench | gzip.decompress + json.loads]",
        json.dumps(
            {
                "iterations": iters,
                "cap20_gunzip_ms_median": round(statistics.median(g20), 3),
                "cap20_parse_ms_median": round(statistics.median(p20), 3),
                "full_gunzip_ms_median": round(statistics.median(gf), 3),
                "full_parse_ms_median": round(statistics.median(pf), 3),
                "delta_parse_ms_median": round(statistics.median(pf) - statistics.median(p20), 3),
            },
            indent=2,
        ),
    )

    if args.write_temp_gz:
        out_dir = args.write_temp_gz.expanduser().resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
        p20_path = out_dir / "galaxy_eval_cast20.json.gz"
        pfull_path = out_dir / "galaxy_eval_castfull.json.gz"
        p20_path.write_bytes(gz20)
        pfull_path.write_bytes(gz_full)
        print(f"[Wrote] {p20_path} ({p20_path.stat().st_size / (1024*1024):.3f} MB)")
        print(f"[Wrote] {pfull_path} ({pfull_path.stat().st_size / (1024*1024):.3f} MB)")

    if args.node_bench:
        if not args.write_temp_gz:
            print("Error: --node-bench requires --write-temp-gz <dir>", file=sys.stderr)
            return 1
        nb20 = _node_bench_one(out_dir / "galaxy_eval_cast20.json.gz", iters)
        nbf = _node_bench_one(out_dir / "galaxy_eval_castfull.json.gz", iters)
        print(
            "[Node bench | gunzipSync + JSON.parse]",
            json.dumps({"cap20": nb20, "full": nbf}, indent=2),
        )

    print(
        "\n[Conclusion] Cast is not fed into embedding/UMAP; expanding cast only affects JSON size, "
        "download bytes, decompress, parse, and drawer cast list length (address UI in P25.5)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
