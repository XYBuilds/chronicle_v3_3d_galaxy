#!/usr/bin/env python3
"""Regression coverage for the bounded final-membership language audit."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import pandas as pd

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from tools import audit_final_membership_languages as audit  # noqa: E402


class TestFinalMembershipLanguageAudit(unittest.TestCase):
    def test_audit_keeps_samples_bounded_and_separates_memberships(self) -> None:
        pre = pd.DataFrame(
            {
                "id": [11, 12, 13],
                "genres": ["Action", "Action", "Action"],
                "original_language": ["en", "zz_audit_tail", "zz_audit_tail"],
            }
        )
        final = pre.loc[pre["id"] == 11].copy()
        thresholds = {2020: 42.0}

        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "snapshot.csv"
            source.write_text("unused\n", encoding="utf-8")
            with (
                patch.object(audit, "load_raw_csv", return_value=pd.DataFrame({"unused": []})),
                patch.object(audit, "run_cleaning_pipeline_before_vote_threshold", return_value=(pre, [], None)),
                patch.object(audit, "compute_year_to_vote_threshold", return_value=thresholds) as compute,
                patch.object(audit, "apply_frozen_vote_threshold", return_value=(final, object())) as apply,
                patch.object(audit, "_raw_fingerprint", return_value="fixturehash"),
            ):
                report = audit.run_audit(source, sample_size=1)

        self.assertEqual(report["raw_source"]["sha256prefix"], "fixturehash")
        self.assertEqual(report["pre_threshold"]["unknown_language_counts"], {"zz_audit_tail": 2})
        self.assertEqual(report["pre_threshold"]["unknown_language_samples"], {"zz_audit_tail": [12]})
        self.assertEqual(report["final_membership"]["unknown_language_counts"], {})
        self.assertEqual(report["threshold_year_min"], 2020)
        self.assertEqual(report["threshold_year_max"], 2020)
        compute.assert_called_once_with(
            pre,
            quantile=audit.QUANTILE,
            alpha=audit.ALPHA,
            abs_min=audit.ABS_MIN,
            rolling_window=audit.ROLLING_WINDOW,
        )
        apply.assert_called_once_with(pre, thresholds)

    def test_unknown_samples_rejects_non_positive_bound(self) -> None:
        frame = pd.DataFrame({"id": [1], "original_language": ["rm"]})
        with self.assertRaisesRegex(ValueError, "sample_size"):
            audit._unknown_language_samples(frame, ["rm"], sample_size=0)


if __name__ == "__main__":
    unittest.main()