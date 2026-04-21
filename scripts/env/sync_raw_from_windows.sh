#!/usr/bin/env bash
# Phase 6 M6 (§8.3.7) — Copy data/raw from the Windows-mounted repo into this WSL (ext4) clone.
# Prefer working in ~/chronicle_v3_3d_galaxy on ext4; avoid heavy NTFS I/O for training reads.
#
# Usage (from WSL, repo root = ext4 clone):
#   bash scripts/env/sync_raw_from_windows.sh
#   CHRONICLE_WIN_REPO=/mnt/c/Users/you/src/chronicle_v3_3d_galaxy bash scripts/env/sync_raw_from_windows.sh
# Options:
#   --dry-run   rsync dry run only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

CHRONICLE_WIN_REPO="${CHRONICLE_WIN_REPO:-/mnt/e/projects/chronicle_v3_3d_galaxy}"
SRC="${CHRONICLE_WIN_REPO}/data/raw"
DST="${REPO_ROOT}/data/raw"

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
  if [[ ! -d "${SRC}" ]]; then
    fail "Source raw dir missing: ${SRC}"
  fi

  mkdir -p "${DST}"
  log "rsync ${SRC}/ → ${DST}/"
  # --partial --inplace help large single-file CSV restarts; -c omitted for speed on LAN disk
  rsync -av "${DRY_RUN[@]}" --partial --inplace "${SRC}/" "${DST}/"

  if [[ ! -f "${DST}/TMDB_all_movies.csv" ]]; then
    log "Warning: TMDB_all_movies.csv not present under ${DST} after sync." >&2
  else
    log "[ok] TMDB_all_movies.csv present under ${DST}"
  fi
}

main "$@"
