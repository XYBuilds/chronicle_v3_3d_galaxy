/**
 * P22.1 — Idle/active instanced stars with |cameraWorldZ − star.z| below this (world years) are not drawn.
 * Focused instance (`uFocusedInstanceId`) is exempt in the vertex shader; `selectedMovieId` is exempt in CPU pick.
 */
export const NEAR_CULL_WORLD_Z = 0.5
