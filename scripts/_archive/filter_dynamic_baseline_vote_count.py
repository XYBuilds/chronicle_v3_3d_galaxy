#!/usr/bin/env python3
"""
动态基线滤波（滑动平均法）：按年度 q95 代表水位 → 连续年份补齐与插值 → 滑动平均基线 → 动态阈值切除低票尾部样本。
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "output" / "merged_movies_filtered_combined.csv"
DEFAULT_OUTPUT = (
    ROOT / "output" / "merged_movies_filtered_combined_dynamic_baseline_q95_a015.csv"
)

# 全局控制变量（与需求一致）
QUANTILE = 0.95
ALPHA = 0.15
ABS_MIN = 1
ROLLING_WINDOW = 6


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Remove statistical-noise tail: keep rows where vote_count >= "
            "dynamic threshold from smoothed yearly q95 baseline."
        )
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="输入 CSV 路径")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="输出 CSV 路径")
    parser.add_argument(
        "--vote-col",
        type=str,
        default="vote_count",
        help="投票人数列名",
    )
    parser.add_argument(
        "--date-col",
        type=str,
        default="release_date",
        help="无 year 列时用于解析年份的日期列（取前 4 位为年）",
    )
    parser.add_argument(
        "--quantile",
        type=float,
        default=QUANTILE,
        help="年度代表分位数（默认 0.95）",
    )
    parser.add_argument("--alpha", type=float, default=ALPHA, help="折算系数 alpha")
    parser.add_argument("--abs-min", type=float, default=ABS_MIN, help="全年代绝对底线 abs_min")
    parser.add_argument(
        "--rolling-window",
        type=int,
        default=ROLLING_WINDOW,
        help="滑动平均窗口年数",
    )
    return parser.parse_args()


def _extract_year(series: pd.Series) -> pd.Series:
    year_text = series.astype(str).str.strip().str.slice(0, 4)
    return pd.to_numeric(year_text, errors="coerce").astype("Int64")


def compute_smoothed_baseline_for_work(
    work: pd.DataFrame,
    *,
    quantile: float = QUANTILE,
    rolling_window: int = ROLLING_WINDOW,
) -> tuple[pd.RangeIndex, pd.Series]:
    """
    由已含 _year、_vote_num 的工作表计算连续年份上的 smoothed_baseline。
    返回 (full_years, smoothed_baseline)，后者索引为自然年。
    """
    yearly_q = (
        work.dropna(subset=["_year"])
        .groupby("_year", sort=True)["_vote_num"]
        .quantile(quantile)
    )
    yearly_q.name = "yearly_quantile"
    yearly_q.index = yearly_q.index.astype(int)

    year_min = int(work["_year"].min())
    year_max = int(work["_year"].max())
    full_years = pd.RangeIndex(start=year_min, stop=year_max + 1, step=1)

    continuous_q = yearly_q.reindex(full_years)
    continuous_q = continuous_q.interpolate(method="linear")
    continuous_q = continuous_q.bfill()
    continuous_q = continuous_q.ffill()
    continuous_q.name = "continuous_quantile"

    smoothed_baseline = continuous_q.rolling(
        window=rolling_window, min_periods=1
    ).mean()
    smoothed_baseline.name = "smoothed_baseline"
    return full_years, smoothed_baseline


def main() -> None:
    args = parse_args()
    if not args.input.exists():
        raise FileNotFoundError(f"输入文件不存在: {args.input}")
    if args.alpha < 0:
        raise ValueError("--alpha 必须 >= 0")
    if args.abs_min < 0:
        raise ValueError("--abs-min 必须 >= 0")
    if args.rolling_window < 1:
        raise ValueError("--rolling-window 必须 >= 1")
    if not 0 < args.quantile < 1:
        raise ValueError("--quantile 必须在 (0, 1) 内")

    df = pd.read_csv(args.input, dtype=str, keep_default_na=False)
    if args.vote_col not in df.columns:
        raise KeyError(f"缺少列: {args.vote_col}")

    work = df.copy()
    # 若存在 year 列则直接用于分组；否则从 release_date 等日期列解析（与当前 merged 表结构一致）
    if "year" in df.columns:
        work["_year"] = pd.to_numeric(work["year"], errors="coerce").astype("Int64")
    else:
        if args.date_col not in df.columns:
            raise KeyError(f"缺少年份来源：请提供 year 列或 {args.date_col} 列")
        work["_year"] = _extract_year(work[args.date_col])
    work["_vote_num"] = pd.to_numeric(
        work[args.vote_col].astype(str).str.strip(), errors="coerce"
    )

    if work["_year"].notna().sum() == 0:
        raise ValueError("没有任何有效年份，无法计算年度基线。")

    full_years, smoothed_baseline = compute_smoothed_baseline_for_work(
        work, quantile=args.quantile, rolling_window=args.rolling_window
    )

    # -------------------------------------------------------------------------
    # 4. 动态阈值：threshold = max(abs_min, alpha * smoothed_baseline)
    #    再按年份映射到每一行 dynamic_threshold
    # -------------------------------------------------------------------------
    threshold_by_year = np.maximum(args.abs_min, args.alpha * smoothed_baseline.values)
    threshold_series = pd.Series(threshold_by_year, index=full_years, name="threshold")

    year_to_threshold = threshold_series.to_dict()
    valid_year_mask = work["_year"].notna()
    work.loc[valid_year_mask, "dynamic_threshold"] = work.loc[valid_year_mask, "_year"].map(
        year_to_threshold
    )

    # 切除「当年尾部」：剔除 vote_count 低于该年动态阈值的行（保留 >= 阈值）
    vote_ok = work["_vote_num"] >= work["dynamic_threshold"]
    keep_mask = valid_year_mask & vote_ok
    # 年份无法解析的行：无法映射阈值，予以剔除（避免静默保留噪声）
    dropped_bad_year = valid_year_mask & ~vote_ok
    filtered = work.loc[keep_mask, df.columns].copy()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    filtered.to_csv(args.output, index=False, encoding="utf-8")

    n_bad_year = int((~valid_year_mask).sum())
    n_removed_tail = int(dropped_bad_year.sum())
    print(f"输入行数: {len(df):,}")
    print(f"年份列无法解析而剔除: {n_bad_year:,}")
    print(f"低于 dynamic_threshold 剔除（当年尾部）: {n_removed_tail:,}")
    print(f"输出行数: {len(filtered):,}")
    print(f"输出文件: {args.output}")


if __name__ == "__main__":
    main()
