# Galaxy data model

> Answers: where galaxy membership and coordinates come from—sources, cleaning, feature engineering, axes, and export/schema semantics
> Excludes: nightly/monthly publication orchestration, R2/Pages deploy steps, frontend loaders, and visitor-facing exploration behavior
> Update when: cleaning rules, feature/UMAP parameters, export schema, genre palette/language vocab, or search-index normalize version change
> Required authorities: [`docs/system/planet-export-contract.md`](../system/planet-export-contract.md) for consumer-visible galaxy/manifest schema boundaries (C-004)

## Current answer

### Sources and cleaning

Primary input is the TMDB Movies Daily Updates corpus. Rows must survive cleaning before they enter the galaxy: primary key `id` (TMDB), secondary dedupe on `imdb_id`, drop empty genres, zero/null votes, missing release dates, and rows lacking both overview and title. Dynamic per-year vote-count thresholds gate membership. The current rule, owned by [`scripts/pipeline/cleaning.py`](../../scripts/pipeline/cleaning.py), is: for each calendar year take the 0.95 quantile of `vote_count`, interpolate missing years, smooth with a 6-year rolling mean, then apply `threshold = max(1, 0.15 × smoothed baseline)`. Newly eligible titles wait in pending until a monthly refit admits them.

Supabase tables (`movies`, `movies_pending`, `galaxy_v1_reference`, `threshold_versions`, optional vote snapshots) are the offline source of truth. The frontend never queries the database; it consumes exported static gzip assets.

### Features and coordinates

- Text: multilingual sentence-transformers embeddings only (never English-only models). Current production path uses `paraphrase-multilingual-MiniLM-L12-v2` for the active pipeline configuration evidenced in scripts.
- Genre: rank-weighted multi-hot with default ratio `1/φ ≈ 0.618`; palette is the frozen nineteen official genres (`genre_palette_version` bumps on change).
- Language: one-hot over the accepted spoken-language vocabulary.
- Fusion: group-wise L2 normalization and scaling before UMAP.
- **X/Y**: DensMAP UMAP with fixed `random_state=42` and the accepted neighbor/min-dist/metric settings in the pipeline scripts.
- **Z**: decimal year from `release_date` (with deterministic jitter for placeholder dates). Z is **not** fed to UMAP and keeps raw year scale.

Cast/crew payload may be exported for the archive drawer and search index; it is not a UMAP feature.

### Export / schema semantics

- `galaxy_data.json(.gz)` carries meta + per-movie render/search fields consumed by the site and Planet Export.
- `galaxy_search_index.json.gz` carries people role masks and genre indexes when enabled; writer normalize version is the current v2 NFKC path.
- Manifest fields consumed by the site include gzip URLs, `data_version`, and the optional active focus-emission profile pointer.

Field-level quick lookup may use [`TMDB 数据特征工程与 3D 映射总表.md`](../project_docs/TMDB%20数据特征工程与%203D%20映射总表.md) as a supporting reference only; exact mappings and defaults remain schema/source evidence.

## Boundaries and invariants

- UMAP `random_state=42` stays fixed.
- Genre weight default `1/φ` is configurable only with an explicit version bump.
- Multilingual embedding models only.
- Z axis remains raw decimal-year scale without normalization into UMAP space.
- Disabled historical filters (adult/runtime/budget gates, etc.) are not current membership rules unless re-accepted.
- This topic does not own workflow schedules or R2/Pages publication order.

## Verification evidence

- `scripts/feature_engineering/`, `scripts/export/`, `scripts/pipeline/`
- `frontend/src/types/galaxy.ts` and asset validation tests
- [`docs/system/planet-export-contract.md`](../system/planet-export-contract.md)
- Subsample schema samples under `data/subsample/` (never inject the raw multi-hundred-MB CSV into chat context)

## Related topics

- [`refresh-and-publication.md`](./refresh-and-publication.md)
- [`../product/galaxy-exploration.md`](../product/galaxy-exploration.md)
- [`../frontend/runtime.md`](../frontend/runtime.md)
