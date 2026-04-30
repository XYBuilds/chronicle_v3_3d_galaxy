"""Phase 18 调研：umap_model.pkl 体积构成分析。

为决定 D2（pkl 持久化策略）提供证据：
  - pkl 是 KNN 图重还是参数重？
  - 是否能用 low_memory / 删字段 把它压到 GitHub artifact 友好的体积？
"""
from __future__ import annotations
import pickle
import sys
from pathlib import Path

import joblib
import numpy as np

REPO = Path(__file__).resolve().parents[2]
PKL = REPO / "data" / "output" / "umap_model.pkl"

if not PKL.is_file():
    print(f"Error: {PKL} not found", file=sys.stderr)
    raise SystemExit(1)

print(f"[File] {PKL} ({PKL.stat().st_size / 1024 / 1024:.1f} MB on disk, joblib compress=3)")
print(f"[Loading...]")
reducer = joblib.load(PKL)
print(f"[Type] {type(reducer).__module__}.{type(reducer).__name__}")
print()

print("=== 顶层属性大小（pickle.dumps 字节数；按降序）===")
attrs = []
for name in sorted(vars(reducer).keys()):
    val = getattr(reducer, name)
    try:
        b = pickle.dumps(val, protocol=pickle.HIGHEST_PROTOCOL)
        size = len(b)
    except Exception as e:
        size = -1
    type_str = type(val).__module__ + "." + type(val).__name__
    shape_str = ""
    if hasattr(val, "shape"):
        shape_str = f" shape={val.shape}"
    elif hasattr(val, "__len__"):
        try:
            shape_str = f" len={len(val)}"
        except TypeError:
            pass
    attrs.append((size, name, type_str, shape_str))

attrs.sort(reverse=True)
total_uncompressed = sum(s for s, _, _, _ in attrs if s > 0)
print(f"  总和（未压缩 pickle 估算）: {total_uncompressed / 1024 / 1024:.1f} MB")
print()
for size, name, type_str, shape_str in attrs[:25]:
    if size < 0:
        print(f"  {'?':>10}    {name:<30s} {type_str}{shape_str}")
    else:
        mb = size / 1024 / 1024
        if mb >= 0.1:
            print(f"  {mb:>8.2f} MB  {name:<30s} {type_str}{shape_str}")
        else:
            print(f"  {size:>10}    {name:<30s} {type_str}{shape_str}")
print()

print("=== 关键属性深挖 ===")
print("（UMAP transform() 实际依赖：`embedding_`、`_raw_data` 或 KNN search index）")
for k in [
    "embedding_",
    "_raw_data",
    "_search_graph",
    "_knn_indices",
    "_knn_dists",
    "_small_data",
    "_input_hash",
    "_a",
    "_b",
    "_initial_alpha",
    "_n_components",
    "graph_",
    "_disconnection_distance",
    "_supervised",
]:
    if hasattr(reducer, k):
        v = getattr(reducer, k)
        info = f"type={type(v).__name__}"
        if hasattr(v, "shape"):
            info += f", shape={v.shape}"
            if hasattr(v, "dtype"):
                info += f", dtype={v.dtype}"
                info += f", nbytes={v.nbytes / 1024 / 1024:.1f} MB"
        elif hasattr(v, "nnz"):
            info += f", nnz={v.nnz}, shape={v.shape}"
        print(f"  {k:<30s}  {info}")
    else:
        print(f"  {k:<30s}  <missing>")
print()

print("=== 假想瘦身：删 _raw_data + _search_graph 后 transform 还能工作吗？===")
print("（umap-learn 文档：transform 需要 _knn_search_index；删 _raw_data 通常 OK）")
print(f"  原 pkl 体积:           {PKL.stat().st_size / 1024 / 1024:.1f} MB")
import io
import gzip as gz_mod
buf = io.BytesIO()
joblib.dump(reducer, buf, compress=("gzip", 9))
print(f"  joblib gzip-9:         {buf.tell() / 1024 / 1024:.1f} MB")

if hasattr(reducer, "_raw_data"):
    rd = reducer._raw_data
    if hasattr(rd, "nbytes"):
        print(f"  若删 _raw_data 可省:    ~{rd.nbytes / 1024 / 1024:.1f} MB（未压缩）")

if hasattr(reducer, "_search_graph"):
    sg = reducer._search_graph
    if sg is not None:
        try:
            sg_b = pickle.dumps(sg, protocol=pickle.HIGHEST_PROTOCOL)
            print(f"  _search_graph pickle:   {len(sg_b) / 1024 / 1024:.1f} MB")
        except Exception as e:
            print(f"  _search_graph pickle:   <error: {e}>")
