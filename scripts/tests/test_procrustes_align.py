#!/usr/bin/env python3
"""P18.3: ``align_to_reference`` — exact recovery under similarity noise + partial-anchor coverage."""
from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

import numpy as np

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from feature_engineering.procrustes_align import align_to_reference  # noqa: E402


def _rmse(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.sqrt(np.mean((a - b) ** 2)))


class TestAlignToReference(unittest.TestCase):
    def test_recover_after_similarity_transform(self) -> None:
        rng = np.random.default_rng(7)
        n = 1000
        ref = rng.standard_normal((n, 2))
        theta = math.radians(30.0)
        r_true = np.array(
            [[math.cos(theta), -math.sin(theta)], [math.sin(theta), math.cos(theta)]],
            dtype=np.float64,
        )
        reflect = np.diag([1.0, -1.0])
        r_true = r_true @ reflect
        s_true = 1.5
        t = np.array([3.0, -2.0], dtype=np.float64)
        new_xy = ref @ r_true * s_true + t
        ids = np.arange(n, dtype=np.int64)
        ref_by_id = {int(ids[i]): (float(ref[i, 0]), float(ref[i, 1])) for i in range(n)}

        aligned = align_to_reference(new_xy, ids, ref_by_id)
        self.assertEqual(aligned.shape, (n, 2))
        err = _rmse(aligned.astype(np.float64), ref)
        self.assertLess(err, 1e-6, f"RMSE vs reference should be <1e-6, got {err}")

    def test_noisy_smaller_than_naive(self) -> None:
        rng = np.random.default_rng(11)
        n = 1000
        ref = rng.standard_normal((n, 2))
        theta = math.radians(12.0)
        r_true = np.array(
            [[math.cos(theta), -math.sin(theta)], [math.sin(theta), math.cos(theta)]],
            dtype=np.float64,
        )
        s_true = 0.8
        t = np.array([-1.0, 2.5], dtype=np.float64)
        new_xy = ref @ r_true * s_true + t
        noise = rng.standard_normal((n, 2)) * 0.05 * float(np.std(new_xy))
        noisy = new_xy + noise
        ids = np.arange(n, dtype=np.int64)
        ref_by_id = {int(ids[i]): (float(ref[i, 0]), float(ref[i, 1])) for i in range(n)}

        aligned = align_to_reference(noisy, ids, ref_by_id)
        rmse_align = _rmse(aligned.astype(np.float64), ref)
        rmse_naive = _rmse(noisy, ref)
        self.assertLess(
            rmse_align,
            rmse_naive,
            "Procrustes should pull noisy similarity-warped points much closer to reference than row-wise naive diff",
        )
        self.assertLess(rmse_align, 0.2, "post-align RMSE should stay small under modest relative noise")

    def test_partial_anchors_aligns_unseen_ids(self) -> None:
        rng = np.random.default_rng(3)
        n_ref = 800
        n_extra = 200
        ref_pts = rng.standard_normal((n_ref, 2))
        theta = math.radians(45.0)
        r_true = np.array(
            [[math.cos(theta), -math.sin(theta)], [math.sin(theta), math.cos(theta)]],
            dtype=np.float64,
        )
        s_true = 2.0
        t = np.array([1.0, 1.0], dtype=np.float64)
        new_ref_block = ref_pts @ r_true * s_true + t
        extra = rng.standard_normal((n_extra, 2)) @ r_true * s_true + t
        new_xy = np.vstack([new_ref_block, extra])
        ids = np.concatenate([np.arange(n_ref, dtype=np.int64), np.arange(10_000, 10_000 + n_extra)])
        ref_by_id = {i: (float(ref_pts[i, 0]), float(ref_pts[i, 1])) for i in range(n_ref)}

        aligned = align_to_reference(new_xy, ids, ref_by_id)
        self.assertLess(_rmse(aligned[:n_ref].astype(np.float64), ref_pts), 1e-5)
        # Extra ids share the same global similarity map; they stay internally consistent
        self.assertTrue(np.isfinite(aligned[n_ref:]).all())

    def test_raises_without_two_anchors(self) -> None:
        xy = np.zeros((3, 2), dtype=np.float64)
        ids = np.array([1, 2, 3], dtype=np.int64)
        ref = {99: (0.0, 0.0), 100: (1.0, 0.0)}
        with self.assertRaises(ValueError):
            align_to_reference(xy, ids, ref)


if __name__ == "__main__":
    unittest.main()
