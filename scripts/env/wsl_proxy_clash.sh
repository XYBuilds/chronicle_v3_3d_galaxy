#!/usr/bin/env bash
# Source from WSL bash (do not execute directly): use Windows Clash / system proxy from inside WSL2.
#
# WSL cannot use 127.0.0.1 on the Windows side; use the Windows host IP (first nameserver in
# /etc/resolv.conf) and Clash "Mixed port" (often 7897). Clash must enable "Allow LAN".
#
# Disable auto-config:  export CHRONICLE_WSL_PROXY=0
# Custom port:           export CHRONICLE_CLASH_PORT=7890
# Already have proxy:   leave http_proxy / https_proxy set — this script does nothing.
#
# shellcheck shell=bash
if [[ "${CHRONICLE_WSL_PROXY:-1}" == "0" ]]; then
  return 0 2>/dev/null || exit 0
fi
if [[ -n "${http_proxy:-}" ]] || [[ -n "${HTTP_PROXY:-}" ]]; then
  return 0 2>/dev/null || exit 0
fi
_ns="$(grep -m1 '^nameserver ' /etc/resolv.conf 2>/dev/null | awk '{print $2}')"
_port="${CHRONICLE_CLASH_PORT:-7897}"
if [[ -z "${_ns}" ]]; then
  echo "[wsl-proxy] skip: no nameserver in /etc/resolv.conf" >&2
  return 0 2>/dev/null || exit 0
fi
export http_proxy="http://${_ns}:${_port}"
export https_proxy="http://${_ns}:${_port}"
export HTTP_PROXY="${http_proxy}"
export HTTPS_PROXY="${https_proxy}"
export ALL_PROXY="${http_proxy}"
export NO_PROXY="localhost,127.0.0.1,::1"
export no_proxy="${NO_PROXY}"
echo "[wsl-proxy] HF/downloads via Windows host ${_ns}:${_port} (Clash: Allow LAN + Mixed port)" >&2
