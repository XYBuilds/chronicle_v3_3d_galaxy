/**
 * Phase 8.1 — genre hue (radians on [0, 2π)) matches pipeline `H_i = 2π·i/N` and galaxy shaders’ OKLab path.
 */

/** OKLCH L/C for the export palette ring (`export_galaxy_json.py`). */
export const PIPELINE_OKLCH_L = 0.75
export const PIPELINE_OKLCH_C = 0.14

function srgbToLinearChannel(c: number): number {
  const x = Math.max(0, Math.min(1, c))
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}

function srgbToLinear(rgb: readonly [number, number, number]): [number, number, number] {
  return [srgbToLinearChannel(rgb[0]), srgbToLinearChannel(rgb[1]), srgbToLinearChannel(rgb[2])]
}

function linearSrgbToOklab(lin: readonly [number, number, number]): [number, number, number] {
  const [r, g, b] = lin
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** Recover hue (rad ∈ [0, 2π)) from normalized sRGB genre swatch (legacy `genre_color`). */
export function hueFromGenreColor(rgb: readonly [number, number, number]): number {
  const lin = srgbToLinear(rgb)
  const lab = linearSrgbToOklab(lin)
  const chromaPlane = Math.abs(lab[1]) + Math.abs(lab[2])
  if (chromaPlane <= 1e-5) return 0
  let h = Math.atan2(lab[2], lab[1])
  if (h < 0) h += 2 * Math.PI
  return h
}

export function genreHueFromPaletteIndex(index: number, nGenres: number): number {
  if (nGenres <= 0) return 0
  const n = nGenres
  const i = ((index % n) + n) % n
  return (2 * Math.PI * i) / n
}

/** Same ordering as Python `sorted(found)` on genre names. */
export function genreHueForGenreName(genreName: string, palette: Record<string, string>): number {
  const order = Object.keys(palette).sort()
  const idx = order.indexOf(genreName)
  if (idx < 0) return 0
  return genreHueFromPaletteIndex(idx, order.length)
}

function oklabToLinearSrgb(lab: readonly [number, number, number]): [number, number, number] {
  const [L, a, b] = lab
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  // l_, m_, s_ are cube roots of LMS cones — inverse uses **cube** (must match `oklab.glsl` + Python).
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function linearToSrgbChannel(x: number): number {
  const c = Math.max(0, Math.min(1, x))
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

function linearSrgbToSrgb(rgb: readonly [number, number, number]): [number, number, number] {
  return [linearToSrgbChannel(rgb[0]), linearToSrgbChannel(rgb[1]), linearToSrgbChannel(rgb[2])]
}

/**
 * Mirrors galaxy idle/active vertex shaders: L from voteNorm, chroma plane from `hue`, OKLab → linear sRGB → encoded sRGB.
 */
export function pointColorFromHueVote(
  hue: number,
  voteNorm: number,
  uLMin: number,
  uLMax: number,
  uChroma: number,
): [number, number, number] {
  const t = Math.max(0, Math.min(1, voteNorm))
  const L = uLMin + (uLMax - uLMin) * t
  const a = uChroma * Math.cos(hue)
  const labB = uChroma * Math.sin(hue)
  const lin = oklabToLinearSrgb([L, a, labB])
  return linearSrgbToSrgb(lin)
}

/** Fixed L/C ring color for Perlin / HUD-adjacent swatches (matches pipeline hex family). */
export function pipelineRingSrgb01(hueRad: number): [number, number, number] {
  const a = PIPELINE_OKLCH_C * Math.cos(hueRad)
  const labB = PIPELINE_OKLCH_C * Math.sin(hueRad)
  const lin = oklabToLinearSrgb([PIPELINE_OKLCH_L, a, labB])
  return linearSrgbToSrgb(lin)
}
