/**
 * Default values for galaxy dual-mesh scale uniforms (`galaxyMeshes` shared bag).
 * Kept shader-free so specs can import without GLSL bundling.
 */
export const DEFAULT_GALAXY_U_SIZE_SCALE = 0.5

/** P22.2 — `uActiveSizeMul`; **0.5×** legacy `0.02` for smaller focus active spheres (matches `galaxyActive.vert` `sActive`). */
export const DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL = 0.012

/** Idle / background slab size multiplier (`uBgSizeMul`). Production mount default in `galaxyMeshes`. */
export const DEFAULT_GALAXY_U_BG_SIZE_MUL = 0.002
