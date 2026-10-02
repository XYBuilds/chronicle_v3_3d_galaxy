"""Canonical four-file embedding bundle hash authority."""
from __future__ import annotations

import re
from typing import Any, Mapping

from publication.errors import PublicationError

SCHEMA = "chronicle-canonical-embedding-bundle-v1"
REQUIRED_FILES = (
    "cleaned.csv",
    "text_embeddings.npy",
    "genre_vectors.npy",
    "language_vectors.npy",
)
_SHA256 = re.compile(r"^[a-f0-9]{64}$")


def require_recorded_hash(record: Mapping[str, Any]) -> str:
    if record.get("schema") != SCHEMA:
        raise PublicationError("canonical embedding bundle schema is required")
    names = tuple(record.get("filenames") or ())
    if names != REQUIRED_FILES:
        raise PublicationError("canonical embedding bundle must record the four required files")
    if not record.get("r2_object"):
        raise PublicationError("canonical embedding bundle R2 object is required")
    if record.get("macbook_snapshot") is not True:
        raise PublicationError("canonical embedding bundle MacBook snapshot evidence is required")
    digest = record.get("sha256")
    if not isinstance(digest, str) or _SHA256.fullmatch(digest) is None:
        raise PublicationError("canonical embedding bundle SHA-256 is missing")
    return digest


def verify_bundle_hash(*, digest: str, recorded: str) -> None:
    if digest != recorded:
        raise PublicationError("canonical embedding bundle hash mismatch")
