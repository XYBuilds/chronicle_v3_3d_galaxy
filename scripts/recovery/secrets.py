"""Synthetic secrets-authority drill and name-only credential inventory."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from typing import Callable, Iterable, Mapping, Sequence

PasswordReader = Callable[[], str]

_PBKDF2_ROUNDS = 200_000


class SecretsError(ValueError):
    """Synthetic drill or inventory rules were violated."""


_INVENTORY: tuple[dict[str, object], ...] = (
    {
        "name": "SUPABASE_URL",
        "purpose": "Chronicle Supabase project URL",
        "consumers": ("chronicle local", "Daily Data Release", "Monthly Data Release"),
    },
    {
        "name": "SUPABASE_SERVICE_ROLE_KEY",
        "purpose": "Chronicle Supabase service role",
        "consumers": ("chronicle local", "Daily Data Release", "Monthly Data Release"),
    },
    {
        "name": "KAGGLE_USERNAME",
        "purpose": "Kaggle dataset download identity",
        "consumers": ("chronicle local", "Daily Data Release"),
    },
    {
        "name": "KAGGLE_KEY",
        "purpose": "Kaggle API key",
        "consumers": ("chronicle local", "Daily Data Release"),
    },
    {
        "name": "CLOUDFLARE_ACCOUNT_ID",
        "purpose": "Cloudflare account identifier",
        "consumers": ("chronicle local", "OG Worker deploy", "Site Release"),
    },
    {
        "name": "CLOUDFLARE_API_TOKEN",
        "purpose": "Cloudflare API token",
        "consumers": ("chronicle local", "OG Worker deploy", "Site Release", "Daily Data Release"),
    },
    {
        "name": "OG_INDEX_KV_NAMESPACE_ID",
        "purpose": "OG Index KV namespace",
        "consumers": ("chronicle local", "OG Worker", "Daily Data Release"),
    },
    {
        "name": "OG_INDEX_KV_API_TOKEN",
        "purpose": "Scoped OG Index KV token",
        "consumers": ("chronicle local", "Daily Data Release"),
    },
    {
        "name": "R2_ACCOUNT_ID",
        "purpose": "R2 account identifier",
        "consumers": ("chronicle local", "Daily Data Release", "Monthly Data Release", "Site Release"),
    },
    {
        "name": "R2_ACCESS_KEY_ID",
        "purpose": "R2 access key",
        "consumers": ("chronicle local", "Daily Data Release", "Monthly Data Release", "Site Release"),
    },
    {
        "name": "R2_SECRET_ACCESS_KEY",
        "purpose": "R2 secret access key",
        "consumers": ("chronicle local", "Daily Data Release", "Monthly Data Release", "Site Release"),
    },
    {
        "name": "R2_BUCKET",
        "purpose": "R2 bucket name",
        "consumers": ("chronicle local", "Daily Data Release", "Monthly Data Release", "Site Release"),
    },
    {
        "name": "R2_PUBLIC_BASE_URL",
        "purpose": "Public R2 base URL",
        "consumers": ("chronicle local", "Site Release"),
    },
    {
        "name": "CF_WEB_ANALYTICS_BEACON_TOKEN",
        "purpose": "Cloudflare Web Analytics beacon",
        "consumers": ("chronicle Site Release",),
    },
    {
        "name": "TMDB_API_KEY",
        "purpose": "Optional TMDB lookup",
        "consumers": ("Daily Stargazing local",),
    },
    {
        "name": "MIMO_API_KEY",
        "purpose": "Daily Stargazing LLM provider",
        "consumers": ("Daily Stargazing local",),
    },
    {
        "name": "DEEPSEEK_API_KEY",
        "purpose": "Daily Stargazing LLM fallback",
        "consumers": ("Daily Stargazing local",),
    },
)

_PRODUCTION_NAMES = frozenset(str(item["name"]) for item in _INVENTORY)


def production_credential_names() -> frozenset[str]:
    return _PRODUCTION_NAMES


def credential_inventory() -> tuple[dict[str, object], ...]:
    return tuple({key: value for key, value in item.items() if key != "value"} for item in _INVENTORY)


def _assert_synthetic(records: Sequence[Mapping[str, str]]) -> None:
    for record in records:
        name = record["name"]
        value = record["value"]
        if name in _PRODUCTION_NAMES or not value.startswith("synthetic-"):
            raise SecretsError("live credentials are forbidden in the synthetic drill")


def _derive(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ROUNDS, dklen=32)


def _keystream(key: bytes, length: int) -> bytes:
    out = bytearray()
    counter = 0
    while len(out) < length:
        out.extend(hashlib.sha256(key + counter.to_bytes(8, "big")).digest())
        counter += 1
    return bytes(out[:length])


def _protect(records: Sequence[Mapping[str, str]], password: str) -> bytes:
    salt = os.urandom(16)
    key = _derive(password, salt)
    raw = json.dumps(list(records), sort_keys=True, separators=(",", ":")).encode("utf-8")
    cipher = bytes(left ^ right for left, right in zip(raw, _keystream(key, len(raw)), strict=True))
    mac = hmac.new(key, salt + cipher, hashlib.sha256).digest()
    return salt + mac + cipher


def _unprotect(blob: bytes, password: str) -> list[dict[str, str]]:
    salt, mac, cipher = blob[:16], blob[16:48], blob[48:]
    key = _derive(password, salt)
    expected = hmac.new(key, salt + cipher, hashlib.sha256).digest()
    if not hmac.compare_digest(mac, expected):
        raise SecretsError("synthetic export password did not match")
    raw = bytes(left ^ right for left, right in zip(cipher, _keystream(key, len(cipher)), strict=True))
    payload = json.loads(raw.decode("utf-8"))
    return list(payload)


def synthetic_export_import(
    records: Iterable[Mapping[str, str]],
    *,
    password: PasswordReader,
) -> list[dict[str, str]]:
    material = tuple(dict(record) for record in records)
    _assert_synthetic(material)
    secret = password()
    if not secret:
        raise SecretsError("synthetic drill password is required")
    imported = _unprotect(_protect(material, secret), secret)
    if imported != list(material):
        raise SecretsError("synthetic export/import records are not equal")
    return imported


def verify_name_completeness(present_names: Sequence[str]) -> tuple[str, ...]:
    expected = set(production_credential_names())
    present = set(present_names)
    missing = tuple(sorted(expected - present))
    if missing:
        raise SecretsError(f"vault completeness missing names: {missing}")
    extra = tuple(sorted(present - expected))
    return extra
