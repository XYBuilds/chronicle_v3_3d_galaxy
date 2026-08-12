import type { ArgTypes } from '@storybook/react-vite'

import { SUBSAMPLE_GALAXY_META, SUBSAMPLE_LAB_MOVIES } from '@/storybook/fixtures/subsampleMovies'
import { GALAXY_Z_VIS_WINDOW_DEFAULT, GALAXY_ZCAM_DISTANCE_DEFAULT } from '@/three/camera'
import { CONSTELLATION_CHAIN_DEFAULT_OPACITY } from '@/three/constellation'
import { DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL, DEFAULT_GALAXY_U_BG_SIZE_MUL, DEFAULT_GALAXY_U_SIZE_SCALE } from '@/three/galaxyUniformDefaults'
import { IDLE_NEAR_FADE_DEFAULTS } from '@/three/idleNearFade'
import { IDLE_Z_FADE_DEFAULTS } from '@/three/idleZFade'
import { PERLIN_BLOOM_DEFAULTS } from '@/three/perlinBloomContract'
import { PLANET_VISUAL_DEFAULTS } from '@/three/planetVisualDefaults'
import { COSMOS_UNIVERSE_BG_DEFAULT } from '@/three/universeBackground'

import type { VisualGateSessionKind } from '@/storybook/visualGateSessions'

export type VisualGateProps = {
  sessionKind: VisualGateSessionKind
  focusMovieId: number | null
  zCurrent: number
  zVisWindow: number
  uZCamDistance: number
  universeBgHex: string
  uSizeScale: number
  uBgSizeMul: number
  idleNearFadeEnabled: boolean
  idleNearFadeStartDist: number
  idleNearFadeWidth: number
  idleNearFadeMinAlpha: number
  idleZFadeMode: number
  idleZFadeOutsideAlpha: number
  uActiveSizeMul: number
  uLMin: number
  uLMax: number
  uChroma: number
  uHighRatingT: number
  uHighTierTRangeScale: number
  uLightnessRatingExponent: number
  uDistanceLightnessFloor: number
  uHuntGamma: number
  uHuntApplyMask: number
  uFocusDimChroma: number
  uFocusDimL: number
  uFocusDimMode: number
  focusNonTargetActiveAlpha: number
  focusHoveredActiveAlpha: number
  focusNeighborRadius: number
  planetUScale: number
  planetOctaves: number
  planetPersistence: number
  planetAreaRatio: number
  planetStepHeight: number
  planetStepSmoothness: number
  planetLightness: number
  planetChroma: number
  lightingEnabled: boolean
  lightDirX: number
  lightDirY: number
  lightDirZ: number
  keyLightIntensity: number
  flatShadingMix: number
  perlinBloomEnabled: boolean
  perlinBloomStrength: number
  perlinBloomRadius: number
  perlinBloomThreshold: number
  postProcessBloom: boolean
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number
  constellationEnabled: boolean
  constellationChainOpacity: number
}

const Z_LO = SUBSAMPLE_GALAXY_META.z_range[0]!
const Z_HI = SUBSAMPLE_GALAXY_META.z_range[1]!
const LIGHT = PLANET_VISUAL_DEFAULTS.lighting.direction

function cat(category: string): { table: { category: string } } {
  return { table: { category } }
}

export const visualGateArgTypes = {
  sessionKind: {
    ...cat('Session'),
    control: 'radio',
    options: ['idle', 'person', 'genre'] satisfies VisualGateSessionKind[],
  },
  focusMovieId: {
    ...cat('Session'),
    control: 'select',
    options: [null, ...SUBSAMPLE_LAB_MOVIES.map((m) => m.id)],
  },
  zCurrent: {
    ...cat('Camera / Z slab'),
    control: { type: 'range', min: Z_LO, max: Z_HI, step: 0.02 },
  },
  zVisWindow: {
    ...cat('Camera / Z slab'),
    control: { type: 'range', min: 0.05, max: 40, step: 0.05 },
  },
  uZCamDistance: {
    ...cat('Camera / Z slab'),
    control: { type: 'range', min: 2, max: 80, step: 0.5 },
  },
  universeBgHex: {
    ...cat('Universe'),
    control: 'color',
  },
  uSizeScale: {
    ...cat('Idle mesh'),
    control: { type: 'range', min: 0.05, max: 1.2, step: 0.01 },
  },
  uBgSizeMul: {
    ...cat('Idle mesh'),
    control: { type: 'range', min: 0.0001, max: 1.5, step: 0.0001 },
  },
  idleNearFadeEnabled: {
    ...cat('Idle mesh'),
    control: 'boolean',
  },
  idleNearFadeStartDist: {
    ...cat('Idle mesh'),
    control: { type: 'range', min: 0.5, max: 80, step: 0.5 },
  },
  idleNearFadeWidth: {
    ...cat('Idle mesh'),
    control: { type: 'range', min: 0.5, max: 40, step: 0.5 },
  },
  idleNearFadeMinAlpha: {
    ...cat('Idle mesh'),
    control: { type: 'range', min: 0, max: 1, step: 0.01 },
  },
  idleZFadeMode: {
    ...cat('Idle mesh'),
    control: 'inline-radio',
    options: [-1, 0, 1],
  },
  idleZFadeOutsideAlpha: {
    ...cat('Idle mesh'),
    control: { type: 'range', min: 0, max: 1, step: 0.01 },
  },
  uActiveSizeMul: {
    ...cat('Active mesh'),
    control: { type: 'range', min: 0.001, max: 2, step: 0.001 },
  },
  uLMin: {
    ...cat('Macro color'),
    control: { type: 'range', min: 0.05, max: 0.6, step: 0.01 },
  },
  uLMax: {
    ...cat('Macro color'),
    control: { type: 'range', min: 0.4, max: 1, step: 0.01 },
  },
  uChroma: {
    ...cat('Macro color'),
    control: { type: 'range', min: 0.02, max: 0.35, step: 0.01 },
  },
  uHighRatingT: {
    ...cat('Macro color'),
    control: { type: 'range', min: 0.5, max: 0.98, step: 0.01 },
  },
  uHighTierTRangeScale: {
    ...cat('Macro color'),
    control: { type: 'range', min: 0.05, max: 1, step: 0.01 },
  },
  uLightnessRatingExponent: {
    ...cat('Macro color'),
    control: { type: 'range', min: 0.5, max: 6, step: 0.05 },
  },
  uDistanceLightnessFloor: {
    ...cat('Macro color'),
    control: { type: 'range', min: 0.02, max: 1, step: 0.01 },
  },
  uHuntGamma: {
    ...cat('Macro color'),
    control: { type: 'range', min: 0, max: 3, step: 0.01 },
  },
  uHuntApplyMask: {
    ...cat('Macro color'),
    control: { type: 'range', min: 0, max: 7, step: 1 },
  },
  uFocusDimChroma: {
    ...cat('Focus dim / neighborhood'),
    control: { type: 'range', min: 0, max: 1.5, step: 0.02 },
  },
  uFocusDimL: {
    ...cat('Focus dim / neighborhood'),
    control: { type: 'range', min: 0.05, max: 1.5, step: 0.02 },
  },
  uFocusDimMode: {
    ...cat('Focus dim / neighborhood'),
    control: { type: 'range', min: 0, max: 1, step: 1 },
  },
  focusNonTargetActiveAlpha: {
    ...cat('Focus dim / neighborhood'),
    control: { type: 'range', min: 0.02, max: 1, step: 0.01 },
  },
  focusHoveredActiveAlpha: {
    ...cat('Focus dim / neighborhood'),
    control: { type: 'range', min: 0.02, max: 1, step: 0.01 },
  },
  focusNeighborRadius: {
    ...cat('Focus dim / neighborhood'),
    control: { type: 'range', min: 0.5, max: 40, step: 0.5 },
  },
  planetUScale: {
    ...cat('Perlin planet'),
    control: { type: 'range', min: 0.5, max: 6, step: 0.05 },
  },
  planetOctaves: {
    ...cat('Perlin planet'),
    control: { type: 'range', min: 1, max: 8, step: 1 },
  },
  planetPersistence: {
    ...cat('Perlin planet'),
    control: { type: 'range', min: 0.1, max: 1, step: 0.01 },
  },
  planetAreaRatio: {
    ...cat('Perlin planet'),
    control: { type: 'range', min: 0.15, max: 1.2, step: 0.005 },
  },
  planetStepHeight: {
    ...cat('Perlin planet'),
    control: { type: 'range', min: 0, max: 0.12, step: 0.001 },
  },
  planetStepSmoothness: {
    ...cat('Perlin planet'),
    control: { type: 'range', min: 0, max: 0.08, step: 0.001 },
  },
  planetLightness: {
    ...cat('Perlin planet'),
    control: { type: 'range', min: 0.2, max: 1, step: 0.01 },
  },
  planetChroma: {
    ...cat('Perlin planet'),
    control: { type: 'range', min: 0.02, max: 0.4, step: 0.005 },
  },
  lightingEnabled: {
    ...cat('Lighting'),
    control: 'boolean',
  },
  lightDirX: {
    ...cat('Lighting'),
    control: { type: 'range', min: -1, max: 1, step: 0.01 },
  },
  lightDirY: {
    ...cat('Lighting'),
    control: { type: 'range', min: -1, max: 1, step: 0.01 },
  },
  lightDirZ: {
    ...cat('Lighting'),
    control: { type: 'range', min: -1, max: 1, step: 0.01 },
  },
  keyLightIntensity: {
    ...cat('Lighting'),
    control: { type: 'range', min: 0, max: 20, step: 0.1 },
  },
  flatShadingMix: {
    ...cat('Lighting'),
    control: { type: 'range', min: 0, max: 1, step: 0.01 },
  },
  perlinBloomEnabled: {
    ...cat('Bloom'),
    control: 'boolean',
  },
  perlinBloomStrength: {
    ...cat('Bloom'),
    control: { type: 'range', min: 0, max: 2.5, step: 0.02 },
  },
  perlinBloomRadius: {
    ...cat('Bloom'),
    control: { type: 'range', min: 0, max: 1, step: 0.01 },
  },
  perlinBloomThreshold: {
    ...cat('Bloom'),
    control: { type: 'range', min: 0, max: 12, step: 0.05 },
  },
  postProcessBloom: {
    ...cat('Bloom'),
    control: 'boolean',
  },
  bloomStrength: {
    ...cat('Bloom'),
    control: { type: 'range', min: 0, max: 2.5, step: 0.02 },
  },
  bloomRadius: {
    ...cat('Bloom'),
    control: { type: 'range', min: 0, max: 1.5, step: 0.01 },
  },
  bloomThreshold: {
    ...cat('Bloom'),
    control: { type: 'range', min: 0, max: 1, step: 0.01 },
  },
  constellationEnabled: {
    ...cat('Constellation'),
    control: 'boolean',
  },
  constellationChainOpacity: {
    ...cat('Constellation'),
    control: { type: 'range', min: 0.005, max: 1, step: 0.005 },
  },
} satisfies ArgTypes<VisualGateProps>

export const visualGateDefaultArgs: VisualGateProps = {
  sessionKind: 'idle',
  focusMovieId: null,
  zCurrent: SUBSAMPLE_GALAXY_META.z_range[0]!,
  zVisWindow: GALAXY_Z_VIS_WINDOW_DEFAULT,
  uZCamDistance: GALAXY_ZCAM_DISTANCE_DEFAULT,
  universeBgHex: COSMOS_UNIVERSE_BG_DEFAULT,
  uSizeScale: DEFAULT_GALAXY_U_SIZE_SCALE,
  uBgSizeMul: DEFAULT_GALAXY_U_BG_SIZE_MUL,
  idleNearFadeEnabled: IDLE_NEAR_FADE_DEFAULTS.enabled > 0.5,
  idleNearFadeStartDist: IDLE_NEAR_FADE_DEFAULTS.startDist,
  idleNearFadeWidth: IDLE_NEAR_FADE_DEFAULTS.width,
  idleNearFadeMinAlpha: IDLE_NEAR_FADE_DEFAULTS.minAlpha,
  idleZFadeMode: IDLE_Z_FADE_DEFAULTS.mode,
  idleZFadeOutsideAlpha: IDLE_Z_FADE_DEFAULTS.outsideAlpha,
  uActiveSizeMul: DEFAULT_GALAXY_U_ACTIVE_SIZE_MUL,
  uLMin: PLANET_VISUAL_DEFAULTS.galaxyColor.lMin,
  uLMax: PLANET_VISUAL_DEFAULTS.galaxyColor.lMax,
  uChroma: PLANET_VISUAL_DEFAULTS.galaxyColor.chroma,
  uHighRatingT: PLANET_VISUAL_DEFAULTS.galaxyColor.highRatingT,
  uHighTierTRangeScale: PLANET_VISUAL_DEFAULTS.galaxyColor.highTierTRangeScale,
  uLightnessRatingExponent: PLANET_VISUAL_DEFAULTS.galaxyColor.lightnessRatingExponent,
  uDistanceLightnessFloor: 0.5,
  uHuntGamma: PLANET_VISUAL_DEFAULTS.color.huntGamma,
  uHuntApplyMask: PLANET_VISUAL_DEFAULTS.color.huntApplyMask,
  uFocusDimChroma: 1,
  uFocusDimL: 1,
  uFocusDimMode: 0,
  focusNonTargetActiveAlpha: 0.08,
  focusHoveredActiveAlpha: 0.4,
  focusNeighborRadius: 5,
  planetUScale: PLANET_VISUAL_DEFAULTS.noise.scale,
  planetOctaves: PLANET_VISUAL_DEFAULTS.noise.octaves,
  planetPersistence: PLANET_VISUAL_DEFAULTS.noise.persistence,
  planetAreaRatio: PLANET_VISUAL_DEFAULTS.bands.areaRatio,
  planetStepHeight: PLANET_VISUAL_DEFAULTS.bands.stepHeight,
  planetStepSmoothness: PLANET_VISUAL_DEFAULTS.bands.stepSmoothness,
  planetLightness: PLANET_VISUAL_DEFAULTS.focus.lightness,
  planetChroma: PLANET_VISUAL_DEFAULTS.focus.chroma,
  lightingEnabled: PLANET_VISUAL_DEFAULTS.lighting.enabled,
  lightDirX: LIGHT[0],
  lightDirY: LIGHT[1],
  lightDirZ: LIGHT[2],
  keyLightIntensity: PLANET_VISUAL_DEFAULTS.lighting.keyLightIntensity,
  flatShadingMix: PLANET_VISUAL_DEFAULTS.lighting.flatShadingMix,
  perlinBloomEnabled: PERLIN_BLOOM_DEFAULTS.enabled,
  perlinBloomStrength: PERLIN_BLOOM_DEFAULTS.strength,
  perlinBloomRadius: PERLIN_BLOOM_DEFAULTS.radius,
  perlinBloomThreshold: PERLIN_BLOOM_DEFAULTS.threshold,
  postProcessBloom: false,
  bloomStrength: 0.95,
  bloomRadius: 0.52,
  bloomThreshold: 0.82,
  constellationEnabled: true,
  constellationChainOpacity: CONSTELLATION_CHAIN_DEFAULT_OPACITY,
}
