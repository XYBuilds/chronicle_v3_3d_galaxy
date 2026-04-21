#!/usr/bin/env bash
# Resume run_variant_gpu768_n100_cuml.sh after text_embeddings.npy is already present (skip HF download).
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
# shellcheck source=/dev/null
source "${REPO_ROOT}/scripts/env/wsl_proxy_clash.sh"
export PYTHONUNBUFFERED=1

ART="${REPO_ROOT}/data/output/variant_gpu768_n100"
CLEANED="${REPO_ROOT}/data/output/cleaned.csv"
OUT_JSON="${REPO_ROOT}/frontend/public/data/galaxy_data_gpu768_n100.json"
OUT_GZ="${REPO_ROOT}/frontend/public/data/galaxy_data_gpu768_n100.json.gz"
META_MODEL="paraphrase-multilingual-mpnet-base-v2"

if [[ ! -f "${ART}/text_embeddings.npy" ]]; then
  echo "Missing ${ART}/text_embeddings.npy — run run_variant_gpu768_n100_cuml.sh first." >&2
  exit 1
fi

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
echo "Resume complete: ${OUT_JSON}"
