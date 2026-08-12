#!/usr/bin/env python3
"""HEAD pointer for pruned Phase 41 run artifacts (#384)."""
from __future__ import annotations

import subprocess
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_INDEX = _ROOT / "data" / "runs" / "phase41" / "README.md"
_LAST_RAW_COMMIT = "44acdba30b8ae468535712021a7e93b0f073ae1f"
_RAW_DIRECTORIES = (
    "data/runs/phase41/p41.4-fixed-shaping-direction-v4-backlight-semantic-fixtures",
    "data/runs/phase41/p41.4-fixed-shaping-key-v5-backlight-lightness-066-semantic-fixtures",
    "data/runs/phase41/p41.4-fixed-shaping-lightness-v5-backlight-lightness-066-semantic-fixtures",
    "data/runs/phase41/p41.5-emission-curve-bloom-off",
)
_REPRODUCTION_COMMANDS = (
    "npm run evidence:p41.4 -- --checkpoint direction --approve backlight-east-v1",
    "npm run evidence:p41.4 -- --checkpoint lightness --direction backlight-east-v1 --approve lightness-0.66",
    "npm run evidence:p41.4 -- --checkpoint key --direction backlight-east-v1 --lightness lightness-0.66 --approve key-0.45",
    "npm run evidence:p41.5",
)
_REPRESENTATIVE_HASHES = (
    "c36e08e4ff977c90487c48295f5cb672aee708ae1f0d6824a8491a1870e96662",
    "e6e6967c703eadb0f7ae87139a51a4f4c7b80494f48e36f19469634ee63329c7",
    "21c674f28a0f84cc4ac3f68d0447e6847ff2fb2a53feaed33135848a373fa415",
    "9285f3fc54a6f9c8b2540d2d5ac70c76878454aced867d84ea958a2a8b4e7d1e",
    "0fb7a736b5262df9dab365b5d32413085bf115857ebe76d87fabfa9ef701ddc2",
    "2bca0523e402a7643c354a0a9386f81ce511a5ebcb9cc90278bf9e7dfa174ebf",
    "27d381207e69a32de2b93cd6baa77f0226afbc7220fce461c0e4bfef67e38a6a",
    "86bec18bb293ddf69d9d7387b176ecfa82ff80f5d80cea0e858a6bc1f22effb9",
)
_REPORTS = (
    "Phase 41.4 Focus 固定造型 Gate 实施报告.md",
    "Phase41.5-41.5.1-baseline-and-boundary-report.md",
    "Phase41.5-p41.5.4-bloom-off-evidence-report.md",
)


def _git_ls_files(*paths: str) -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "-z", "--", *paths],
        cwd=_ROOT,
        check=True,
        capture_output=True,
    )
    if not result.stdout:
        return []
    return [path.decode("utf-8") for path in result.stdout.split(b"\0") if path]


class TestPhase41EvidenceIndex(unittest.TestCase):
    def test_index_is_a_compact_non_authoritative_reproduction_pointer(self) -> None:
        self.assertTrue(_INDEX.is_file(), "missing data/runs/phase41/README.md evidence index")
        text = _INDEX.read_text(encoding="utf-8")
        self.assertIn("non-authoritative", text.lower())
        self.assertIn(_LAST_RAW_COMMIT, text)
        self.assertIn("Playwright 1.52.0", text)
        self.assertIn("136.0.7103.25", text)
        self.assertIn("1416710939", text)
        self.assertIn("63871841", text)
        self.assertIn("eb15d597479f4f46792c440ae6478ddade9ba1bd95cc623d0dd135e680c60cad", text)
        self.assertIn("2026.07.18.daily.113", text)
        for directory in _RAW_DIRECTORIES:
            self.assertIn(directory, text)
        for command in _REPRODUCTION_COMMANDS:
            self.assertIn(command, text)
        for digest in _REPRESENTATIVE_HASHES:
            self.assertIn(digest, text)
        for report in _REPORTS:
            self.assertIn(report, text)

    def test_raw_run_directories_are_not_tracked_and_index_is(self) -> None:
        self.assertEqual(
            _git_ls_files(*_RAW_DIRECTORIES),
            [],
            "Phase 41 raw run directories must not remain in HEAD",
        )
        tracked_index = _git_ls_files("data/runs/phase41/README.md")
        self.assertEqual(tracked_index, ["data/runs/phase41/README.md"])


if __name__ == "__main__":
    unittest.main()
