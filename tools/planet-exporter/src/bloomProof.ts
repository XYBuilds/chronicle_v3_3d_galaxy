export type RgbaImage = {
  data: Uint8Array
  width: number
  height: number
}

export type CoreBloomStats = {
  core_alpha_min: number
  core_pixels: number
  off_mean_luma: number
  on_mean_luma: number
  on_to_off_mean_luma_ratio: number
  positive_luma_pixels: number
  positive_luma_fraction: number
  mean_positive_luma_delta: number
}

export const BLOOM_CORE_PROOF = {
  alphaMin: 250,
  maxOnToOffMeanLumaRatio: 1.25,
  minPositiveCoreLumaFraction: 0.001,
  minMeanPositiveCoreLumaDelta: 0.01,
} as const

function luma(data: Uint8Array, index: number): number {
  return 0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]!
}

/**
 * Measures stable, fully opaque planet-core luminance. A complete source re-add
 * approaches 2× OFF brightness; the bounds permit a weak blur increment only.
 */
export function assertPureBloomCore(off: RgbaImage, on: RgbaImage): CoreBloomStats {
  if (off.width !== on.width || off.height !== on.height || off.data.length !== on.data.length) {
    throw new Error('Bloom images must have matching dimensions and channels')
  }
  let corePixels = 0
  let offLuma = 0
  let onLuma = 0
  let positiveLumaPixels = 0
  let positiveLumaDelta = 0
  for (let index = 0; index < off.data.length; index += 4) {
    if (off.data[index + 3]! < BLOOM_CORE_PROOF.alphaMin) continue
    corePixels += 1
    const offValue = luma(off.data, index)
    const delta = luma(on.data, index) - offValue
    offLuma += offValue
    onLuma += offValue + delta
    if (delta > 0) {
      positiveLumaPixels += 1
      positiveLumaDelta += delta
    }
  }
  if (corePixels < 1024 || offLuma <= 0) throw new Error('Bloom core statistics have insufficient visible signal')
  const stats: CoreBloomStats = {
    core_alpha_min: BLOOM_CORE_PROOF.alphaMin,
    core_pixels: corePixels,
    off_mean_luma: offLuma / corePixels,
    on_mean_luma: onLuma / corePixels,
    on_to_off_mean_luma_ratio: onLuma / offLuma,
    positive_luma_pixels: positiveLumaPixels,
    positive_luma_fraction: positiveLumaPixels / corePixels,
    mean_positive_luma_delta: positiveLumaPixels === 0 ? 0 : positiveLumaDelta / positiveLumaPixels,
  }
  if (stats.on_to_off_mean_luma_ratio > BLOOM_CORE_PROOF.maxOnToOffMeanLumaRatio) {
    throw new Error(`Bloom core ON/OFF ratio ${stats.on_to_off_mean_luma_ratio.toFixed(4)} exceeds ${BLOOM_CORE_PROOF.maxOnToOffMeanLumaRatio}; probable base re-add`)
  }
  if (
    stats.positive_luma_fraction < BLOOM_CORE_PROOF.minPositiveCoreLumaFraction
    || stats.mean_positive_luma_delta < BLOOM_CORE_PROOF.minMeanPositiveCoreLumaDelta
  ) {
    throw new Error('nonzero Bloom did not produce a statistically meaningful positive core increment')
  }
  return stats
}