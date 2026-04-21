#!/usr/bin/env bash
# Phase 6 M6 (§8.3.7) — Optional: symlink data/raw → Windows-mounted raw/ (saves disk; reads pay NTFS latency).
# Prefer sync_raw_from_windows.sh for full-GPU pipeline throughput unless space-constrained.
#
# Usage (from WSL, repo root = ext4 clone):
#   bash scripts/env/link_raw_from_windows.sh
# Env:
#   CHRONICLE_WIN_REPO  default /mnt/e/projects/chronicle_v3_3d_galaxy

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CHRONICLE_WIN_REPO="${CHRONICLE_WIN_REPO:-/mnt/e/projects/chronicle_v3_3d_galaxy}"
WIN_RAW="${CHRONICLE_WIN_REPO}/data/raw"
LINK="${REPO_ROOT}/data/raw"

log() { printf '%s\n' "$*"; }
fail() { log "$*" >&2; exit 1; }

main() {
  if [[ ! -d "${WIN_RAW}" ]]; then
    fail "Windows raw dir missing: ${WIN_RAW}"
  fi

  mkdir -p "${REPO_ROOT}/data"

  if [[ -L "${LINK}" ]]; then
    ln -sfn "${WIN_RAW}" "${LINK}"
    log "[ok] updated symlink ${LINK} → ${WIN_RAW}"
    return 0
  fi

  if [[ -e "${LINK}" ]]; then
    fail "${LINK} exists and is not a symlink; remove it or use sync_raw_from_windows.sh instead."
  fi

  ln -sfn "${WIN_RAW}" "${LINK}"
  log "[ok] ${LINK} → ${WIN_RAW}"
}

main "$@"
