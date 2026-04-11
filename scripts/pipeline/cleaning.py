"""Phase 1.2–1.3: deduplication and must-drop filters."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import numpy as np
import pandas as pd

NULL_TOKENS = frozenset({"", "null", "none", "nan", "<na>"})

# Defaults aligned with scripts/_archive/filter_dynamic_baseline_vote_count.py
QUANTILE = 0.95
ALPHA = 0.15
ABS_MIN = 1.0
ROLLING_WINDOW = 6


def _is_null_like(series: pd.Series) -> pd.Series:
    return series.astype(str).str.strip().str.casefold().isin(NULL_TOKENS)


def _pct(dropped: int, base: int) -> float:
    if base <= 0:
        return 0.0
    return 100.0 * dropped / base


@dataclass(frozen=True)
class FilterStepResult:
    name: str
    dropped: int
    remaining: int


def load_raw_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Input file does not exist: {path}")
    return pd.read_csv(path, dtype=str, keep_default_na=False)


def deduplicate_ids_and_imdb(df: pd.DataFrame) -> tuple[pd.DataFrame, int, int, int]:
    """Primary key dedup by ``id``, then merge rows sharing the same ``imdb_id``."""
    n0 = len(df)
    if "id" not in df.columns:
        raise KeyError("Missing required column: id")

    work = df.copy()
    work["_vote_num"] = pd.to_numeric(work["vote_count"].astype(str).str.strip(), errors="coerce")
    work = work.sort_values("_vote_num", ascending=False, kind="mergesort")
    after_id = work.drop_duplicates(subset=["id"], keep="first")
    n1 = len(after_id)

    if "imdb_id" not in after_id.columns:
        raise KeyError("Missing required column: imdb_id")

    imdb = after_id["imdb_id"].astype(str).str.strip()
    imdb_ok = ~_is_null_like(imdb)
    uid = after_id["id"].astype(str).str.strip()
    dedupe_key = np.where(imdb_ok, imdb.values, "__no_imdb__:" + uid.values)
    after_imdb = (
        after_id.assign(_dedupe_key=dedupe_key)
        .sort_values("_vote_num", ascending=False, kind="mergesort")
        .drop_duplicates(subset=["_dedupe_key"], keep="first")
        .drop(columns=["_dedupe_key", "_vote_num"])
    )
    n2 = len(after_imdb)
    return after_imdb, n0, n1, n2


def apply_overview_title_fallback(df: pd.DataFrame) -> pd.DataFrame:
    """Fill empty ``overview`` from ``title`` / ``original_title`` (数据处理规则 §2)."""
    out = df.copy()
    if "overview" not in out.columns:
        raise KeyError("Missing required column: overview")

    ov = out["overview"].astype(str).str.strip()
    ov_empty = _is_null_like(ov)

    title = out["title"].astype(str).str.strip() if "title" in out.columns else pd.Series("", index=out.index)
    otitle = (
        out["original_title"].astype(str).str.strip()
        if "original_title" in out.columns
        else pd.Series("", index=out.index)
    )
    # 若 original_title 与 title 不同且非空，则拼接；否则仅用 title
    diff = (~otitle.eq("")) & (title.str.casefold() != otitle.str.casefold())
    fallback = title.where(~diff, title + " " + otitle)

    out.loc[ov_empty, "overview"] = fallback[ov_empty]
    return out


def filter_drop_mask(df: pd.DataFrame, mask_drop: pd.Series, label: str) -> tuple[pd.DataFrame, FilterStepResult]:
    base = len(df)
    kept = df.loc[~mask_drop].copy()
    dropped = base - len(kept)
    return kept, FilterStepResult(name=label, dropped=dropped, remaining=len(kept))


def filter_genres_nonempty(df: pd.DataFrame) -> tuple[pd.DataFrame, FilterStepResult]:
    if "genres" not in df.columns:
        raise KeyError("Missing required column: genres")
    bad = _is_null_like(df["genres"].astype(str).str.strip())
    return filter_drop_mask(df, bad, "genres_nonempty")


def filter_vote_count_positive(df: pd.DataFrame) -> tuple[pd.DataFrame, FilterStepResult]:
    if "vote_count" not in df.columns:
        raise KeyError("Missing required column: vote_count")
    text = df["vote_count"].astype(str).str.strip()
    null_like = _is_null_like(text)
    numeric = pd.to_numeric(text, errors="coerce")
    zero_like = numeric.fillna(0).eq(0) & ~null_like
    bad = null_like | zero_like
    return filter_drop_mask(df, bad, "vote_count_gt_0")


def filter_vote_average_positive(df: pd.DataFrame) -> tuple[pd.DataFrame, FilterStepResult]:
    if "vote_average" not in df.columns:
        raise KeyError("Missing required column: vote_average")
    text = df["vote_average"].astype(str).str.strip()
    null_like = _is_null_like(text)
    numeric = pd.to_numeric(text, errors="coerce")
    zero_like = numeric.fillna(0).eq(0) & ~null_like
    bad = null_like | zero_like
    return filter_drop_mask(df, bad, "vote_average_gt_0")


def filter_release_date_present(df: pd.DataFrame) -> tuple[pd.DataFrame, FilterStepResult]:
    if "release_date" not in df.columns:
        raise KeyError("Missing required column: release_date")
    bad = _is_null_like(df["release_date"].astype(str).str.strip())
    return filter_drop_mask(df, bad, "release_date_present")


def filter_overview_nonempty(df: pd.DataFrame) -> tuple[pd.DataFrame, FilterStepResult]:
    if "overview" not in df.columns:
        raise KeyError("Missing required column: overview")
    bad = _is_null_like(df["overview"].astype(str).str.strip())
    return filter_drop_mask(df, bad, "overview_nonempty")


def _extract_year(series: pd.Series) -> pd.Series:
    year_text = series.astype(str).str.strip().str.slice(0, 4)
    return pd.to_numeric(year_text, errors="coerce").astype("Int64")


def apply_dynamic_vote_threshold(
    df: pd.DataFrame,
    *,
    quantile: float = QUANTILE,
    alpha: float = ALPHA,
    abs_min: float = ABS_MIN,
    rolling_window: int = ROLLING_WINDOW,
) -> tuple[pd.DataFrame, FilterStepResult]:
    """Rows with ``vote_count`` below per-year dynamic threshold are removed."""
    if quantile <= 0 or quantile >= 1:
        raise ValueError("quantile must be in (0, 1)")
    if alpha < 0:
        raise ValueError("alpha must be >= 0")
    if abs_min < 0:
        raise ValueError("abs_min must be >= 0")
    if rolling_window < 1:
        raise ValueError("rolling_window must be >= 1")

    work = df.copy()
    work["_year"] = _extract_year(work["release_date"])
    work["_vote_num"] = pd.to_numeric(work["vote_count"].astype(str).str.strip(), errors="coerce")

    yearly_q = (
        work.dropna(subset=["_year"])
        .groupby("_year", sort=True)["_vote_num"]
        .quantile(quantile)
    )
    yearly_q.index = yearly_q.index.astype(int)
    year_min = int(work["_year"].min())
    year_max = int(work["_year"].max())
    full_years = pd.RangeIndex(start=year_min, stop=year_max + 1, step=1)
    continuous_q = yearly_q.reindex(full_years).interpolate(method="linear").bfill().ffill()
    smoothed_baseline = continuous_q.rolling(window=rolling_window, min_periods=1).mean()
    threshold_by_year = np.maximum(abs_min, alpha * smoothed_baseline.values)
    threshold_series = pd.Series(threshold_by_year, index=full_years, name="threshold")
    year_to_threshold = threshold_series.to_dict()

    valid_year_mask = work["_year"].notna()
    work["dynamic_threshold"] = np.nan
    work.loc[valid_year_mask, "dynamic_threshold"] = work.loc[valid_year_mask, "_year"].map(year_to_threshold)
    vote_ok = work["_vote_num"] >= work["dynamic_threshold"]
    keep_mask = valid_year_mask & vote_ok

    dropped = int((~keep_mask).sum())
    filtered = work.loc[keep_mask, df.columns].copy()
    return filtered, FilterStepResult(name="dynamic_vote_baseline", dropped=dropped, remaining=len(filtered))


def run_cleaning_pipeline(
    df: pd.DataFrame,
    *,
    quantile: float = QUANTILE,
    alpha: float = ALPHA,
    abs_min: float = ABS_MIN,
    rolling_window: int = ROLLING_WINDOW,
) -> tuple[pd.DataFrame, list[FilterStepResult]]:
    """Dedup → must-drop filters → dynamic vote threshold."""
    steps: list[FilterStepResult] = []

    df, n0, n1, n2 = deduplicate_ids_and_imdb(df)
    print(f"[Dedup] Before: {n0} rows -> After id dedup: {n1} -> After imdb_id dedup: {n2}")
    if n2 <= 0:
        raise AssertionError("imdb_id dedup removed all rows (n2 > 0 required)")

    df, r = filter_genres_nonempty(df)
    steps.append(r)
    print(f"[Filter:{r.name}] Dropped: {r.dropped} rows ({_pct(r.dropped, n2):.2f}%) -> Remaining: {r.remaining}")

    base = r.remaining
    df, r = filter_vote_count_positive(df)
    steps.append(r)
    print(f"[Filter:{r.name}] Dropped: {r.dropped} rows ({_pct(r.dropped, base):.2f}%) -> Remaining: {r.remaining}")
    base = r.remaining

    df, r = filter_vote_average_positive(df)
    steps.append(r)
    print(f"[Filter:{r.name}] Dropped: {r.dropped} rows ({_pct(r.dropped, base):.2f}%) -> Remaining: {r.remaining}")
    base = r.remaining

    df, r = filter_release_date_present(df)
    steps.append(r)
    print(f"[Filter:{r.name}] Dropped: {r.dropped} rows ({_pct(r.dropped, base):.2f}%) -> Remaining: {r.remaining}")
    base = r.remaining

    df = apply_overview_title_fallback(df)
    df, r = filter_overview_nonempty(df)
    steps.append(r)
    print(f"[Filter:{r.name}] Dropped: {r.dropped} rows ({_pct(r.dropped, base):.2f}%) -> Remaining: {r.remaining}")
    base = r.remaining

    df, r = apply_dynamic_vote_threshold(
        df, quantile=quantile, alpha=alpha, abs_min=abs_min, rolling_window=rolling_window
    )
    steps.append(r)
    print(f"[Filter:{r.name}] Dropped: {r.dropped} rows ({_pct(r.dropped, base):.2f}%) -> Remaining: {r.remaining}")

    return df, steps


def assert_cleaned_quality(df: pd.DataFrame) -> None:
    """Post-conditions from dev plan Phase 1.3 checkpoint."""
    for col in ("genres", "vote_count", "vote_average", "release_date", "overview"):
        if col not in df.columns:
            raise KeyError(col)
        s = df[col].astype(str).str.strip()
        if _is_null_like(s).any():
            raise AssertionError(f"Column {col} still has null-like values after cleaning")
    vc = pd.to_numeric(df["vote_count"].astype(str).str.strip(), errors="coerce")
    va = pd.to_numeric(df["vote_average"].astype(str).str.strip(), errors="coerce")
    if vc.isna().any() or (vc == 0).any():
        raise AssertionError("vote_count has NaN or zero after cleaning")
    if va.isna().any() or (va == 0).any():
        raise AssertionError("vote_average has NaN or zero after cleaning")


def print_summary_table(steps: list[FilterStepResult], final_rows: int) -> None:
    print("\n=== Filter summary ===")
    print(f"{'Step':<28} {'Dropped':>10} {'Remaining':>12}")
    for s in steps:
        print(f"{s.name:<28} {s.dropped:>10,} {s.remaining:>12,}")
    print(f"{'TOTAL (final rows)':<28} {'-':>10} {final_rows:>12,}")


def write_cleaned_csv(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, encoding="utf-8")
