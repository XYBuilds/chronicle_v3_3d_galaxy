"""Operational R2 adapter for publication sequence and receipts."""
from __future__ import annotations

from typing import Any

from publication.errors import PublicationError

try:
    from cron.site_artifact_store import StoreError, create_r2_client, download_bytes, upload_bytes
except ModuleNotFoundError:  # pragma: no cover - direct script execution
    from site_artifact_store import StoreError, create_r2_client, download_bytes, upload_bytes  # type: ignore[no-redef]


class R2PublicationStore:
    def __init__(self, client: Any, bucket: str) -> None:
        self.client = client
        self.bucket = bucket

    @classmethod
    def from_env(cls) -> "R2PublicationStore":
        try:
            client, bucket = create_r2_client()
        except StoreError as exc:
            raise PublicationError(str(exc)) from exc
        return cls(client, bucket)

    def get(self, key: str) -> bytes | None:
        try:
            return download_bytes(self.client, bucket=self.bucket, key=key)
        except StoreError as exc:
            if "missing" in str(exc):
                return None
            raise PublicationError(str(exc)) from exc

    def put(self, key: str, body: bytes) -> None:
        try:
            upload_bytes(self.client, bucket=self.bucket, key=key, body=body)
        except StoreError as exc:
            raise PublicationError(str(exc)) from exc
