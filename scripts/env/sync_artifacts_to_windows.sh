#!/usr/bin/env bash
# Phase 6 M6 (§8.3.7) — Push pipeline artifacts from WSL ext4 clone back to the Windows repo mount
# so Vite / Windows tools see fresh npy + galaxy_data.json(.gz).
#
# Usage (from WSL, repo root = ext4 clone):
#   bash scripts/env/sync_artifacts_to_windows.sh
#   CHRONICLE_WIN_REPO=/mnt/c/Users/you/src/chronicle_v3_3d_galaxy bash scripts/env/sync_artifacts_to_windows.sh
# Options:
#   --dry-run   rsync dry run only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

CHRONICLE_WIN_REPO="${CHRONICLE_WIN_REPO:-/mnt/e/projects/chronicle_v3_3d_galaxy}"

DRY_RUN=()
for arg in "$@"; do
  case "${arg}" in
    --dry-run) DRY_RUN=(--dry-run) ;;
    *)
      echo "Unknown option: ${arg}" >&2
      exit 2
      ;;
  esac
done

log() { printf '%s\n' "$*"; }
fail() { log "$*" >&2; exit 1; }

main() {
  if [[ ! -d "${CHRONICLE_WIN_REPO}" ]]; then
    fail "Windows repo path not found: ${CHRONICLE_WIN_REPO} (set CHRONICLE_WIN_REPO if your drive/letter differs)."
  fi

  mkdir -p "${CHRONICLE_WIN_REPO}/data/output" "${CHRONICLE_WIN_REPO}/frontend/public/data"

  shopt -s nullglob
  npy=( "${REPO_ROOT}/data/output/"*.npy )
  if [[ "${#npy[@]}" -gt 0 ]]; then
    log "rsync ${#npy[@]} file(s) *.npy → ${CHRONICLE_WIN_REPO}/data/output/"
    rsync -av "${DRY_RUN[@]}" "${npy[@]}" "${CHRONICLE_WIN_REPO}/data/output/"
  else
    log "[skip] no *.npy under ${REPO_ROOT}/data/output/"
  fi

  for name in galaxy_data.json galaxy_data.json.gz; do
    f="${REPO_ROOT}/frontend/public/data/${name}"
    if [[ -f "${f}" ]]; then
      log "rsync ${name} → ${CHRONICLE_WIN_REPO}/frontend/public/data/"
      rsync -av "${DRY_RUN[@]}" "${f}" "${CHRONICLE_WIN_REPO}/frontend/public/data/"
    else
      log "[skip] missing ${f}"
    fi
  done

  log "Done. Windows tree: ${CHRONICLE_WIN_REPO}"
}

main "$@"
