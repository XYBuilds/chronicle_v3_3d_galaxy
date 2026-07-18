import {
  DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL,
  DEFAULT_GALAXY_U_SIZE_SCALE,
} from './galaxyUniformDefaults'

const PHI = (1 + Math.sqrt(5)) / 2

/** Shader-side max genre bands (weights + thresholds + colors). */
export const PLANET_MAX_BANDS = 8

/** P11.4 / P32 — Perlin sphere Lambert shading on by default. */
export const PERLIN_LIGHTING_ENABLED_DEFAULT = true

/**
 * Serializable visual SSOT shared by website focus and the headless exporter.
 * Keep vectors as tuples so the same object can be hashed into render metadata.
 */
export const PLANET_VISUAL_DEFAULTS = {
  schemaVersion: 2,
  geometry: {
    detail: 8,
  },
  activeShell: {
    sizeScale: DEFAULT_GALAXY_U_SIZE_SCALE,
    activeSizeMultiplier: DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL,
  },
  noise: {
    scale: 2.35,
    octaves: 4,
    persistence: 0.52,
  },
  bands: {
    max: PLANET_MAX_BANDS,
    areaRatio: 1 / PHI,
    thresholdPad: 2,
    stepHeight: 0.03,
    stepSmoothness: 0.01,
  },
  color: {
    lMax: 1,
    huntGamma: 0.3,
    huntApplyMask: 7,
  },
  /**
   * Focus-only appearance inputs. These are serializable now; 39.3 will make
   * the material consume them instead of the macro galaxy-colour snapshot.
   * Emission endpoints are candidates pending the 39.8 visual gate.
   */
  focus: {
    lightness: 0.55,
    chroma: 0.15,
    emissionIntensityMin: 0.06,
    emissionIntensityMax: 0.6,
  },
  galaxyColor: {
    lMin: 0.3,
    lMax: 1,
    highRatingT: 0.85,
    highTierTRangeScale: 0.4,
    lightnessRatingExponent: 3,
    chroma: 0.18,
  },
  lighting: {
    enabled: PERLIN_LIGHTING_ENABLED_DEFAULT,
    direction: [0.7, 0.7, -0.14] as const,
    keyLightIntensity: 1.0,
    flatShadingMix: 0.8,
  },
  material: {
    alpha: 0,
    alphaTest: 0.01,
    transparent: false,
    depthWrite: true,
    depthTest: true,
  },
} as const

export type PlanetVisualDefaults = typeof PLANET_VISUAL_DEFAULTS

/** Stable JSON input for CLI render metadata hashing. */
export function planetVisualConfigHashInput(): string {
  return JSON.stringify(PLANET_VISUAL_DEFAULTS)
}