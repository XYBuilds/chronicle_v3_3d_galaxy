/**
 * Default values for galaxy dual-mesh scale uniforms (`galaxyMeshes` shared bag).
 * Kept shader-free so specs (e.g. `galaxyVoteSize.spec.ts`) can import without GLSL bundling.
 */
export const DEFAULT_GALAXY_U_SIZE_SCALE = 0.3

/** P22.2 — `uActiveSizeMul`; ~0.65× legacy `0.02` for smaller focus active spheres (matches `galaxyActive.vert` `sActive`). */
export const DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL = 0.013
