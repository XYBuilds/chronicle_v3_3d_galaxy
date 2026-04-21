#!/usr/bin/env bash
# Idempotent WSL Ubuntu base bootstrap for Chronicle Phase 6 (M1 / plan §8.3.1).
# Installs: git, build-essential, curl, ca-certificates, Python 3.11 + venv + pip;
# verifies GPU visibility via nvidia-smi when not skipped.
#
# Usage (from repo root on WSL):
#   sudo bash scripts/env/bootstrap_wsl.sh
# Options:
#   --skip-apt-upgrade     Only apt-get update + installs (faster re-runs)
#   --skip-nvidia-check    Do not require nvidia-smi (e.g. CPU-only WSL for dry runs)
#
# Requires: Ubuntu on WSL2. Run as root (sudo) for apt.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

SKIP_APT_UPGRADE=0
SKIP_NVIDIA=0
for arg in "$@"; do
  case "${arg}" in
    --skip-apt-upgrade) SKIP_APT_UPGRADE=1 ;;
    --skip-nvidia-check) SKIP_NVIDIA=1 ;;
    *)
      echo "Unknown option: ${arg}" >&2
      exit 2
      ;;
  esac
done

log() { printf '%s\n' "$*"; }

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    log "This script must run as root for apt. Example:"
    log "  cd ${REPO_ROOT}"
    log "  sudo bash scripts/env/bootstrap_wsl.sh"
    exit 1
  fi
}

detect_wsl() {
  if [[ -f /proc/version ]] && grep -qi microsoft /proc/version; then
    return 0
  fi
  log "Warning: /proc/version does not look like WSL. Continuing anyway."
  return 0
}

export DEBIAN_FRONTEND=noninteractive

apt_update() {
  apt-get update -y
}

apt_upgrade_optional() {
  if [[ "${SKIP_APT_UPGRADE}" -eq 1 ]]; then
    log "[skip] apt upgrade (--skip-apt-upgrade)"
    return 0
  fi
  log "Running apt upgrade (noninteractive)..."
  apt-get -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade
}

install_base_packages() {
  apt-get install -y \
    git \
    build-essential \
    curl \
    ca-certificates \
    software-properties-common
}

python311_usable() {
  command -v python3.11 >/dev/null 2>&1 && python3.11 -c "import sys; assert sys.version_info[:2] >= (3, 11)" 2>/dev/null
}

python311_in_default_repos() {
  local cand
  cand="$(apt-cache policy python3.11 2>/dev/null | awk '/Candidate:/{print $2; exit}')"
  [[ -n "${cand}" && "${cand}" != "(none)" ]]
}

ensure_python311() {
  if python311_usable; then
    log "[ok] python3.11 already usable: $(python3.11 -V)"
    return 0
  fi

  if python311_in_default_repos; then
    log "Installing python3.11 from default apt sources..."
    apt-get install -y python3.11 python3.11-venv python3.11-dev
  else
    log "python3.11 not in default repos; adding deadsnakes PPA (idempotent if present)..."
    if ! grep -Rq "deadsnakes/ppa" /etc/apt/sources.list /etc/apt/sources.list.d/*.list 2>/dev/null; then
      add-apt-repository -y ppa:deadsnakes/ppa
      apt-get update -y
    else
      log "[ok] deadsnakes PPA already configured"
    fi
    apt-get install -y python3.11 python3.11-venv python3.11-dev
  fi

  if ! python311_usable; then
    log "ERROR: python3.11 still not available after install attempts." >&2
    exit 1
  fi
  log "[ok] $(python3.11 -V)"
}

ensure_pip_for_py311() {
  if ! python3.11 -m pip --version >/dev/null 2>&1; then
    python3.11 -m ensurepip --upgrade >/dev/null 2>&1 || {
      log "[info] ensurepip unavailable; bootstrapping pip via get-pip.py..."
      curl -fsSL https://bootstrap.pypa.io/get-pip.py -o /tmp/chronicle-get-pip.py
      python3.11 /tmp/chronicle-get-pip.py --no-warn-script-location
      rm -f /tmp/chronicle-get-pip.py
    }
  fi
  python3.11 -m pip install --upgrade pip setuptools wheel
  log "[ok] pip for python3.11: $(python3.11 -m pip --version)"
}

check_nvidia_smi() {
  if [[ "${SKIP_NVIDIA}" -eq 1 ]]; then
    log "[skip] nvidia-smi check (--skip-nvidia-check)"
    return 0
  fi
  if ! command -v nvidia-smi >/dev/null 2>&1; then
    log "ERROR: nvidia-smi not found inside WSL." >&2
    log "Install/update the NVIDIA Windows driver with WSL GPU support, then reopen WSL." >&2
    log "Re-run with --skip-nvidia-check only if you intentionally want CPU-only WSL." >&2
    exit 1
  fi
  log "Checking GPU from WSL (nvidia-smi)..."
  nvidia-smi
  log "[ok] nvidia-smi succeeded — GPU is visible from WSL."
}

main() {
  require_root
  detect_wsl

  log "Repo root (for your reference): ${REPO_ROOT}"
  log "Starting M1 bootstrap (apt base + Python 3.11 + venv tooling)..."

  apt_update
  apt_upgrade_optional
  install_base_packages
  ensure_python311
  ensure_pip_for_py311
  check_nvidia_smi

  log ""
  log "M1 bootstrap finished."
  log "Next (Phase 6 M2): bash scripts/env/install_chronicle_conda_env.sh  # uses scripts/env/rapids_env.yml"
  log "M6 (WSL ext4 clone ↔ /mnt/...): sync_raw_from_windows.sh / sync_artifacts_to_windows.sh under scripts/env/"
}

main "$@"
