import * as THREE from 'three'

import type { Meta, Movie } from '@/types/galaxy'
import { genreHueForGenreName, hueFromGenreColor, primaryGenreHueRad } from '@/utils/genreHue'

import {
  focusEmissionIntensityFromProfile,
  type FocusEmissionProfile,
} from './focusEmission'
import { PLANET_MAX_BANDS, PLANET_VISUAL_DEFAULTS } from './planetVisualDefaults'
import { selectionPlanetBaseQuaternion } from './selectionPlanetRotation'

const PHI = (1 + Math.sqrt(5)) / 2

export interface PlanetAppearance {
  genres: string[]
  hues: number[]
  lightness: number
  chroma: number
  emissionIntensity: number
  emissionProfile: FocusEmissionProfile
  emissionCurve: FocusEmissionProfile
  keyLightIntensity: number
  bandCount: number
  cutCount: number
  baseQuaternion: THREE.Quaternion
}

/** xmur3 string hash → deterministic 32-bit seed. */
export function planetNoiseSeed(movieId: number): number {
  const str = String(movieId)
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  h ^= h >>> 16
  return h >>> 0
}

/** Mulberry32 PRNG in [0, 1), shared by deterministic CPU noise generation. */
export function createPlanetRandom(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Genre display order with golden-ratio decay weights. */
export function planetGenreDisplayWeights(
  genres: string[],
  maxSlots = PLANET_MAX_BANDS,
): { genres: string[]; weights: number[] } {
  const list = genres.filter(Boolean).slice(0, maxSlots)
  if (list.length === 0) return { genres: ['Unknown'], weights: [1] }

  const raw = list.map((_, index) => Math.pow(1 / PHI, index))
  const sum = raw.reduce((acc, weight) => acc + weight, 0)
  return { genres: list, weights: raw.map((weight) => weight / sum) }
}

export function resolvePlanetAppearance(
  movie: Movie,
  palette: Meta['genre_palette'],
  emissionProfile: FocusEmissionProfile,
): PlanetAppearance {
  const { genres } = planetGenreDisplayWeights(movie.genres)
  const fallbackHue =
    movie.genre_hue ??
    hueFromGenreColor([movie.genre_color[0], movie.genre_color[1], movie.genre_color[2]])
  const primaryHue = primaryGenreHueRad(movie, palette)
  const primaryGenreName = movie.genres.find(Boolean) ?? ''
  const hues = genres.map((genre) =>
    genre === primaryGenreName ? primaryHue : genreHueForGenreName(genre, palette, fallbackHue),
  )
  const { focus } = PLANET_VISUAL_DEFAULTS

  return {
    genres,
    hues,
    lightness: focus.lightness,
    chroma: focus.chroma,
    emissionIntensity: focusEmissionIntensityFromProfile(movie.vote_average, emissionProfile),
    emissionProfile,
    emissionCurve: emissionProfile,
    keyLightIntensity: PLANET_VISUAL_DEFAULTS.lighting.keyLightIntensity,
    bandCount: genres.length,
    cutCount: Math.max(0, genres.length - 1),
    baseQuaternion: selectionPlanetBaseQuaternion(movie.id),
  }
}