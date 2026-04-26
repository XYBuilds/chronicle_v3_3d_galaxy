# P8.2 · UMAP `min_dist` sweep artifacts

This folder holds optional **`galaxy_data.mindist{05|07|09}.json.gz`** files produced by the pipeline (not committed if you have not generated them yet).

## Generate (repo root)

Requires `data/output/cleaned.csv` and aligned `text_embeddings.npy` / `genre_vectors.npy` / `language_vectors.npy` (same row order as production UMAP).

```bash
python scripts/experiments/min_dist_sweep.py
```

Optional: `--backend umap` (CPU-only), `--keep-xy-npy`, `--subset-z-min-inclusive` / `--subset-z-max-exclusive`.

Each run **re-fits UMAP on the full fused matrix** for `min_dist ∈ {0.5, 0.7, 0.9}`, then exports only movies with **decimal-year z ∈ [2020, 2026)** (calendar 2020–2025). `meta.subset_z_filter` and `meta.umap_fit_row_count` document the band and full-row UMAP fit (see `export_galaxy_json.py`).

## Compare in the app

```text
http://localhost:5173/?dataset=mindist05
http://localhost:5173/?dataset=mindist07
http://localhost:5173/?dataset=mindist09
```

Omit `dataset` to load the main `data/galaxy_data.json.gz`.

After you pick a winner, record the chosen `min_dist` and run a **separate full export** to replace the main asset (outside P8.2 closure per Phase 8 plan).
