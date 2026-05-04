#!/usr/bin/env python3
"""P18.1b — Core refit benchmark (fusion → DensMAP UMAP → Procrustes → optional export).

Loads canonical P18.1a artifacts (no raw cleaning, no text re-embedding). Intended for
local timing and for GitHub Actions ``ubuntu-24.04`` wall-clock / RSS measurement.

Usage::

    python scripts/experiments/phase18_core_refit_benchmark.py \\
        --run-dir data/runs/p18_1_full_rebuild_YYYYMMDD_HHMM

Outputs (default under ``--run-dir``):

- ``umap_xy_p18_core_benchmark.npy`` — Procrustes-aligned coordinates (float32)
- ``benchmark_report.json`` — timings, shapes, RSS samples, Procrustes metrics
- ``benchmark_core_log.txt`` — mirror of stdout (unless ``--log-file``)

Reference xy for Procrustes defaults to ``umap_xy.npy`` in the same run directory
(canonical v1 from P18.1a). Row order must match ``cleaned.csv`` and the feature .npy
files (same contract as ``umap_projection.py``).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import platform
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
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.feature_engineering.umap_projection import (  # noqa: E402
    _fit_umap_learn,
    _umap_n_neighbors,
    fuse_modalities,
)

PHI = (1.0 + math.sqrt(5.0)) / 2.0
GENRE_WEIGHT_RATIO = 1.0 / PHI
EMBEDDING_META = "paraphrase-multilingual-MiniLM-L12-v2"
N_NEIGHBORS = 300
MIN_DIST = 0.4
METRIC = "cosine"
RANDOM_STATE = 42


def _disk_free_gb(path: Path) -> float:
    usage = shutil.disk_usage(str(path.resolve()))
    return float(usage.free) / (1024.0**3)


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


def _procrustes_residual_norms(ref_xy: np.ndarray, cur_xy: np.ndarray) -> tuple[np.ndarray, float]:
    from scipy.spatial import procrustes

    if ref_xy.shape != cur_xy.shape:
        raise ValueError(f"Shape mismatch ref {ref_xy.shape} vs cur {cur_xy.shape}")
    if ref_xy.shape[1] != 2:
        raise ValueError("Expected (n, 2) coordinates")
    pa, qa, disparity = procrustes(ref_xy.astype(np.float64), cur_xy.astype(np.float64))
    norms = np.linalg.norm(pa - qa, axis=1)
    return norms, float(disparity)


def _align_new_to_ref_physical(ref_xy: np.ndarray, new_xy: np.ndarray) -> tuple[np.ndarray, float]:
    """Full Procrustes (scale/rot/reflect/translate); map aligned points to ref physical frame."""
    from scipy.spatial import procrustes

    ref = np.asarray(ref_xy, dtype=np.float64)
    new = np.asarray(new_xy, dtype=np.float64)
    mtx1, mtx2, disparity = procrustes(ref, new)
    mu_r = ref.mean(axis=0)
    norm1 = float(np.linalg.norm(ref - mu_r))
    aligned = mtx2 * norm1 + mu_r
    return aligned.astype(np.float32), float(disparity)


class _TeeLog:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._f: TextIO = path.open("w", encoding="utf-8", newline="\n")

    def line(self, s: str) -> None:
        msg = s if s.endswith("\n") else s + "\n"
        sys.stdout.write(msg)
        sys.stdout.flush()
        self._f.write(msg)
        self._f.flush()

    def close(self) -> None:
        self._f.close()


@dataclass
class RssSampler:
    peak_mb: float = 0.0
    samples: list[dict[str, Any]] = field(default_factory=list)
    _stop: threading.Event = field(default_factory=threading.Event)
    _thread: threading.Thread | None = None

    def start(self, *, label: str, interval_s: float, root: Path) -> None:
        self._stop.clear()

        def _loop() -> None:
            try:
                import psutil  # type: ignore[import-untyped]

                proc = psutil.Process(os.getpid())
            except ImportError:
                while not self._stop.wait(timeout=interval_s):
                    self.samples.append(
                        {
                            "t_wall_s": round(time.perf_counter(), 3),
                            "rss_mb": None,
                            "disk_free_gb": round(_disk_free_gb(root), 3),
                            "note": "psutil not installed",
                        }
                    )
                return

            while not self._stop.wait(timeout=interval_s):
                rss = int(proc.memory_info().rss)
                peak = rss
                for ch in proc.children(recursive=True):
                    try:
                        peak = max(peak, int(ch.memory_info().rss))
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
                peak_mb = peak / (1024.0**2)
                self.peak_mb = max(self.peak_mb, peak_mb)
                self.samples.append(
                    {
                        "t_wall_s": round(time.perf_counter(), 3),
                        "rss_mb": round(peak_mb, 1),
                        "disk_free_gb": round(_disk_free_gb(root), 3),
                        "label": label,
                    }
                )

        self._thread = threading.Thread(target=_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)


def _runner_info() -> dict[str, Any]:
    out: dict[str, Any] = {
        "platform": platform.platform(),
        "python": sys.version.split()[0],
        "cpu_count": os.cpu_count(),
    }
    p = Path("/proc/meminfo")
    if p.is_file():
        try:
            txt = p.read_text(encoding="utf-8", errors="replace").splitlines()
            for line in txt:
                if line.startswith("MemTotal:"):
                    parts = line.split()
                    if len(parts) >= 2:
                        kb = int(parts[1])
                        out["mem_total_gb"] = round(kb / (1024.0**2), 2)
                    break
        except OSError:
            pass
    return out


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="P18.1b core refit benchmark (fusion + UMAP + Procrustes).")
    p.add_argument(
        "--run-dir",
        type=Path,
        required=True,
        help="Directory with cleaned.csv, text/genre/lang .npy, umap_xy.npy (reference)",
    )
    p.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Where to write outputs (default: same as --run-dir)",
    )
    p.add_argument("--log-file", type=Path, default=None, help="Tee log path (default: <output-dir>/benchmark_core_log.txt)")
    p.add_argument(
        "--ref-xy",
        type=Path,
        default=None,
        help="Reference xy .npy for Procrustes (default: <run-dir>/umap_xy.npy)",
    )
    p.add_argument(
        "--out-xy",
        type=Path,
        default=None,
        help="Output aligned xy (default: <output-dir>/umap_xy_p18_core_benchmark.npy)",
    )
    p.add_argument("--n-neighbors", type=int, default=N_NEIGHBORS)
    p.add_argument("--min-dist", type=float, default=MIN_DIST)
    p.add_argument("--metric", type=str, default=METRIC)
    p.add_argument("--random-state", type=int, default=RANDOM_STATE)
    p.add_argument("--w-text", type=float, default=1.0)
    p.add_argument("--w-genre", type=float, default=1.0)
    p.add_argument("--w-lang", type=float, default=1.0)
    p.add_argument("--heartbeat-seconds", type=float, default=30.0)
    p.add_argument(
        "--with-export",
        action="store_true",
        help="Run export_galaxy_json + validate_galaxy_json on aligned xy (adds wall time)",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    run_dir = args.run_dir.expanduser().resolve()
    out_dir = (args.output_dir or run_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    log_path = args.log_file or (out_dir / "benchmark_core_log.txt")
    ref_xy_path = (args.ref_xy or (run_dir / "umap_xy.npy")).expanduser().resolve()
    out_xy_path = (args.out_xy or (out_dir / "umap_xy_p18_core_benchmark.npy")).expanduser().resolve()
    report_path = out_dir / "benchmark_report.json"

    log = _TeeLog(log_path)

    def pr(msg: str) -> None:
        log.line(msg)

    t_wall0 = time.perf_counter()
    pr("=" * 72)
    pr("[P18.1b] Core refit benchmark")
    pr(f"[P18.1b] run_dir={run_dir}")
    pr(f"[P18.1b] output_dir={out_dir}")
    pr(f"[P18.1b] ref_xy={ref_xy_path}")
    pr(f"[P18.1b] out_xy={out_xy_path}")
    pr(f"[P18.1b] git HEAD={_try_git_revision(_REPO_ROOT)}")
    pr(f"[P18.1b] runner={json.dumps(_runner_info(), indent=2)}")
    pr(f"[P18.1b] disk_free={_disk_free_gb(_REPO_ROOT):.2f} GB @ {_REPO_ROOT}")
    pr("=" * 72)

    cleaned = run_dir / "cleaned.csv"
    text_p = run_dir / "text_embeddings.npy"
    genre_p = run_dir / "genre_vectors.npy"
    lang_p = run_dir / "language_vectors.npy"
    for label, pth in (
        ("cleaned.csv", cleaned),
        ("text_embeddings.npy", text_p),
        ("genre_vectors.npy", genre_p),
        ("language_vectors.npy", lang_p),
        ("reference umap_xy.npy", ref_xy_path),
    ):
        if not pth.is_file():
            pr(f"[P18.1b] ERROR missing file: {label} -> {pth}")
            log.close()
            return 1

    df = pd.read_csv(cleaned)
    assert "id" in df.columns, "cleaned.csv must have id column"
    n_csv = len(df)
    pr(f"[P18.1b] cleaned.csv shape={df.shape} | rows={n_csv:,}")

    text = np.load(text_p)
    genre = np.load(genre_p)
    lang = np.load(lang_p)
    ref_xy = np.load(ref_xy_path)
    pr(f"[P18.1b] text_embeddings {text.shape} dtype={text.dtype}")
    pr(f"[P18.1b] genre_vectors {genre.shape} dtype={genre.dtype}")
    pr(f"[P18.1b] language_vectors {lang.shape} dtype={lang.dtype}")
    pr(f"[P18.1b] ref_xy {ref_xy.shape} dtype={ref_xy.dtype}")

    assert text.ndim == 2 and genre.ndim == 2 and lang.ndim == 2
    assert ref_xy.ndim == 2 and ref_xy.shape[1] == 2
    assert text.shape[0] == genre.shape[0] == lang.shape[0] == ref_xy.shape[0] == n_csv, (
        f"row mismatch: csv={n_csv} text={text.shape[0]} genre={genre.shape[0]} "
        f"lang={lang.shape[0]} ref={ref_xy.shape[0]}"
    )
    assert int(text.shape[1]) == 384, f"expected 384d MiniLM, got {text.shape[1]}"

    report: dict[str, Any] = {
        "schema": "p18_1b_benchmark_report_v1",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "run_dir": str(run_dir),
        "output_dir": str(out_dir),
        "runner": _runner_info(),
        "umap_params": {
            "n_neighbors": int(args.n_neighbors),
            "min_dist": float(args.min_dist),
            "metric": str(args.metric),
            "random_state": int(args.random_state),
            "densmap": True,
        },
        "genre_weight_ratio": GENRE_WEIGHT_RATIO,
        "feature_weights": {"text": float(args.w_text), "genre": float(args.w_genre), "lang": float(args.w_lang)},
        "embedding_model_meta": EMBEDDING_META,
        "rss_heartbeat_seconds": float(args.heartbeat_seconds),
        "rss_samples": [],
    }

    # --- fusion ---
    t0 = time.perf_counter()
    combined, st, sg, sl = fuse_modalities(
        text,
        genre,
        lang,
        w_text=float(args.w_text),
        w_genre=float(args.w_genre),
        w_lang=float(args.w_lang),
    )
    t_fusion = time.perf_counter() - t0
    pr(
        f"[P18.1b] Fusion scales: text * {st:.6f} | genre * {sg:.6f} | lang * {sl:.6f} | "
        f"combined {combined.shape} in {t_fusion:.2f}s"
    )
    assert combined.shape == (n_csv, int(text.shape[1] + genre.shape[1] + lang.shape[1]))
    report["timings_s"] = {"fusion": round(t_fusion, 3)}
    report["fusion_shape"] = list(combined.shape)

    # --- UMAP ---
    nn = _umap_n_neighbors(n_csv, int(args.n_neighbors))
    pr(
        f"[P18.1b] UMAP fit_transform start | n_neighbors={nn} min_dist={args.min_dist} "
        f"metric={args.metric!r} random_state={args.random_state} densmap=True"
    )
    sampler = RssSampler()
    sampler.start(label="umap", interval_s=float(args.heartbeat_seconds), root=_REPO_ROOT)
    t_umap0 = time.perf_counter()
    try:
        xy_new, _reducer = _fit_umap_learn(
            combined,
            n_neighbors=nn,
            min_dist=float(args.min_dist),
            metric=str(args.metric),
            random_state=int(args.random_state),
            densmap=True,
            umap_verbose=False,
        )
    finally:
        sampler.stop()
    t_umap = time.perf_counter() - t_umap0
    report["timings_s"]["umap_fit_transform"] = round(t_umap, 3)
    report["rss_peak_mb_sampled"] = round(sampler.peak_mb, 1)
    report["rss_samples"] = sampler.samples
    pr(f"[P18.1b] UMAP done in {t_umap:.1f}s | peak_rss~{sampler.peak_mb:.0f} MB (sampled)")
    pr(
        f"[P18.1b] raw UMAP xy range x=[{xy_new[:, 0].min():.4f},{xy_new[:, 0].max():.4f}] "
        f"y=[{xy_new[:, 1].min():.4f},{xy_new[:, 1].max():.4f}]"
    )
    assert np.isfinite(xy_new).all()

    ref64 = ref_xy.astype(np.float64)
    new64 = xy_new.astype(np.float64)
    phys_pre = np.linalg.norm(ref64 - new64, axis=1)
    report["physical_vs_ref_pre_align"] = {
        "l2_p50": float(np.percentile(phys_pre, 50)),
        "l2_p95": float(np.percentile(phys_pre, 95)),
        "l2_p99": float(np.percentile(phys_pre, 99)),
        "l2_max": float(np.max(phys_pre)),
    }
    pr(
        "[P18.1b] physical L2(ref, raw_umap) p50/p95/p99/max="
        f"{report['physical_vs_ref_pre_align']['l2_p50']:.4f}/"
        f"{report['physical_vs_ref_pre_align']['l2_p95']:.4f}/"
        f"{report['physical_vs_ref_pre_align']['l2_p99']:.4f}/"
        f"{report['physical_vs_ref_pre_align']['l2_max']:.4f}"
    )

    norms_before, disp_before = _procrustes_residual_norms(ref_xy, xy_new.astype(np.float32))
    report["shape_procrustes_pre_align"] = {
        "procrustes_disparity": disp_before,
        "residual_norm_p50": float(np.percentile(norms_before, 50)),
        "residual_norm_p95": float(np.percentile(norms_before, 95)),
        "residual_norm_p99": float(np.percentile(norms_before, 99)),
        "residual_norm_max": float(np.max(norms_before)),
    }
    pr(
        "[P18.1b] shape Procrustes(ref, raw_umap) disparity="
        f"{disp_before:.6g} | normalized residual p50/p95/p99/max="
        f"{report['shape_procrustes_pre_align']['residual_norm_p50']:.6f}/"
        f"{report['shape_procrustes_pre_align']['residual_norm_p95']:.6f}/"
        f"{report['shape_procrustes_pre_align']['residual_norm_p99']:.6f}/"
        f"{report['shape_procrustes_pre_align']['residual_norm_max']:.6f}"
    )

    # --- Procrustes align to reference physical frame ---
    t_p0 = time.perf_counter()
    xy_aligned, disp_align_step = _align_new_to_ref_physical(ref_xy, xy_new)
    t_p = time.perf_counter() - t_p0
    report["timings_s"]["procrustes_align"] = round(t_p, 4)
    report["procrustes_full_disparity"] = disp_align_step
    pr(f"[P18.1b] Procrustes align done in {t_p:.3f}s | scipy full disparity={disp_align_step:.6g}")

    al64 = xy_aligned.astype(np.float64)
    phys_post = np.linalg.norm(ref64 - al64, axis=1)
    report["physical_vs_ref_post_align"] = {
        "l2_p50": float(np.percentile(phys_post, 50)),
        "l2_p95": float(np.percentile(phys_post, 95)),
        "l2_p99": float(np.percentile(phys_post, 99)),
        "l2_max": float(np.max(phys_post)),
    }
    pr(
        "[P18.1b] physical L2(ref, aligned) p50/p95/p99/max="
        f"{report['physical_vs_ref_post_align']['l2_p50']:.4f}/"
        f"{report['physical_vs_ref_post_align']['l2_p95']:.4f}/"
        f"{report['physical_vs_ref_post_align']['l2_p99']:.4f}/"
        f"{report['physical_vs_ref_post_align']['l2_max']:.4f}"
    )

    norms_after, disp_after = _procrustes_residual_norms(ref_xy, xy_aligned)
    report["shape_procrustes_post_align"] = {
        "procrustes_disparity": disp_after,
        "residual_norm_p50": float(np.percentile(norms_after, 50)),
        "residual_norm_p95": float(np.percentile(norms_after, 95)),
        "residual_norm_p99": float(np.percentile(norms_after, 99)),
        "residual_norm_max": float(np.max(norms_after)),
    }
    pr(
        "[P18.1b] shape Procrustes(ref, aligned) disparity="
        f"{disp_after:.6g} | normalized residual p50/p95/p99/max="
        f"{report['shape_procrustes_post_align']['residual_norm_p50']:.6f}/"
        f"{report['shape_procrustes_post_align']['residual_norm_p95']:.6f}/"
        f"{report['shape_procrustes_post_align']['residual_norm_p99']:.6f}/"
        f"{report['shape_procrustes_post_align']['residual_norm_max']:.6f}"
    )

    out_xy_path.parent.mkdir(parents=True, exist_ok=True)
    np.save(out_xy_path, xy_aligned)
    pr(f"[P18.1b] wrote {out_xy_path} shape={xy_aligned.shape}")

    export_rc: int | None = None
    validate_rc: int | None = None
    if args.with_export:
        json_out = out_dir / "galaxy_data_core_benchmark.json"
        gz_out = out_dir / "galaxy_data_core_benchmark.json.gz"
        py = sys.executable
        exp_cmd = [
            py,
            str(_REPO_ROOT / "scripts" / "export" / "export_galaxy_json.py"),
            "--input",
            str(cleaned),
            "--xy-input",
            str(out_xy_path),
            "--output-json",
            str(json_out),
            "--output-gzip",
            str(gz_out),
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
            EMBEDDING_META,
            "--genre-weight-ratio",
            str(GENRE_WEIGHT_RATIO),
            "--w-text",
            "1.0",
            "--w-genre",
            "1.0",
            "--w-lang",
            "1.0",
        ]
        pr("[P18.1b] >>> " + " ".join(exp_cmd))
        t_e0 = time.perf_counter()
        export_rc = int(
            subprocess.run(exp_cmd, cwd=str(_REPO_ROOT), env={**os.environ, "PYTHONUNBUFFERED": "1"}).returncode
        )
        report["timings_s"]["export_galaxy_json"] = round(time.perf_counter() - t_e0, 3)
        pr(f"[P18.1b] export_galaxy_json exit={export_rc} in {report['timings_s']['export_galaxy_json']}s")

        if export_rc == 0:
            val_cmd = [
                py,
                str(_REPO_ROOT / "scripts" / "validate_galaxy_json.py"),
                "--input",
                str(json_out),
            ]
            pr("[P18.1b] >>> " + " ".join(val_cmd))
            t_v0 = time.perf_counter()
            validate_rc = int(
                subprocess.run(val_cmd, cwd=str(_REPO_ROOT), env={**os.environ, "PYTHONUNBUFFERED": "1"}).returncode
            )
            report["timings_s"]["validate_galaxy_json"] = round(time.perf_counter() - t_v0, 3)
            pr(f"[P18.1b] validate_galaxy_json exit={validate_rc} in {report['timings_s']['validate_galaxy_json']}s")

    total = time.perf_counter() - t_wall0
    report["timings_s"]["total_wall"] = round(total, 3)
    report["exit_codes"] = {"main": 0, "export": export_rc, "validate": validate_rc}

    pr(f"[P18.1b] DONE total_wall={total:.1f}s ({total/60:.2f} min)")
    pr(f"[P18.1b] wrote report {report_path}")

    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    log.close()

    if export_rc not in (None, 0) or validate_rc not in (None, 0):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
