#!/usr/bin/env python3
"""Read-only Supabase health preflight for P18.4/P18.5 cron workflows.

The check deliberately stops before any Kaggle download, refit, or database mutation.
Its structured log payload never includes the Supabase URL or service-role key.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import socket
import ssl
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Any, Callable, Mapping
from urllib.parse import SplitResult, urlsplit, urlunsplit

import httpx

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _SCRIPTS_DIR.parent

_ENV_URL = "SUPABASE_URL"
_ENV_SERVICE_ROLE_KEY = "SUPABASE_SERVICE_ROLE_KEY"
_THRESHOLD_SELECT = "version,thresholds_json"

DnsResolver = Callable[[str, int], object]
HttpGet = Callable[[str, Mapping[str, str], float], tuple[int, Any]]


@dataclass(frozen=True)
class SupabaseConnection:
    """Validated origin and redacted host identity for the read-only request."""

    origin: str
    hostname: str
    port: int
    hostname_hash: str
    hostname_tail: str


@dataclass(frozen=True)
class HealthResult:
    """Stable, secret-free contract for CLI logs and workflow diagnostics."""

    ok: bool
    category: str
    http_status: int | None
    hostname_hash: str
    hostname_tail: str
    active_threshold_count: int | None
    years_min: int | None
    years_max: int | None

    def log_payload(self) -> dict[str, object]:
        return asdict(self)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--env-file",
        type=Path,
        default=_REPO_ROOT / ".env",
        help="Optional dotenv file for local use; environment values take precedence.",
    )
    parser.add_argument(
        "--timeout-sec",
        type=float,
        default=15.0,
        help="DNS and PostgREST request timeout in seconds.",
    )
    return parser.parse_args(argv)


def _host_identity(hostname: str) -> tuple[str, str]:
    normalized = hostname.strip().lower().rstrip(".")
    if not normalized:
        return "", ""
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:12]
    return digest, normalized[-12:]


def _split_origin(raw_url: str) -> SplitResult:
    try:
        return urlsplit(raw_url)
    except ValueError as exc:
        raise ValueError("invalid Supabase URL") from exc


def _redacted_identity_from_raw_url(raw_url: str) -> tuple[str, str]:
    try:
        hostname = _split_origin(raw_url).hostname or ""
    except ValueError:
        hostname = ""
    return _host_identity(hostname)


def _parse_connection(raw_url: str) -> SupabaseConnection:
    parsed = _split_origin(raw_url)
    hostname = (parsed.hostname or "").strip().lower().rstrip(".")
    if (
        parsed.scheme != "https"
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in ("", "/")
    ):
        raise ValueError("SUPABASE_URL must be an https origin without credentials, path, query, or fragment")

    try:
        port = parsed.port or 443
    except ValueError as exc:
        raise ValueError("SUPABASE_URL has an invalid port") from exc

    host_hash, host_tail = _host_identity(hostname)
    origin = urlunsplit(("https", parsed.netloc, "", "", "")).rstrip("/")
    return SupabaseConnection(
        origin=origin,
        hostname=hostname,
        port=port,
        hostname_hash=host_hash,
        hostname_tail=host_tail,
    )


def _result(
    *,
    ok: bool,
    category: str,
    connection: SupabaseConnection | None = None,
    identity: tuple[str, str] = ("", ""),
    http_status: int | None = None,
    active_threshold_count: int | None = None,
    years_min: int | None = None,
    years_max: int | None = None,
) -> HealthResult:
    hostname_hash, hostname_tail = (
        (connection.hostname_hash, connection.hostname_tail) if connection is not None else identity
    )
    return HealthResult(
        ok=ok,
        category=category,
        http_status=http_status,
        hostname_hash=hostname_hash,
        hostname_tail=hostname_tail,
        active_threshold_count=active_threshold_count,
        years_min=years_min,
        years_max=years_max,
    )


def _default_dns_resolver(hostname: str, port: int) -> object:
    return socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)


def _default_http_get(url: str, headers: Mapping[str, str], timeout_sec: float) -> tuple[int, Any]:
    response = httpx.get(url, headers=dict(headers), timeout=timeout_sec, follow_redirects=False)
    return int(response.status_code), response.json()


def _is_tls_error(exc: BaseException) -> bool:
    current: BaseException | None = exc
    for _ in range(4):
        if current is None:
            return False
        if isinstance(current, ssl.SSLError):
            return True
        message = str(current).lower()
        if "tls" in message or "ssl" in message or "certificate" in message:
            return True
        current = current.__cause__ or current.__context__
    return False


def _extract_threshold_years(payload: Any) -> tuple[int, int, int]:
    if not isinstance(payload, list):
        raise ValueError("PostgREST threshold response must be an array")
    if len(payload) != 1:
        raise LookupError(f"expected exactly one active threshold row, got {len(payload)}")

    row = payload[0]
    if not isinstance(row, dict):
        raise ValueError("active threshold row must be an object")
    thresholds = row.get("thresholds_json")
    if isinstance(thresholds, str):
        try:
            thresholds = json.loads(thresholds)
        except json.JSONDecodeError as exc:
            raise ValueError("thresholds_json is invalid JSON") from exc
    if not isinstance(thresholds, dict) or not thresholds:
        raise ValueError("active threshold row must contain a non-empty thresholds_json object")

    try:
        years = sorted(int(str(year)) for year in thresholds)
    except (TypeError, ValueError) as exc:
        raise ValueError("thresholds_json keys must be integer years") from exc
    return len(payload), years[0], years[-1]


def run_preflight(
    *,
    environment: Mapping[str, str] | None = None,
    timeout_sec: float = 15.0,
    dns_resolver: DnsResolver = _default_dns_resolver,
    http_get: HttpGet = _default_http_get,
) -> HealthResult:
    """Validate configuration, DNS, TLS/PostgREST, and active threshold cardinality.

    Only one GET request is issued: ``threshold_versions?is_active=eq.true``.
    """
    if timeout_sec <= 0:
        raise ValueError("timeout_sec must be positive")

    env = MappingProxyType(dict(os.environ if environment is None else environment))
    raw_url = str(env.get(_ENV_URL, "")).strip()
    service_role_key = str(env.get(_ENV_SERVICE_ROLE_KEY, "")).strip()
    identity = _redacted_identity_from_raw_url(raw_url)
    if not raw_url or not service_role_key:
        return _result(ok=False, category="config_missing", identity=identity)

    try:
        connection = _parse_connection(raw_url)
    except ValueError:
        return _result(ok=False, category="url_invalid", identity=identity)

    try:
        dns_resolver(connection.hostname, connection.port)
    except (socket.gaierror, OSError):
        return _result(ok=False, category="dns_failure", connection=connection)

    endpoint = f"{connection.origin}/rest/v1/threshold_versions?is_active=eq.true&select={_THRESHOLD_SELECT}"
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Accept": "application/json",
    }
    try:
        http_status, payload = http_get(endpoint, headers, timeout_sec)
    except Exception as exc:
        category = "tls_failure" if _is_tls_error(exc) else "postgrest_transport_failure"
        return _result(ok=False, category=category, connection=connection)

    if http_status in (401, 403):
        return _result(
            ok=False,
            category="auth_failure",
            connection=connection,
            http_status=http_status,
        )
    if not 200 <= http_status < 300:
        return _result(
            ok=False,
            category="postgrest_http_failure",
            connection=connection,
            http_status=http_status,
        )

    try:
        active_count, years_min, years_max = _extract_threshold_years(payload)
    except LookupError:
        return _result(
            ok=False,
            category="active_threshold_cardinality_failure",
            connection=connection,
            http_status=http_status,
            active_threshold_count=len(payload) if isinstance(payload, list) else None,
        )
    except ValueError:
        return _result(
            ok=False,
            category="threshold_contract_failure",
            connection=connection,
            http_status=http_status,
        )

    return _result(
        ok=True,
        category="ok",
        connection=connection,
        http_status=http_status,
        active_threshold_count=active_count,
        years_min=years_min,
        years_max=years_max,
    )


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.timeout_sec <= 0:
        print("[P37 Supabase preflight] invalid --timeout-sec", file=sys.stderr, flush=True)
        return 2

    env_file = args.env_file.expanduser().resolve()
    if env_file.is_file():
        from dotenv import load_dotenv

        load_dotenv(env_file, override=False)

    result = run_preflight(timeout_sec=float(args.timeout_sec))
    print(
        "[P37 Supabase preflight] " + json.dumps(result.log_payload(), sort_keys=True, separators=(",", ":")),
        flush=True,
    )
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())