#!/usr/bin/env bash
# Phase 6 M8 — full TMDB clean + Phase 2.1–2.5 with cuML DensMAP (plan §8.3.9).
# Prerequisites: plan backup `cp data/output/umap_xy.npy data/output/umap_xy.umap-learn.npy` once before first full retrain.
# Run from WSL (chronicle conda env): bash scripts/env/run_m8_full_retrain_wsl.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"
export PYTHONUNBUFFERED=1
nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv
date -Is
python scripts/run_pipeline.py \
  --through-phase-2 \
  --umap-backend cuml \
  --densmap \
  --n-neighbors 100 \
  --min-dist 0.4
date -Is
