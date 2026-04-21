#!/usr/bin/env bash
# Alternate full Phase 2 export: 768d mpnet embeddings, n_neighbors=100, no DensMAP, cuML UMAP (GPU).
# Writes npy under data/output/variant_gpu768_n100/ and galaxy_data_gpu768_n100.json(.gz) in frontend/public/data/.
# Requires Phase 1 cleaned.csv at data/output/cleaned.csv (same row order as TMDB pipeline).
#
# Usage: from repo root on WSL (or Windows: wsl -d Ubuntu -- bash scripts/env/run_variant_gpu768_n100_cuml.sh)
# Activates conda env chronicle when CONDA_DEFAULT_ENV is not already chronicle.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
if [[ "${CONDA_DEFAULT_ENV:-}" != "chronicle" ]] && [[ -f "${HOME}/miniforge3/etc/profile.d/conda.sh" ]]; then
  set +u
  # shellcheck source=/dev/null
  source "${HOME}/miniforge3/etc/profile.d/conda.sh"
  conda activate chronicle
  set -u
fi
set -o pipefail
cd "${REPO_ROOT}"
export PYTHONUNBUFFERED=1
# shellcheck source=/dev/null
source "${REPO_ROOT}/scripts/env/wsl_proxy_clash.sh"

ART="${REPO_ROOT}/data/output/variant_gpu768_n100"
CLEANED="${REPO_ROOT}/data/output/cleaned.csv"
OUT_JSON="${REPO_ROOT}/frontend/public/data/galaxy_data_gpu768_n100.json"
OUT_GZ="${REPO_ROOT}/frontend/public/data/galaxy_data_gpu768_n100.json.gz"

MPNET_ID="sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
META_MODEL="paraphrase-multilingual-mpnet-base-v2"

mkdir -p "${ART}"

if [[ ! -f "${CLEANED}" ]]; then
  echo "Missing ${CLEANED} — run Phase 1 (e.g. scripts/run_pipeline.py on raw CSV) first." >&2
  exit 1
fi

nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv
date -Is

python scripts/feature_engineering/text_embedding.py \
  --input "${CLEANED}" \
  --output "${ART}/text_embeddings.npy" \
  --model-id "${MPNET_ID}" \
  --device cuda \
  --batch-size 16

python scripts/feature_engineering/genre_encoding.py \
  --input "${CLEANED}" \
  --output "${ART}/genre_vectors.npy"

python scripts/feature_engineering/language_encoding.py \
  --input "${CLEANED}" \
  --output "${ART}/language_vectors.npy"

python scripts/feature_engineering/umap_projection.py \
  --text-input "${ART}/text_embeddings.npy" \
  --genre-input "${ART}/genre_vectors.npy" \
  --lang-input "${ART}/language_vectors.npy" \
  --output-xy "${ART}/umap_xy.npy" \
  --model-output "${ART}/umap_model.pkl" \
  --backend cuml \
  --n-neighbors 100 \
  --min-dist 0.4 \
  --metric cosine \
  --random-state 42

python scripts/export/export_galaxy_json.py \
  --input "${CLEANED}" \
  --xy-input "${ART}/umap_xy.npy" \
  --output-json "${OUT_JSON}" \
  --output-gzip "${OUT_GZ}" \
  --embedding-model "${META_MODEL}" \
  --n-neighbors 100 \
  --min-dist 0.4 \
  --metric cosine \
  --random-state 42

python scripts/validate_galaxy_json.py --input "${OUT_JSON}"
date -Is
echo "Done. Artifacts: ${ART}  ${OUT_JSON}"
