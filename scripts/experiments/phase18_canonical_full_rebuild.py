#!/usr/bin/env python3
"""P18.1a — Canonical full rebuild from raw TMDB CSV into an isolated ``data/runs/p18_1_full_rebuild_*`` directory.

Does **not** overwrite ``data/output`` or ``frontend/public/data``. After acceptance, sync those paths manually if desired.

Usage (from repo root, with raw CSV present)::

    python scripts/experiments/phase18_canonical_full_rebuild.py

If the run died after export on Windows (e.g. ``UnicodeDecodeError`` while streaming validate output), finish without re-UMAP::

    python scripts/experiments/phase18_canonical_full_rebuild.py --resume-after-export data/runs/p18_1_full_rebuild_YYYYMMDD_HHMM

Requires ``data/raw/TMDB_all_movies.csv`` (never read raw in chat; this script reads it locally only).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TextIO

import numpy as np
import pandas as pd

_REPO_ROOT = Path(__file__).resolve().parents[2]

PHI = (1.0 + math.sqrt(5.0)) / 2.0
GENRE_WEIGHT_RATIO = 1.0 / PHI
MODEL_ID = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
EMBEDDING_META = "paraphrase-multilingual-MiniLM-L12-v2"
N_NEIGHBORS = 300
MIN_DIST = 0.4
METRIC = "cosine"
RANDOM_STATE = 42
_DEFAULT_RAW = _REPO_ROOT / "data" / "raw" / "TMDB_all_movies.csv"
_PROD_GALAXY_JSON = _REPO_ROOT / "frontend" / "public" / "data" / "galaxy_data.json"


def _embedding_meta_label(model_id: str) -> str:
    s = str(model_id).strip()
    if s.startswith("sentence-transformers/"):
        return s[len("sentence-transformers/") :]
    return s


@dataclass
class PhaseTimer:
    phases: list[dict[str, Any]] = field(default_factory=list)

    def start(self, name: str) -> tuple[str, float]:
        return name, time.perf_counter()

    def end(self, name: str, t0: float, **extra: Any) -> None:
        dt = time.perf_counter() - t0
        row: dict[str, Any] = {"phase": name, "seconds": round(dt, 3)}
        row.update(extra)
        self.phases.append(row)
        print(f"[P18.1a] Phase timing {name!r}: {dt:.1f}s", flush=True)


def _disk_free_gb(path: Path) -> float:
    usage = shutil.disk_usage(str(path.resolve()))
    return float(usage.free) / (1024.0**3)


def _file_digest_sha256(path: Path, *, chunk: int = 8 * 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def _try_git_revision(repo: Path) -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(repo),
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
        s = out.stdout.strip()
        return s or None
    except (OSError, subprocess.SubprocessError):
        return None


def _print_resource_banner(label: str, *, root: Path) -> None:
    print(
        f"[P18.1a] {label} | disk_free={_disk_free_gb(root):.2f} GB @ {root}",
        flush=True,
    )


def _procrustes_residual_norms(ref_xy: np.ndarray, cur_xy: np.ndarray) -> tuple[np.ndarray, float]:
    """Return per-row Euclidean norms after scipy Procrustes alignment (shape-only, normalized)."""
    from scipy.spatial import procrustes

    if ref_xy.shape != cur_xy.shape:
        raise ValueError(f"Shape mismatch ref {ref_xy.shape} vs cur {cur_xy.shape}")
    if ref_xy.shape[1] != 2:
        raise ValueError("Expected (n, 2) coordinates")
    pa, qa, disparity = procrustes(ref_xy.astype(np.float64), cur_xy.astype(np.float64))
    norms = np.linalg.norm(pa - qa, axis=1)
    return norms, float(disparity)


class _LogFile:
    def __init__(self, path: Path, *, append: bool = False) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        mode = "a" if append else "w"
        self._f: TextIO = path.open(mode, encoding="utf-8", newline="\n")

    def write(self, s: str) -> None:
        self._f.write(s)
        self._f.flush()

    def close(self) -> None:
        self._f.close()


def _run_subprocess_logged(
    cmd: list[str],
    *,
    cwd: Path,
    log: _LogFile,
    label: str,
    heartbeat_s: float = 30.0,
) -> int:
    """Stream child stdout/stderr to console and ``benchmark_log``; optional RSS polling via psutil."""
    # Windows defaults to a legacy ANSI code page for subprocess pipes; child scripts emit UTF-8.
    env = {**os.environ, "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8"}
    print(f"\n[P18.1a] >>> {' '.join(cmd)}", flush=True)
    log.write(f"\n[P18.1a] >>> {' '.join(cmd)}\n")

    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    peak_rss_mb: float | None = None
    stop = threading.Event()

    def _poller() -> None:
        nonlocal peak_rss_mb
        try:
            import psutil  # type: ignore[import-untyped]

            while not stop.is_set():
                if stop.wait(timeout=heartbeat_s):
                    break
                try:
                    proc_obj = psutil.Process(proc.pid)
                    rss = int(proc_obj.memory_info().rss)
                    peak = rss
                    for ch in proc_obj.children(recursive=True):
                        try:
                            peak = max(peak, int(ch.memory_info().rss))
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass
                    peak_rss_mb = max(peak_rss_mb or 0.0, peak / (1024.0**2))
                    print(
                        f"[P18.1a][heartbeat:{label}] child_peak_rss≈{peak_rss_mb:.0f} MB | "
                        f"disk_free={_disk_free_gb(cwd):.2f} GB",
                        flush=True,
                    )
                    log.write(
                        f"[P18.1a][heartbeat:{label}] child_peak_rss≈{peak_rss_mb:.0f} MB | "
                        f"disk_free={_disk_free_gb(cwd):.2f} GB\n"
                    )
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
        except ImportError:
            while not stop.wait(timeout=heartbeat_s):
                msg = f"[P18.1a][heartbeat:{label}] (install psutil for RSS) disk_free={_disk_free_gb(cwd):.2f} GB\n"
                print(msg.strip(), flush=True)
                log.write(msg)

    poller_t = threading.Thread(target=_poller, daemon=True)
    poller_t.start()
    assert proc.stdout is not None
    for line in proc.stdout:
        sys.stdout.write(line)
        sys.stdout.flush()
        log.write(line)
    rc = int(proc.wait() or 0)
    stop.set()
    poller_t.join(timeout=2.0)
    if peak_rss_mb is not None:
        print(f"[P18.1a] {label} subprocess peak RSS (sampled): {peak_rss_mb:.0f} MB", flush=True)
        log.write(f"[P18.1a] {label} subprocess peak RSS (sampled): {peak_rss_mb:.0f} MB\n")
    return rc


def _assert_canonical_meta(meta: dict[str, Any], *, movies_len: int) -> None:
    assert meta["count"] == movies_len, f"meta.count {meta['count']} != len(movies) {movies_len}"
    assert str(meta["embedding_model"]) == EMBEDDING_META, meta["embedding_model"]
    up = meta["umap_params"]
    assert int(up["n_neighbors"]) == N_NEIGHBORS
    assert math.isclose(float(up["min_dist"]), MIN_DIST, rel_tol=0.0, abs_tol=1e-12)
    assert str(up["metric"]) == METRIC
    assert int(up["random_state"]) == RANDOM_STATE
    assert up.get("densmap") is True, up.get("densmap")
    assert math.isclose(float(meta["genre_weight_ratio"]), GENRE_WEIGHT_RATIO, rel_tol=0.0, abs_tol=1e-12)
    fw = meta["feature_weights"]
    assert float(fw["text"]) == 1.0 and float(fw["genre"]) == 1.0 and float(fw["lang"]) == 1.0


def _compare_to_production(
    new_meta: dict[str, Any],
    new_movies: list[dict[str, Any]],
    prod_path: Path,
    log: _LogFile,
) -> dict[str, Any] | None:
    if not prod_path.is_file():
        msg = f"[P18.1a] Production JSON missing ({prod_path}); skip diff vs production.\n"
        print(msg.strip(), flush=True)
        log.write(msg)
        return None

    raw = prod_path.read_text(encoding="utf-8")
    prod = json.loads(raw)
    p_meta, p_movies = prod["meta"], prod["movies"]

    out: dict[str, Any] = {
        "production_path": str(prod_path),
        "meta_count_prod": int(p_meta["count"]),
        "meta_count_new": int(new_meta["count"]),
        "xy_range_prod": p_meta.get("xy_range"),
        "xy_range_new": new_meta.get("xy_range"),
        "z_range_prod": p_meta.get("z_range"),
        "z_range_new": new_meta.get("z_range"),
        "umap_params_match": p_meta.get("umap_params") == new_meta.get("umap_params"),
    }

    pmap = {int(m["id"]): (float(m["x"]), float(m["y"])) for m in p_movies}
    cmap = {int(m["id"]): (float(m["x"]), float(m["y"])) for m in new_movies}
    common = sorted(set(pmap) & set(cmap))
    out["id_intersection"] = len(common)
    out["id_only_prod"] = len(set(pmap) - set(cmap))
    out["id_only_new"] = len(set(cmap) - set(pmap))

    if len(common) < 3:
        msg = f"[P18.1a] Skip Procrustes: need >=3 common ids, got {len(common)}\n"
        print(msg.strip(), flush=True)
        log.write(msg)
        out["procrustes_skipped"] = True
        return out

    if len(common) < 1000:
        print(f"[P18.1a] Warning: only {len(common)} common ids for Procrustes", flush=True)
        log.write(f"[P18.1a] Warning: only {len(common)} common ids for Procrustes\n")

    p_xy = np.array([pmap[i] for i in common], dtype=np.float64)
    c_xy = np.array([cmap[i] for i in common], dtype=np.float64)
    norms, disparity = _procrustes_residual_norms(p_xy, c_xy)
    out["procrustes_disparity"] = disparity
    out["procrustes_residual_norm_p50"] = float(np.percentile(norms, 50))
    out["procrustes_residual_norm_p95"] = float(np.percentile(norms, 95))
    out["procrustes_residual_norm_p99"] = float(np.percentile(norms, 99))
    out["procrustes_residual_norm_max"] = float(np.max(norms))

    prod_json_mb = prod_path.stat().st_size / (1024**2)
    prod_gz = prod_path.with_suffix(".json.gz")
    prod_gz_mb = prod_gz.stat().st_size / (1024**2) if prod_gz.is_file() else None
    prod_si = prod_path.parent / "galaxy_search_index.json.gz"
    prod_si_mb = prod_si.stat().st_size / (1024**2) if prod_si.is_file() else None
    out["file_sizes_mb"] = {
        "production_json": prod_json_mb,
        "production_gzip": prod_gz_mb,
        "production_search_index_gzip": prod_si_mb,
    }

    print(
        "[P18.1a] vs production: "
        f"count prod={p_meta['count']} new={new_meta['count']} | "
        f"common_ids={len(common)} | "
        f"Procrustes residual norm p50/p95/p99/max="
        f"{out['procrustes_residual_norm_p50']:.6f}/"
        f"{out['procrustes_residual_norm_p95']:.6f}/"
        f"{out['procrustes_residual_norm_p99']:.6f}/"
        f"{out['procrustes_residual_norm_max']:.6f}",
        flush=True,
    )
    log.write(json.dumps({"compare_to_production": out}, indent=2) + "\n")
    return out


def _finalize_validate_and_manifest(
    *,
    run_dir: Path,
    log: _LogFile,
    log_path: Path,
    prod_path: Path,
    timer: PhaseTimer,
    t_wall0: float,
    rev: str | None,
    raw_path: Path | None,
    raw_bytes: int | None,
    raw_sha256: str | None,
    n_clean: int,
    embedding_device: str,
    embedding_batch_size: int,
    resume_after_export: bool,
) -> int:
    """Validate exported JSON, assert canonical meta, optional production diff, write ``run_manifest.json``."""

    def banner(msg: str) -> None:
        line = f"\n{'=' * 72}\n[P18.1a] {msg}\n{'=' * 72}\n"
        print(line, flush=True)
        log.write(line)

    py = sys.executable
    cleaned_csv = run_dir / "cleaned.csv"
    text_npy = run_dir / "text_embeddings.npy"
    genre_npy = run_dir / "genre_vectors.npy"
    lang_npy = run_dir / "language_vectors.npy"
    genre_meta = run_dir / "genre_encoding_meta.json"
    lang_meta = run_dir / "language_encoding_meta.json"
    umap_xy = run_dir / "umap_xy.npy"
    umap_pkl = run_dir / "umap_model.pkl"
    galaxy_json = run_dir / "galaxy_data.json"
    galaxy_gz = run_dir / "galaxy_data.json.gz"
    search_gz = run_dir / "galaxy_search_index.json.gz"

    for label, pth in (
        ("galaxy_data.json", galaxy_json),
        ("galaxy_data.json.gz", galaxy_gz),
        ("galaxy_search_index.json.gz", search_gz),
    ):
        if not pth.is_file():
            print(f"Error: expected output missing: {pth}", file=sys.stderr)
            log.close()
            return 1
        mb = pth.stat().st_size / (1024**2)
        print(f"[P18.1a] {label}: {mb:.2f} MB ({pth.stat().st_size:,} bytes)", flush=True)
        log.write(f"[P18.1a] {label}: {mb:.2f} MB ({pth.stat().st_size:,} bytes)\n")

    banner("Validate galaxy_data.json")
    ph, t0 = timer.start("validate_json")
    cmd7 = [py, str(_REPO_ROOT / "scripts" / "validate_galaxy_json.py"), "--input", str(galaxy_json)]
    rc = _run_subprocess_logged(cmd7, cwd=_REPO_ROOT, log=log, label="validate")
    if rc != 0:
        log.close()
        return rc
    timer.end(ph, t0)

    payload = json.loads(galaxy_json.read_text(encoding="utf-8"))
    meta, movies = payload["meta"], payload["movies"]

    print(f"[P18.1a] Loaded export meta.count={meta['count']} len(movies)={len(movies)}", flush=True)
    log.write(f"[P18.1a] Loaded export meta.count={meta['count']} len(movies)={len(movies)}\n")
    assert len(movies) == n_clean, f"movies {len(movies)} vs cleaned {n_clean}"
    _assert_canonical_meta(meta, movies_len=len(movies))

    compare = _compare_to_production(meta, movies, prod_path, log)

    wall_s = time.perf_counter() - t_wall0
    manifest: dict[str, Any] = {
        "schema": "p18_1a_run_manifest_v1",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "git_rev": rev,
        "raw_csv": str(raw_path) if raw_path is not None else None,
        "raw_bytes": raw_bytes,
        "raw_sha256": raw_sha256,
        "run_dir": str(run_dir),
        "resume_after_export": bool(resume_after_export),
        "production_params": {
            "embedding_model_id": MODEL_ID,
            "embedding_meta": EMBEDDING_META,
            "n_neighbors": N_NEIGHBORS,
            "min_dist": MIN_DIST,
            "metric": METRIC,
            "random_state": RANDOM_STATE,
            "densmap": True,
            "genre_weight_ratio": GENRE_WEIGHT_RATIO,
            "feature_weights": {"text": 1.0, "genre": 1.0, "lang": 1.0},
        },
        "embedding_cli": {"device": embedding_device, "batch_size": int(embedding_batch_size)},
        "phases": timer.phases,
        "wall_clock_seconds_total": round(wall_s, 3),
        "cleaned_rows": n_clean,
        "export_meta_xy_range": meta.get("xy_range"),
        "export_meta_z_range": meta.get("z_range"),
        "compare_to_production": compare,
        "artifact_sizes_mb": {
            "galaxy_data.json": round(galaxy_json.stat().st_size / (1024**2), 4),
            "galaxy_data.json.gz": round(galaxy_gz.stat().st_size / (1024**2), 4),
            "galaxy_search_index.json.gz": round(search_gz.stat().st_size / (1024**2), 4),
            "cleaned.csv": round(cleaned_csv.stat().st_size / (1024**2), 4) if cleaned_csv.is_file() else None,
            "text_embeddings.npy": round(text_npy.stat().st_size / (1024**2), 4) if text_npy.is_file() else None,
            "genre_vectors.npy": round(genre_npy.stat().st_size / (1024**2), 4) if genre_npy.is_file() else None,
            "language_vectors.npy": round(lang_npy.stat().st_size / (1024**2), 4) if lang_npy.is_file() else None,
            "umap_xy.npy": round(umap_xy.stat().st_size / (1024**2), 4) if umap_xy.is_file() else None,
        },
        "artifact_paths": {
            "cleaned_csv": str(cleaned_csv),
            "text_embeddings": str(text_npy),
            "genre_vectors": str(genre_npy),
            "language_vectors": str(lang_npy),
            "umap_xy": str(umap_xy),
            "umap_model_pkl": str(umap_pkl),
            "galaxy_data_json": str(galaxy_json),
            "galaxy_data_json_gz": str(galaxy_gz),
            "galaxy_search_index_json_gz": str(search_gz),
            "genre_encoding_meta": str(genre_meta),
            "language_encoding_meta": str(lang_meta),
            "benchmark_log": str(log_path),
        },
    }
    manifest_path = run_dir / "run_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[P18.1a] Wrote {manifest_path}", flush=True)

    summary = (
        f"\n[P18.1a] DONE: wall {wall_s/60:.1f} min | run_dir={run_dir}\n"
        f"         meta.count={meta['count']} | validate OK | manifest written\n"
    )
    print(summary, flush=True)
    log.write(summary)
    log.close()
    return 0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", type=Path, default=_DEFAULT_RAW, help="Raw TMDB CSV")
    p.add_argument(
        "--production-json",
        type=Path,
        default=_PROD_GALAXY_JSON,
        help="Existing galaxy_data.json for Procrustes / meta diff",
    )
    p.add_argument(
        "--embedding-device",
        type=str,
        default="cuda",
        choices=("cuda", "cpu", "auto"),
        help="Forwarded to text_embedding.py",
    )
    p.add_argument("--embedding-batch-size", type=int, default=64, help="Forwarded to text_embedding.py")
    p.add_argument(
        "--skip-sha256-raw",
        action="store_true",
        help="Skip full-file SHA-256 of raw CSV (saves time on huge files)",
    )
    p.add_argument(
        "--resume-after-export",
        type=Path,
        default=None,
        metavar="RUN_DIR",
        help=(
            "Skip phases 1–6; use an existing run directory that already contains galaxy_data.json (+ gzip + search). "
            "Runs validate + meta asserts + production diff + run_manifest.json only (avoids re-running UMAP)."
        ),
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    prod_path = args.production_json.expanduser().resolve()

    if args.resume_after_export is not None:
        run_dir = args.resume_after_export.expanduser().resolve()
        need = [
            ("cleaned.csv", run_dir / "cleaned.csv"),
            ("galaxy_data.json", run_dir / "galaxy_data.json"),
            ("galaxy_data.json.gz", run_dir / "galaxy_data.json.gz"),
            ("galaxy_search_index.json.gz", run_dir / "galaxy_search_index.json.gz"),
        ]
        for label, pth in need:
            if not pth.is_file():
                print(f"Error: --resume-after-export requires {label}: {pth}", file=sys.stderr)
                return 1
        log_path = run_dir / "benchmark_log.txt"
        log = _LogFile(log_path, append=True)
        timer = PhaseTimer()
        t_wall0 = time.perf_counter()
        rev = _try_git_revision(_REPO_ROOT)
        head = f"\n{'=' * 72}\n[P18.1a] RESUME: validate + run_manifest only\n{'=' * 72}\n"
        print(head, flush=True)
        log.write(head)
        n_clean = int(pd.read_csv(run_dir / "cleaned.csv", usecols=["id"]).shape[0])
        print(f"[P18.1a] resume run_dir={run_dir}\n[P18.1a] cleaned_rows={n_clean:,} (from cleaned.csv id column)", flush=True)
        log.write(f"[P18.1a] resume run_dir={run_dir}\ncleaned_rows={n_clean:,}\n")
        return _finalize_validate_and_manifest(
            run_dir=run_dir,
            log=log,
            log_path=log_path,
            prod_path=prod_path,
            timer=timer,
            t_wall0=t_wall0,
            rev=rev,
            raw_path=None,
            raw_bytes=None,
            raw_sha256=None,
            n_clean=n_clean,
            embedding_device=str(args.embedding_device),
            embedding_batch_size=int(args.embedding_batch_size),
            resume_after_export=True,
        )

    raw_path = args.input.expanduser().resolve()
    if not raw_path.is_file():
        print(f"Error: raw CSV not found: {raw_path}", file=sys.stderr)
        return 1

    stamp = datetime.now().strftime("%Y%m%d_%H%M")
    runs_root = _REPO_ROOT / "data" / "runs"
    run_dir = runs_root / f"p18_1_full_rebuild_{stamp}"
    if run_dir.exists():
        i = 2
        while (runs_root / f"p18_1_full_rebuild_{stamp}_{i}").exists():
            i += 1
        run_dir = runs_root / f"p18_1_full_rebuild_{stamp}_{i}"
    run_dir.mkdir(parents=True, exist_ok=False)

    log_path = run_dir / "benchmark_log.txt"
    log = _LogFile(log_path)
    timer = PhaseTimer()
    t_wall0 = time.perf_counter()

    def banner(msg: str) -> None:
        line = f"\n{'=' * 72}\n[P18.1a] {msg}\n{'=' * 72}\n"
        print(line, flush=True)
        log.write(line)

    banner(f"Run directory: {run_dir}")
    print(f"[P18.1a] Repo root: {_REPO_ROOT}", flush=True)
    log.write(f"[P18.1a] Repo root: {_REPO_ROOT}\n")
    rev = _try_git_revision(_REPO_ROOT)
    print(f"[P18.1a] git HEAD: {rev or '<unknown>'}", flush=True)
    log.write(f"[P18.1a] git HEAD: {rev or '<unknown>'}\n")

    st = raw_path.stat()
    print(
        f"[P18.1a] Raw CSV path={raw_path}\n"
        f"         size_bytes={st.st_size:,} mtime_utc={datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()}",
        flush=True,
    )
    log.write(
        f"[P18.1a] Raw CSV path={raw_path}\n"
        f"         size_bytes={st.st_size:,} mtime_utc={datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()}\n"
    )
    raw_sha256: str | None = None
    if not args.skip_sha256_raw:
        t0 = time.perf_counter()
        digest = _file_digest_sha256(raw_path)
        raw_sha256 = digest
        print(f"[P18.1a] Raw SHA256 (full file): {digest} ({time.perf_counter() - t0:.1f}s)", flush=True)
        log.write(f"[P18.1a] Raw SHA256 (full file): {digest}\n")

    cleaned_csv = run_dir / "cleaned.csv"
    py = sys.executable

    # --- Phase 1: cleaning ---
    banner("Phase 1/6 — cleaning → cleaned.csv (isolated output)")
    _print_resource_banner("pre Phase 1", root=_REPO_ROOT)
    ph, t0 = timer.start("phase1_cleaning")
    cmd1 = [
        py,
        str(_REPO_ROOT / "scripts" / "run_pipeline.py"),
        "--input",
        str(raw_path),
        "--output",
        str(cleaned_csv),
        "--phase-1-only",
    ]
    rc = _run_subprocess_logged(cmd1, cwd=_REPO_ROOT, log=log, label="cleaning")
    if rc != 0:
        print(f"Error: Phase 1 failed rc={rc}", file=sys.stderr)
        log.close()
        return rc
    timer.end(ph, t0)

    df = pd.read_csv(cleaned_csv)
    n_clean = len(df)
    print(f"[P18.1a] Post-clean shape: {df.shape} | rows={n_clean:,}", flush=True)
    log.write(f"[P18.1a] Post-clean shape: {df.shape} | rows={n_clean:,}\n")
    assert n_clean == df.shape[0]
    lo, hi = 55_000, 65_000
    assert lo <= n_clean <= hi, f"cleaned rows {n_clean} outside [{lo}, {hi}] (override cleaning if intentional)"

    text_npy = run_dir / "text_embeddings.npy"
    genre_npy = run_dir / "genre_vectors.npy"
    lang_npy = run_dir / "language_vectors.npy"
    genre_meta = run_dir / "genre_encoding_meta.json"
    lang_meta = run_dir / "language_encoding_meta.json"
    umap_xy = run_dir / "umap_xy.npy"
    umap_pkl = run_dir / "umap_model.pkl"
    galaxy_json = run_dir / "galaxy_data.json"
    galaxy_gz = run_dir / "galaxy_data.json.gz"
    search_gz = run_dir / "galaxy_search_index.json.gz"

    # --- Phase 2: embeddings ---
    banner("Phase 2/6 — text embeddings (384d MiniLM)")
    _print_resource_banner("pre Phase 2", root=run_dir)
    ph, t0 = timer.start("phase2_text_embedding")
    cmd2 = [
        py,
        str(_REPO_ROOT / "scripts" / "feature_engineering" / "text_embedding.py"),
        "--input",
        str(cleaned_csv),
        "--output",
        str(text_npy),
        "--model-id",
        MODEL_ID,
        "--device",
        str(args.embedding_device),
        "--batch-size",
        str(int(args.embedding_batch_size)),
    ]
    rc = _run_subprocess_logged(cmd2, cwd=_REPO_ROOT, log=log, label="embedding")
    if rc != 0:
        log.close()
        return rc
    timer.end(
        ph,
        t0,
        embedding_device=str(args.embedding_device),
        embedding_batch_size=int(args.embedding_batch_size),
    )
    te = np.load(text_npy)
    print(f"[P18.1a] text_embeddings.npy shape={te.shape} dtype={te.dtype}", flush=True)
    log.write(f"[P18.1a] text_embeddings.npy shape={te.shape} dtype={te.dtype}\n")
    assert te.ndim == 2 and te.shape[0] == n_clean and te.shape[1] == 384

    # --- Phase 3: genre ---
    banner("Phase 3/6 — genre vectors")
    ph, t0 = timer.start("phase3_genre")
    cmd3 = [
        py,
        str(_REPO_ROOT / "scripts" / "feature_engineering" / "genre_encoding.py"),
        "--input",
        str(cleaned_csv),
        "--output",
        str(genre_npy),
        "--genre-weight-ratio",
        repr(GENRE_WEIGHT_RATIO),
        "--meta-output",
        str(genre_meta),
    ]
    rc = _run_subprocess_logged(cmd3, cwd=_REPO_ROOT, log=log, label="genre")
    if rc != 0:
        log.close()
        return rc
    timer.end(ph, t0)
    gv = np.load(genre_npy)
    print(f"[P18.1a] genre_vectors.npy shape={gv.shape}", flush=True)
    log.write(f"[P18.1a] genre_vectors.npy shape={gv.shape}\n")
    assert gv.shape[0] == n_clean

    # --- Phase 4: language ---
    banner("Phase 4/6 — language vectors")
    ph, t0 = timer.start("phase4_language")
    cmd4 = [
        py,
        str(_REPO_ROOT / "scripts" / "feature_engineering" / "language_encoding.py"),
        "--input",
        str(cleaned_csv),
        "--output",
        str(lang_npy),
        "--meta-output",
        str(lang_meta),
    ]
    rc = _run_subprocess_logged(cmd4, cwd=_REPO_ROOT, log=log, label="language")
    if rc != 0:
        log.close()
        return rc
    timer.end(ph, t0)
    lv = np.load(lang_npy)
    print(f"[P18.1a] language_vectors.npy shape={lv.shape}", flush=True)
    log.write(f"[P18.1a] language_vectors.npy shape={lv.shape}\n")
    assert lv.shape[0] == n_clean

    # --- Phase 5: UMAP DensMAP CPU ---
    banner("Phase 5/6 — UMAP DensMAP (umap-learn CPU, n_jobs=1 inside umap_projection)")
    _print_resource_banner("pre Phase 5", root=run_dir)
    ph, t0 = timer.start("phase5_umap")
    cmd5 = [
        py,
        str(_REPO_ROOT / "scripts" / "feature_engineering" / "umap_projection.py"),
        "--text-input",
        str(text_npy),
        "--genre-input",
        str(genre_npy),
        "--lang-input",
        str(lang_npy),
        "--output-xy",
        str(umap_xy),
        "--model-output",
        str(umap_pkl),
        "--backend",
        "umap",
        "--densmap",
        "--n-neighbors",
        str(N_NEIGHBORS),
        "--min-dist",
        str(MIN_DIST),
        "--metric",
        METRIC,
        "--random-state",
        str(RANDOM_STATE),
        "--w-text",
        "1.0",
        "--w-genre",
        "1.0",
        "--w-lang",
        "1.0",
    ]
    rc = _run_subprocess_logged(cmd5, cwd=_REPO_ROOT, log=log, label="umap", heartbeat_s=30.0)
    if rc != 0:
        log.close()
        return rc
    timer.end(ph, t0)
    xy = np.load(umap_xy)
    print(f"[P18.1a] umap_xy.npy shape={xy.shape} x[{xy[:, 0].min():.4f},{xy[:, 0].max():.4f}] y[{xy[:, 1].min():.4f},{xy[:, 1].max():.4f}]", flush=True)
    log.write(
        f"[P18.1a] umap_xy.npy shape={xy.shape} x[{xy[:, 0].min():.4f},{xy[:, 0].max():.4f}] "
        f"y[{xy[:, 1].min():.4f},{xy[:, 1].max():.4f}]\n"
    )
    assert xy.shape == (n_clean, 2)

    # --- Phase 6: export ---
    banner("Phase 6/6 — export galaxy_data.json + gzip + search index")
    ph, t0 = timer.start("phase6_export")
    cmd6 = [
        py,
        str(_REPO_ROOT / "scripts" / "export" / "export_galaxy_json.py"),
        "--input",
        str(cleaned_csv),
        "--xy-input",
        str(umap_xy),
        "--output-json",
        str(galaxy_json),
        "--output-gzip",
        str(galaxy_gz),
        "--n-neighbors",
        str(N_NEIGHBORS),
        "--min-dist",
        str(MIN_DIST),
        "--metric",
        METRIC,
        "--random-state",
        str(RANDOM_STATE),
        "--densmap",
        "--embedding-model",
        _embedding_meta_label(MODEL_ID),
        "--genre-weight-ratio",
        repr(GENRE_WEIGHT_RATIO),
        "--w-text",
        "1.0",
        "--w-genre",
        "1.0",
        "--w-lang",
        "1.0",
    ]
    rc = _run_subprocess_logged(cmd6, cwd=_REPO_ROOT, log=log, label="export")
    if rc != 0:
        log.close()
        return rc
    timer.end(ph, t0)

    return _finalize_validate_and_manifest(
        run_dir=run_dir,
        log=log,
        log_path=log_path,
        prod_path=prod_path,
        timer=timer,
        t_wall0=t_wall0,
        rev=rev,
        raw_path=raw_path,
        raw_bytes=int(st.st_size),
        raw_sha256=raw_sha256,
        n_clean=n_clean,
        embedding_device=str(args.embedding_device),
        embedding_batch_size=int(args.embedding_batch_size),
        resume_after_export=False,
    )


if __name__ == "__main__":
    raise SystemExit(main())
