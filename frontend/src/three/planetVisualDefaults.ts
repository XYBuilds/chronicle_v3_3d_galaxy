import {
  DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL,
  DEFAULT_GALAXY_U_SIZE_SCALE,
} from './galaxyUniformDefaults.js'
import { stableFocusEmissionJson } from './focusEmission.js'
import { PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE } from './productionFocusEmissionProfile.js'

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
  schemaVersion: 10,
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
    /** Identifies the linear composition and single display conversion used by the Perlin fragment shader. */
    pipelineVersion: 'oklch-local-base-linear-emission-fixed-key-single-srgb-v1',
    lMax: 1,
    huntGamma: 0.3,
    huntApplyMask: 7,
  },
  /** Focus-only inputs; the vote-driven emission contract is independent of macro galaxy color. */
  focus: {
    lightness: 0.66,
    chroma: 0.15,
    /** Emission curve is supplied only by a verified active or explicit legacy profile at the consumer boundary. */
    /** Final rating-response shaping applied after the resolved emission profile. */
    emissionTuning: {
      exponent: 3,
      intensityMin: 0.005,
      intensityMax: 0.66,
    },
    bloom: {
      composition: 'pure-bloom-delta-v1',
      enabled: true,
      strength: 1,
      radius: 1,
      threshold: 10,
    },
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
    direction: [0.700665949127905, 0.4003805423588029, 0.5905612999792342] as const,
    keyLightIntensity: 10,
    flatShadingMix: 1,
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
export type ProductionPlanetBloomParams = Omit<typeof PLANET_VISUAL_DEFAULTS.focus.bloom, 'composition' | 'enabled'> & { enabled: boolean }

/** Resolves the production Bloom state without exposing a normal-request override channel. */
export function productionPlanetBloomParams(enabled: boolean = PLANET_VISUAL_DEFAULTS.focus.bloom.enabled): ProductionPlanetBloomParams {
  if (typeof enabled !== 'boolean') throw new Error('[PlanetVisualDefaults] bloom enabled must be boolean')
  return {
    enabled,
    strength: PLANET_VISUAL_DEFAULTS.focus.bloom.strength,
    radius: PLANET_VISUAL_DEFAULTS.focus.bloom.radius,
    threshold: PLANET_VISUAL_DEFAULTS.focus.bloom.threshold,
  }
}

/**
 * P39-only compatibility hash. It deliberately embeds the frozen profile actually rendered by
 * historical evidence and is forbidden from normal production/browser export paths.
 */
export function p3911LegacyFrozenProfileVisualConfigHashInput(bloomEnabled: boolean = PLANET_VISUAL_DEFAULTS.focus.bloom.enabled): string {
  if (typeof bloomEnabled !== 'boolean') throw new Error('[PlanetVisualDefaults] bloom enabled must be boolean')
  return stableFocusEmissionJson({
    legacyCompatibility: 'p39.11-frozen-profile-fixture',
    visual: {
      ...PLANET_VISUAL_DEFAULTS,
      focus: {
        ...PLANET_VISUAL_DEFAULTS.focus,
        emission: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
        bloom: {
          ...PLANET_VISUAL_DEFAULTS.focus.bloom,
          ...productionPlanetBloomParams(bloomEnabled),
        },
      },
    },
  })
}