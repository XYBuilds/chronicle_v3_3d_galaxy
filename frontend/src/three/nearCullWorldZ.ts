/**
 * P22.1 — Idle/active instanced stars with |cameraWorldZ − star.z| **strictly below** this (world years) are not drawn.
 * Focused instance (`uFocusedInstanceId`) is exempt in the vertex shader; `selectedMovieId` is exempt in CPU pick.
 *
 * **Disabled:** `0` — condition `dz < 0` never holds for `abs(dz)`, so shader + picking paths stay inert. Set to e.g. `0.5` to re-enable.
 */
export const NEAR_CULL_WORLD_Z = 0
