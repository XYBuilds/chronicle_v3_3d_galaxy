"""Phase 18 调研：daily delta 真实量级 + 老电影投票漂移可观测性。

只读 data/output/cleaned.csv（59K 已过滤数据），不碰 raw。
"""
from __future__ import annotations
import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parents[2]
CLEAN = REPO / "data" / "output" / "cleaned.csv"

if not CLEAN.is_file():
    print(f"Error: {CLEAN} not found", file=sys.stderr)
    raise SystemExit(1)

df = pd.read_csv(CLEAN, usecols=["id", "release_date", "vote_count", "vote_average", "popularity"])
df["release_date"] = pd.to_datetime(df["release_date"], errors="coerce")
df = df.dropna(subset=["release_date"])
df["year"] = df["release_date"].dt.year
df["ym"] = df["release_date"].dt.to_period("M")

print(f"[Total] cleaned rows = {len(df):,}")
print(f"[Year range] {df['year'].min()} – {df['year'].max()}")
print()

print("=== A. 按上映年份的电影数分布（近 10 年）===")
recent = df[df["year"] >= df["year"].max() - 9]
yc = recent.groupby("year").size().sort_index()
for y, n in yc.items():
    bar = "█" * int(n / 100)
    print(f"  {y}: {n:>5} {bar}")
print()

print("=== B. 假设：未来每日 [新片通过门槛] 的速率估计 ===")
print("    (以最近完整年 2024 为基准；剔除 YYYY-01-01 占位日，因为它是 jitter 默认)")
y2024 = df[(df["year"] == 2024)].copy()
y2024_no_jan1 = y2024[~((y2024["release_date"].dt.month == 1) & (y2024["release_date"].dt.day == 1))]
print(f"  2024 年 cleaned 总数:                  {len(y2024):>5}")
print(f"  2024 年 (排除 1/1 占位):                {len(y2024_no_jan1):>5}")
print(f"  → 平均每日新增（理论上限）:            {len(y2024_no_jan1) / 365:.2f}")
print(f"  → 平均每周:                           {len(y2024_no_jan1) * 7 / 365:.1f}")
print(f"  → 平均每月:                           {len(y2024_no_jan1) / 12:.1f}")
print()

print("=== C. 真实每日 -- 按 release_date 看 2024 年逐日新片数 ===")
daily_2024 = y2024_no_jan1.groupby(y2024_no_jan1["release_date"].dt.date).size()
print(f"  非空发布日: {len(daily_2024)} / 365")
print(f"  逐日新片数分布:")
print(f"    min={daily_2024.min()}, p25={daily_2024.quantile(0.25):.1f}, "
      f"median={daily_2024.median():.1f}, p75={daily_2024.quantile(0.75):.1f}, max={daily_2024.max()}")
print(f"  其中 1/1 占位:                         {len(y2024) - len(y2024_no_jan1)}")
print()

print("=== D. Vote / popularity 漂移可观测性 ===")
print("    (cleaned.csv 是某一时刻快照；如果重跑 cleaning 拿新版本 raw，对比同 id vote_count 变化)")
print(f"    2024 年新片 vote_count: median={y2024['vote_count'].median():.0f}, "
      f"p90={y2024['vote_count'].quantile(0.90):.0f}, max={y2024['vote_count'].max():.0f}")
print(f"    2024 年新片 vote_average: median={y2024['vote_average'].median():.2f}, "
      f"std={y2024['vote_average'].std():.3f}")
print(f"    2024 年新片 popularity: median={y2024['popularity'].median():.2f}, "
      f"p90={y2024['popularity'].quantile(0.90):.2f}, max={y2024['popularity'].max():.2f}")
print()

print("=== E. 按月份分布 (2025 年还在进行中，看它的递增曲线) ===")
y2025 = df[df["year"] == 2025].copy()
y2025_no_jan1 = y2025[~((y2025["release_date"].dt.month == 1) & (y2025["release_date"].dt.day == 1))]
mc = y2025_no_jan1.groupby(y2025_no_jan1["release_date"].dt.month).size()
print(f"  2025 年逐月新片数:")
for m, n in mc.items():
    print(f"    {m:>2} 月: {n:>4}")
print(f"  2025 年合计 (排除 1/1): {len(y2025_no_jan1)}")
print()

print("=== 结论摘要 ===")
print(f"  - cleaned 数据库总量:                       {len(df):,}")
print(f"  - 2024 年平均每日新片 (通过门槛):           ~{len(y2024_no_jan1) / 365:.1f} 部")
print(f"  - 2024 年平均每周:                          ~{len(y2024_no_jan1) * 7 / 365:.0f} 部")
print(f"  - 中位每日:                                {daily_2024.median():.0f} 部")
print(f"  - 现实 cadence 建议:                       weekly cron > daily cron (每日太稀疏)")
