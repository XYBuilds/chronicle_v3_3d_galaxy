"""Durable publication objects in the operational R2 boundary."""
from __future__ import annotations

from typing import Protocol

SEQUENCE_KEY = "ops/publication/sequence.json"


def receipt_key(sequence: int) -> str:
    return f"ops/publication/receipts/{int(sequence):d}.json"


class PublicationStore(Protocol):
    def get(self, key: str) -> bytes | None: ...

    def put(self, key: str, body: bytes) -> None: ...


class MemoryPublicationStore:
    """In-memory operational store for fixture tests."""

    def __init__(self, objects: dict[str, bytes] | None = None) -> None:
        self.objects = dict(objects or {})

    def get(self, key: str) -> bytes | None:
        return self.objects.get(key)

    def put(self, key: str, body: bytes) -> None:
        self.objects[key] = bytes(body)
