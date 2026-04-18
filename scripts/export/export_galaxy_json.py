#!/usr/bin/env python3
"""Phase 2.5: Z-axis (decimal year + Jan-1 jitter), derived GPU fields, OKLCH palette, galaxy_data.json (+ gzip)."""
from __future__ import annotations

import argparse
import calendar
import gzip
import json
import math
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from feature_engineering.genre_encoding import (  # noqa: E402
    DEFAULT_GENRE_WEIGHT_RATIO,
    collect_sorted_genres,
    parse_genre_list,
)

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_CSV = _REPO_ROOT / "data" / "output" / "cleaned.csv"
_DEFAULT_XY = _REPO_ROOT / "data" / "output" / "umap_xy.npy"
_DEFAULT_JSON = _REPO_ROOT / "frontend" / "public" / "data" / "galaxy_data.json"
_DEFAULT_GZ = _REPO_ROOT / "frontend" / "public" / "data" / "galaxy_data.json.gz"

POSTER_BASE = "https://image.tmdb.org/t/p/w500"
EMBEDDING_MODEL_ID = "paraphrase-multilingual-MiniLM-L12-v2"

# OKLCH → sRGB (Björn Ottosson OKLab), then CSS sRGB transfer; gamut clamp on linear + encoded.
_OKLCH_L = 0.75
_OKLCH_C = 0.14


def _split_list_cell(val: object) -> list[str]:
    """Split TMDB multi-value string fields on comma (dataset uses comma-separated names)."""
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return []
    s = str(val).strip()
    if not s or s.casefold() in ("nan", "none"):
        return []
    return [p.strip() for p in s.split(",") if p.strip()]


def _to_int_or_null(val: object) -> int | None:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    s = str(val).strip()
    if not s or s.casefold() in ("nan", "none"):
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def _to_int_zero(val: object) -> int:
    n = _to_int_or_null(val)
    return 0 if n is None else n


def _to_float(val: object) -> float:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return 0.0
    s = str(val).strip()
    if not s or s.casefold() in ("nan", "none"):
        return 0.0
    x = pd.to_numeric(s, errors="coerce")
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return 0.0
    return float(x)


def _to_float_or_null(val: object) -> float | None:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    s = str(val).strip()
    if not s or s.casefold() in ("nan", "none"):
        return None
    x = pd.to_numeric(s, errors="coerce")
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return None
    return float(x)


def decimal_year_with_jitter(release_date: str, movie_id: int) -> tuple[float, bool]:
    """Tech Spec §2.2: decimal year; YYYY-01-01 gets deterministic jitter in [0, 0.9999)."""
    s = str(release_date).strip()
    parts = s.split("-")
    if len(parts) != 3:
        raise ValueError(f"Unparseable release_date: {release_date!r}")
    y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
    if m == 1 and d == 1:
        rng = np.random.default_rng(int(movie_id))
        jitter = float(rng.uniform(0.0, 0.9999))
        return float(y) + jitter, True
    days_in_year = 366 if calendar.isleap(y) else 365
    doy = date(y, m, d).timetuple().tm_yday
    frac = (doy - 1) / float(days_in_year)
    return float(y) + frac, False


def oklch_to_srgb_hex(L: float, C: float, h_deg: float) -> tuple[str, tuple[float, float, float]]:
    """OKLCH (L,C,H deg) → gamut-clamped sRGB hex + normalized RGB tuple."""
    h = math.radians(h_deg % 360.0)
    a_ = C * math.cos(h)
    b_ = C * math.sin(h)
    l_ = L + 0.3963377774 * a_ + 0.2158037573 * b_
    m_ = L - 0.1055613458 * a_ - 0.0638541728 * b_
    s_ = L - 0.0894841775 * a_ - 1.2914855480 * b_
    l = l_**3
    m = m_**3
    s = s_**3
    r_lin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g_lin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b_lin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    def _srgb_channel(x: float) -> float:
        x = float(np.clip(x, 0.0, 1.0))
        if x <= 0.0031308:
            return 12.92 * x
        return 1.055 * (x ** (1.0 / 2.4)) - 0.055

    r8 = _srgb_channel(r_lin)
    g8 = _srgb_channel(g_lin)
    b8 = _srgb_channel(b_lin)
    r8, g8, b8 = (float(np.clip(r8, 0.0, 1.0)), float(np.clip(g8, 0.0, 1.0)), float(np.clip(b8, 0.0, 1.0)))
    hx = f"#{int(round(r8 * 255)):02X}{int(round(g8 * 255)):02X}{int(round(b8 * 255)):02X}"
    return hx, (r8, g8, b8)


def build_genre_palette(genre_order: list[str]) -> tuple[dict[str, str], dict[str, tuple[float, float, float]]]:
    """Equal hue spacing on OKLCH ring (Design Spec §1.1 + dev plan Phase 2.5)."""
    n = len(genre_order)
    if n == 0:
        return {}, {}
    step = 360.0 / float(n)
    palette: dict[str, str] = {}
    rgb_norm: dict[str, tuple[float, float, float]] = {}
    for i, g in enumerate(genre_order):
        h = step * float(i)
        hx, rgb = oklch_to_srgb_hex(_OKLCH_L, _OKLCH_C, h)
        palette[g] = hx
        rgb_norm[g] = rgb
    return palette, rgb_norm


def linear_map_array(values: np.ndarray, out_min: float, out_max: float) -> np.ndarray:
    v = np.asarray(values, dtype=np.float64)
    lo, hi = float(v.min()), float(v.max())
    if not np.isfinite(lo) or not np.isfinite(hi):
        raise ValueError("linear_map_array: non-finite inputs")
    if hi <= lo:
        mid = (out_min + out_max) / 2.0
        return np.full_like(v, mid)
    t = (v - lo) / (hi - lo)
    return out_min + t * (out_max - out_min)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Export galaxy_data.json (+ gzip) from cleaned.csv + UMAP xy (Phase 2.5).")
    p.add_argument("--input", type=Path, default=_DEFAULT_CSV, help="cleaned.csv (same row order as feature .npy files)")
    p.add_argument("--xy-input", type=Path, default=_DEFAULT_XY, help="umap_xy.npy float32 (n, 2)")
    p.add_argument("--output-json", type=Path, default=_DEFAULT_JSON, help="Output galaxy_data.json")
    p.add_argument("--output-gzip", type=Path, default=_DEFAULT_GZ, help="Output galaxy_data.json.gz")
    p.add_argument("--skip-gzip", action="store_true", help="Do not write .json.gz")
    p.add_argument("--embedding-model", type=str, default=EMBEDDING_MODEL_ID, help="meta.embedding_model")
    p.add_argument("--genre-weight-ratio", type=float, default=DEFAULT_GENRE_WEIGHT_RATIO, help="meta.genre_weight_ratio")
    p.add_argument("--w-text", type=float, default=1.0)
    p.add_argument("--w-genre", type=float, default=1.0)
    p.add_argument("--w-lang", type=float, default=1.0)
    p.add_argument("--n-neighbors", type=int, default=15, help="UMAP hyperparameter echoed in meta (match Phase 2.4 run)")
    p.add_argument(
        "--min-dist",
        type=float,
        default=0.4,
        help="Echoed in meta.umap_params; must match umap_projection.py run (Phase 5.2.1)",
    )
    p.add_argument("--metric", type=str, default="cosine")
    p.add_argument("--random-state", type=int, default=42)
    p.add_argument("--size-min", type=float, default=2.0)
    p.add_argument("--size-max", type=float, default=25.0)
    p.add_argument("--emissive-min", type=float, default=0.1)
    p.add_argument("--emissive-max", type=float, default=1.5)
    return p.parse_args(argv)


def _movie_row(
    row: pd.Series,
    *,
    x: float,
    y: float,
    z: float,
    size: float,
    emissive: float,
    genre_color: list[float],
) -> dict[str, Any]:
    genres = parse_genre_list(row.get("genres"))
    tagline_raw = row["tagline"] if "tagline" in row.index else ""
    tagline_s = str(tagline_raw).strip() if tagline_raw is not None else ""
    tagline_out: str | None = None if (not tagline_s or tagline_s.casefold() == "nan") else tagline_s

    imdb_raw = row["imdb_id"] if "imdb_id" in row.index else ""
    imdb_s = str(imdb_raw).strip() if imdb_raw is not None else ""
    imdb_out: str | None = None if (not imdb_s or imdb_s.casefold() in ("nan", "none")) else imdb_s

    poster_path = row["poster_path"] if "poster_path" in row.index else ""
    ps = str(poster_path).strip() if poster_path is not None else ""
    if not ps or ps.casefold() == "nan":
        poster_url = ""
    elif ps.startswith("http"):
        poster_url = ps
    else:
        poster_url = POSTER_BASE + (ps if ps.startswith("/") else "/" + ps)

    cast_full = _split_list_cell(row.get("cast"))
    cast_out = cast_full[:20]

    return {
        "x": x,
        "y": y,
        "z": z,
        "size": size,
        "emissive": emissive,
        "genre_color": genre_color,
        "title": str(row.get("title", "")).strip(),
        "original_title": str(row.get("original_title", "")).strip(),
        "overview": str(row.get("overview", "")).strip(),
        "tagline": tagline_out,
        "release_date": str(row.get("release_date", "")).strip(),
        "genres": genres,
        "original_language": str(row.get("original_language", "")).strip(),
        "vote_count": int(_to_float(row.get("vote_count"))),
        "vote_average": _to_float(row.get("vote_average")),
        "popularity": _to_float(row.get("popularity")),
        "imdb_rating": _to_float_or_null(row.get("imdb_rating")),
        "imdb_votes": _to_int_or_null(row.get("imdb_votes")),
        "runtime": _to_int_or_null(row.get("runtime")),
        "revenue": _to_int_zero(row.get("revenue")),
        "budget": _to_int_zero(row.get("budget")),
        "production_countries": _split_list_cell(row.get("production_countries")),
        "production_companies": _split_list_cell(row.get("production_companies")),
        "spoken_languages": _split_list_cell(row.get("spoken_languages")),
        "cast": cast_out,
        "director": _split_list_cell(row.get("director")),
        "writers": _split_list_cell(row.get("writers")),
        "producers": _split_list_cell(row.get("producers")),
        "director_of_photography": _split_list_cell(row.get("director_of_photography")),
        "music_composer": _split_list_cell(row.get("music_composer")),
        "poster_url": poster_url,
        "id": int(_to_float(row.get("id"))),
        "imdb_id": imdb_out,
    }


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    csv_path = args.input.expanduser().resolve()
    xy_path = args.xy_input.expanduser().resolve()
    out_json = args.output_json.expanduser().resolve()
    out_gz = args.output_gzip.expanduser().resolve()

    if not csv_path.is_file():
        print(f"Error: input CSV not found: {csv_path}", file=sys.stderr)
        return 1
    if not xy_path.is_file():
        print(f"Error: xy npy not found: {xy_path}", file=sys.stderr)
        return 1

    df = pd.read_csv(csv_path)
    xy = np.load(xy_path)
    if xy.ndim != 2 or xy.shape[1] != 2:
        raise ValueError(f"umap_xy must be (n, 2), got {xy.shape}")
    n = len(df)
    if xy.shape[0] != n:
        raise ValueError(f"Row count mismatch: CSV {n} vs umap_xy {xy.shape[0]}")

    if "id" not in df.columns or "release_date" not in df.columns:
        raise KeyError("CSV must include id and release_date")

    genre_order = collect_sorted_genres(df["genres"])
    genre_palette, genre_rgb = build_genre_palette(genre_order)

    zs: list[float] = []
    jitter_count = 0
    for _, row in df.iterrows():
        rid = int(_to_float(row["id"]))
        z, j = decimal_year_with_jitter(str(row["release_date"]), rid)
        zs.append(z)
        if j:
            jitter_count += 1
    z_arr = np.asarray(zs, dtype=np.float64)
    z_min, z_max = float(z_arr.min()), float(z_arr.max())
    print(f"[Z-axis] range: [{z_min:.2f}, {z_max:.2f}] | jittered YYYY-01-01 count: {jitter_count}")

    vote_c = pd.to_numeric(df["vote_count"].astype(str).str.strip(), errors="coerce").to_numpy(dtype=np.float64)
    log_vc = np.log10(vote_c + 1.0)
    sizes = linear_map_array(log_vc, args.size_min, args.size_max)
    s_min, s_max = float(sizes.min()), float(sizes.max())
    print(f"[Size] min: {s_min:.2f}, max: {s_max:.2f} (should be ≈ 2.0–25.0)")

    va = pd.to_numeric(df["vote_average"].astype(str).str.strip(), errors="coerce").to_numpy(dtype=np.float64)
    emissive = linear_map_array(va, args.emissive_min, args.emissive_max)
    e_min, e_max = float(emissive.min()), float(emissive.max())
    print(f"[Emissive] min: {e_min:.2f}, max: {e_max:.2f} (should be ≈ 0.1–1.5)")

    snippet = json.dumps({k: genre_palette[k] for k in list(genre_palette)[: min(5, len(genre_palette))]}, ensure_ascii=False)
    print(f"[Palette] {len(genre_order)} genres → {snippet}{'...' if len(genre_order) > 5 else ''}")

    xy64 = xy.astype(np.float64, copy=False)
    movies: list[dict[str, Any]] = []
    for i in range(n):
        row = df.iloc[i]
        genres = parse_genre_list(row.get("genres"))
        primary = genres[0] if genres else ""
        if primary not in genre_rgb:
            raise KeyError(f"Primary genre {primary!r} not in palette (row {i})")
        r, g, b = genre_rgb[primary]
        m = _movie_row(
            row,
            x=float(xy64[i, 0]),
            y=float(xy64[i, 1]),
            z=float(z_arr[i]),
            size=float(sizes[i]),
            emissive=float(emissive[i]),
            genre_color=[r, g, b],
        )
        movies.append(m)

    if movies:
        c0 = movies[0]["genre_color"]
        print(f"[genre_color] sample: movies[0].genre_color = [{c0[0]:.3f}, {c0[1]:.3f}, {c0[2]:.3f}] (all in 0–1?)")

    now = datetime.now(timezone.utc)
    version = now.strftime("%Y.%m.%d")
    generated_at = now.isoformat()

    meta: dict[str, Any] = {
        "version": version,
        "generated_at": generated_at,
        "count": len(movies),
        "embedding_model": str(args.embedding_model),
        "umap_params": {
            "n_neighbors": int(args.n_neighbors),
            "min_dist": float(args.min_dist),
            "metric": str(args.metric),
            "random_state": int(args.random_state),
        },
        "genre_weight_ratio": float(args.genre_weight_ratio),
        "genre_palette": genre_palette,
        "feature_weights": {"text": float(args.w_text), "genre": float(args.w_genre), "lang": float(args.w_lang)},
        "z_range": [z_min, z_max],
        "xy_range": {
            "x": [float(xy64[:, 0].min()), float(xy64[:, 0].max())],
            "y": [float(xy64[:, 1].min()), float(xy64[:, 1].max())],
        },
    }

    payload_obj = {"meta": meta, "movies": movies}
    assert meta["count"] == len(movies)

    for m in movies:
        for k in ("x", "y", "z", "size", "emissive"):
            v = m[k]
            if not math.isfinite(v):
                raise AssertionError(f"Non-finite {k} in movie id={m.get('id')}")
        for c in m["genre_color"]:
            if not (0.0 <= float(c) <= 1.0):
                raise AssertionError(f"genre_color out of [0,1] for id={m.get('id')}: {m['genre_color']}")

    raw = json.dumps(payload_obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_bytes(raw)
    raw_mb = len(raw) / (1024 * 1024)
    print(f"[Export] Wrote {out_json} ({raw_mb:.2f} MB)")

    if not args.skip_gzip:
        with gzip.open(out_gz, "wb", compresslevel=9) as gz:
            gz.write(raw)
        gz_mb = out_gz.stat().st_size / (1024 * 1024)
        print(f"[Export] Wrote {out_gz} ({gz_mb:.2f} MB gzip)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
