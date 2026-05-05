"""P18.3 — Procrustes alignment of UMAP (x, y) to frozen v1 reference by movie id.

Uses a similarity transform (uniform scale + orthogonal + translation) fitted on the
subset of rows whose ids appear in ``ref_xy_by_id``. The same transform is applied to
all rows of ``new_xy`` (including ids without a reference anchor).

``scipy.linalg.orthogonal_procrustes`` returns a ``scale`` field that is *not* the
uniform similarity scale; optimal scalar ``c`` is computed in closed form after ``R``.
"""
from __future__ import annotations

import numpy as np
from scipy.linalg import orthogonal_procrustes


def align_to_reference(
    new_xy: np.ndarray,
    new_ids: np.ndarray,
    ref_xy_by_id: dict[int, tuple[float, float]],
) -> np.ndarray:
    """
    Fit the best similarity map (rotation/reflection + uniform scale + translation) from
    ``new_xy`` to reference (x, y) using only rows whose id exists in ``ref_xy_by_id``,
    then apply that map to every row of ``new_xy``.

    Parameters
    ----------
    new_xy
        Shape (N, 2), UMAP ``fit_transform`` output (same row order as ``new_ids``).
    new_ids
        Shape (N,), TMDB movie ids (int-like).
    ref_xy_by_id
        v1 reference (x, y) per movie id (typically loaded from ``galaxy_v1_reference``).

    Returns
    -------
    np.ndarray
        Shape (N, 2), float32, coordinates in the reference frame.
    """
    xy = np.asarray(new_xy, dtype=np.float64)
    ids = np.asarray(new_ids)
    if xy.ndim != 2 or xy.shape[1] != 2:
        raise ValueError(f"new_xy must be (N, 2), got {xy.shape}")
    if ids.shape != (xy.shape[0],):
        raise ValueError(f"new_ids must shape ({xy.shape[0]},), got {ids.shape}")

    common_mask = np.fromiter(
        (int(np.asarray(mid).item()) in ref_xy_by_id for mid in ids),
        dtype=bool,
        count=len(ids),
    )
    n_common = int(np.sum(common_mask))
    if n_common < 2:
        raise ValueError(
            f"need at least 2 ids present in ref_xy_by_id for Procrustes, got {n_common}"
        )

    idx = np.nonzero(common_mask)[0]
    A = xy[idx]
    B = np.array(
        [ref_xy_by_id[int(np.asarray(ids[i]).item())] for i in idx],
        dtype=np.float64,
    )
    assert A.shape == B.shape == (n_common, 2), (A.shape, B.shape)

    a_mean = A.mean(axis=0)
    b_mean = B.mean(axis=0)
    a_c = A - a_mean
    b_c = B - b_mean

    r_mat, _sv_sum = orthogonal_procrustes(a_c, b_c)
    # X = a_c @ R minimizes ||X - b_c||_F over orthogonal R; optimal uniform c for fixed R:
    # minimize ||c * X - b_c||_F  =>  c = <X, b_c>_F / ||X||_F^2
    x_rot = a_c @ r_mat
    denom = float(np.sum(x_rot * x_rot))
    assert denom > 1e-30, "degenerate anchor spread (zero Frobenius norm after rotation)"
    c_scale = float(np.sum(x_rot * b_c) / denom)

    aligned = c_scale * (xy - a_mean) @ r_mat + b_mean
    assert aligned.shape == xy.shape
    assert np.isfinite(aligned).all(), "non-finite coordinates after Procrustes align"
    return aligned.astype(np.float32)
