"""P18.3 — Application-side guardrails for immutable ``galaxy_v1_reference``.

Database ``REVOKE`` (see ``supabase/migrations/*p18_3*``) blocks UPDATE/DELETE for ``service_role``.
Callers that build generic Supabase payloads should assert before issuing writes.

This module lives at ``scripts/galaxy_v1_reference_guard.py`` (not under ``scripts/supabase/``) so
``from supabase import create_client`` continues to resolve to the PyPI client.
"""
from __future__ import annotations


def assert_not_v1_reference_mutation(table: str, *, is_insert: bool) -> None:
    """Fail fast if code attempts to UPDATE/DELETE/TRUNCATE the v1 anchor via the REST client."""
    t = (table or "").strip().lower()
    if t != "galaxy_v1_reference":
        return
    if is_insert:
        return
    raise AssertionError(
        "galaxy_v1_reference is immutable after P18.2 bootstrap: "
        "do not UPDATE/DELETE/TRUNCATE via application scripts; use an owner migration for reset."
    )
