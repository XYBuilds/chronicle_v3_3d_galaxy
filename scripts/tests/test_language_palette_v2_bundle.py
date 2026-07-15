#!/usr/bin/env python3
"""Palette-v2 and canonical bundle parity regression coverage."""
from __future__ import annotations

import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from feature_engineering.language_encoding import main as encode_languages  # noqa: E402
from feature_engineering.language_palette import (  # noqa: E402
    FROZEN_LANG_CODES_V1,
    FROZEN_LANG_ORDER,
    FROZEN_LANG_ORDER_V1,
    FROZEN_LANG_ORDER_V2,
    LANG_PALETTE_VERSION,
)
from tools.pack_monthly_embedding_bundle import main as pack_bundle  # noqa: E402


class TestLanguagePaletteV2(unittest.TestCase):
    def test_v2_is_stable_v1_plus_rm(self) -> None:
        self.assertEqual(LANG_PALETTE_VERSION, "v2")
        self.assertEqual(FROZEN_LANG_ORDER, FROZEN_LANG_ORDER_V2)
        self.assertEqual(FROZEN_LANG_ORDER_V2, tuple(sorted((*FROZEN_LANG_ORDER_V1, "rm"))))
        self.assertNotIn("rm", FROZEN_LANG_CODES_V1)
        self.assertEqual(len(FROZEN_LANG_ORDER_V2), len(FROZEN_LANG_ORDER_V1) + 1)

    def test_active_encoding_uses_frozen_width_and_rm(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "cleaned.csv"
            output = root / "language_vectors.npy"
            meta = root / "language_encoding_meta.json"
            pd.DataFrame({"original_language": ["en", "rm"]}).to_csv(source, index=False)

            self.assertEqual(
                encode_languages(
                    [
                        "--input",
                        str(source),
                        "--output",
                        str(output),
                        "--meta-output",
                        str(meta),
                        "--palette",
                        "active",
                    ]
                ),
                0,
            )

            matrix = np.load(output)
            self.assertEqual(matrix.shape, (2, len(FROZEN_LANG_ORDER_V2)))
            self.assertTrue(np.allclose(np.linalg.norm(matrix, axis=1), 1.0))
            self.assertEqual(int(np.argmax(matrix[1])), FROZEN_LANG_ORDER_V2.index("rm"))

    def test_pack_rejects_stale_language_width(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            pd.DataFrame({"id": [1], "original_language": ["rm"]}).to_csv(root / "cleaned.csv", index=False)
            np.save(root / "text_embeddings.npy", np.ones((1, 384), dtype=np.float32) / np.sqrt(384))
            np.save(root / "genre_vectors.npy", np.ones((1, 1), dtype=np.float32))
            np.save(root / "language_vectors.npy", np.ones((1, len(FROZEN_LANG_ORDER_V1)), dtype=np.float32))

            with self.assertRaisesRegex(AssertionError, "language width"):
                pack_bundle(["--cache-dir", str(root), "--out", str(root / "bundle.zip")])

    def test_pack_writes_valid_v2_bundle(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            out = root / "bundle.zip"
            pd.DataFrame({"id": [1], "original_language": ["rm"]}).to_csv(root / "cleaned.csv", index=False)
            np.save(root / "text_embeddings.npy", np.ones((1, 384), dtype=np.float32) / np.sqrt(384))
            np.save(root / "genre_vectors.npy", np.ones((1, 1), dtype=np.float32))
            language = np.zeros((1, len(FROZEN_LANG_ORDER_V2)), dtype=np.float32)
            language[0, FROZEN_LANG_ORDER_V2.index("rm")] = 1.0
            np.save(root / "language_vectors.npy", language)

            self.assertEqual(pack_bundle(["--cache-dir", str(root), "--out", str(out)]), 0)
            with zipfile.ZipFile(out) as archive:
                self.assertEqual(
                    sorted(archive.namelist()),
                    ["cleaned.csv", "genre_vectors.npy", "language_vectors.npy", "text_embeddings.npy"],
                )


if __name__ == "__main__":
    unittest.main()