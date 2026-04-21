#!/usr/bin/env bash
# Source from WSL bash (do not execute directly): use Windows Clash from inside WSL2.
#
# Prefer the Windows host IP from the default route ("default via <ip>") — this is the
# address that reaches services bound with Clash "Allow LAN". The nameserver in
# /etc/resolv.conf (e.g. 10.255.255.254) is often DNS-only and will refuse arbitrary ports.
#
# Override host:  export CHRONICLE_WIN_HOST=172.20.32.1
# Override port:  export CHRONICLE_CLASH_PORT=7897
# Disable:        export CHRONICLE_WSL_PROXY=0
#
# shellcheck shell=bash
if [[ "${CHRONICLE_WSL_PROXY:-1}" == "0" ]]; then
  return 0 2>/dev/null || exit 0
fi
if [[ -n "${http_proxy:-}" ]] || [[ -n "${HTTP_PROXY:-}" ]]; then
  return 0 2>/dev/null || exit 0
fi

_host="${CHRONICLE_WIN_HOST:-}"
if [[ -z "${_host}" ]]; then
  _host="$(ip route show default 2>/dev/null | awk '/default/ {for (i=1; i<NF; i++) if ($i == "via") { print $(i+1); exit }}')"
fi
if [[ -z "${_host}" ]]; then
  _host="$(grep -m1 '^nameserver ' /etc/resolv.conf 2>/dev/null | awk '{print $2}')"
fi

_port="${CHRONICLE_CLASH_PORT:-7897}"
if [[ -z "${_host}" ]]; then
  echo "[wsl-proxy] skip: could not resolve Windows host (set CHRONICLE_WIN_HOST)" >&2
  return 0 2>/dev/null || exit 0
fi

export http_proxy="http://${_host}:${_port}"
export https_proxy="http://${_host}:${_port}"
export HTTP_PROXY="${http_proxy}"
export HTTPS_PROXY="${https_proxy}"
export ALL_PROXY="${http_proxy}"
export NO_PROXY="localhost,127.0.0.1,::1"
export no_proxy="${NO_PROXY}"
echo "[wsl-proxy] HF/downloads via http://${_host}:${_port} (Clash: Allow LAN + Mixed port)" >&2
