#!/usr/bin/env bash
# Phase 6 M2 — Install Miniforge (mamba) if needed, then create conda env `chronicle`
# from scripts/env/rapids_env.yml. Optional smoke: cuml + UMAP import.
#
# Usage (from repo root on WSL/Linux):
#   bash scripts/env/install_chronicle_conda_env.sh
#   bash scripts/env/install_chronicle_conda_env.sh --update
#   CHRONICLE_MINIFORGE_HOME=/path/to/miniforge3 bash scripts/env/install_chronicle_conda_env.sh
#
# Options:
#   --update       mamba env update -f rapids_env.yml (env must exist)
#   --skip-smoke   do not run import smoke after create/update
#   --yes          non-interactive (default; mamba create/update use -y)
#
# Requires: bash, curl, standard Unix tools. No sudo (installs Miniforge under $HOME).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
YAML="${REPO_ROOT}/scripts/env/rapids_env.yml"

DO_UPDATE=0
SKIP_SMOKE=0

for arg in "$@"; do
  case "${arg}" in
    --update) DO_UPDATE=1 ;;
    --skip-smoke) SKIP_SMOKE=1 ;;
    --yes) ;; # reserved for symmetry with conda CLIs
    *)
      echo "Unknown option: ${arg}" >&2
      exit 2
      ;;
  esac
done

log() { printf '%s\n' "$*"; }

fail() {
  log "$*" >&2
  exit 1
}

print_pip_fallback_hint() {
  cat <<'EOF'

If mamba/conda cannot solve the environment (channel conflicts, CUDA mismatch), use the
official RAPIDS pip wheels path as a fallback (CUDA 12.x driver required), for example:

  python3.11 -m venv ~/chronicle-pip-venv
  source ~/chronicle-pip-venv/bin/activate
  pip install --upgrade pip
  # Pin sets change by RAPIDS release — use the Release Selector output, e.g.:
  pip install 'cuml-cu12' 'dask-cuda' pandas numpy scikit-learn sentence-transformers \
    torch joblib tqdm

Then verify:
  python -c "import cuml; from cuml.manifold import UMAP"

See: https://docs.rapids.ai/install/

EOF
}

detect_miniforge_name() {
  local arch
  arch="$(uname -m)"
  case "${arch}" in
    x86_64)  echo "Miniforge3-Linux-x86_64.sh" ;;
    aarch64) echo "Miniforge3-Linux-aarch64.sh" ;;
    *) fail "Unsupported machine: ${arch} (need x86_64 or aarch64 for Miniforge Linux)." ;;
  esac
}

ensure_mamba_on_path() {
  local install_dir
  install_dir="${CHRONICLE_MINIFORGE_HOME:-${HOME}/miniforge3}"

  if command -v mamba >/dev/null 2>&1; then
    return 0
  fi

  if [[ -x "${install_dir}/bin/mamba" ]]; then
    export PATH="${install_dir}/bin:${PATH}"
    return 0
  fi

  local name url
  name="$(detect_miniforge_name)"
  url="https://github.com/conda-forge/miniforge/releases/latest/download/${name}"
  log "Installing Miniforge (mamba) to ${install_dir} ..."
  local tmp
  tmp="$(mktemp)"
  curl -fsSL "${url}" -o "${tmp}"
  bash "${tmp}" -b -p "${install_dir}"
  rm -f "${tmp}"
  export PATH="${install_dir}/bin:${PATH}"

  command -v mamba >/dev/null 2>&1 || fail "mamba not found after Miniforge install."
}

env_exists() {
  mamba run -n chronicle true 2>/dev/null
}

run_smoke() {
  if [[ "${SKIP_SMOKE}" -eq 1 ]]; then
    log "[skip] cuml smoke (--skip-smoke)"
    return 0
  fi
  log "Smoke: import cuml; from cuml.manifold import UMAP ..."
  mamba run -n chronicle python -c "import cuml; from cuml.manifold import UMAP; print('cuml UMAP smoke OK')"
}

main() {
  [[ -f "${YAML}" ]] || fail "Missing ${YAML}"

  ensure_mamba_on_path

  if [[ "${DO_UPDATE}" -eq 1 ]]; then
    env_exists || fail "Environment 'chronicle' does not exist. Create it first without --update."
    log "Updating env chronicle from ${YAML} ..."
    mamba env update -n chronicle -f "${YAML}" --prune -y
    run_smoke
    log "Done (update)."
    log "M6: bash scripts/env/sync_raw_from_windows.sh | bash scripts/env/sync_artifacts_to_windows.sh"
    return 0
  fi

  if env_exists; then
    log "Conda env 'chronicle' already exists."
    log "To refresh packages: bash scripts/env/install_chronicle_conda_env.sh --update"
    log "To recreate:       mamba env remove -n chronicle -y  # then re-run this script"
    log "M6 WSL ↔ Windows sync: scripts/env/sync_raw_from_windows.sh | sync_artifacts_to_windows.sh"
    exit 0
  fi

  log "Creating env chronicle from ${YAML} (this may take several minutes) ..."
  if ! mamba env create -f "${YAML}" -y; then
    log "ERROR: mamba env create failed." >&2
    print_pip_fallback_hint
    exit 1
  fi

  run_smoke
  log ""
  log "M2 conda env ready. Activate with:  mamba activate chronicle"
  log "M6 layout: clone/work on ext4 (e.g. ~/chronicle_v3_3d_galaxy), not only /mnt/e/...;"
  log "  pull raw:  bash scripts/env/sync_raw_from_windows.sh"
  log "  push out:  bash scripts/env/sync_artifacts_to_windows.sh"
}

main "$@"
