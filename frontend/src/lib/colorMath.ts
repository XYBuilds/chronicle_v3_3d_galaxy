/**
 * P10.1 OKLab lightness path — TS mirror of `galaxyIdle.vert.glsl` / `galaxyActive.vert.glsl`
 * and `planet.ts` Perlin L (for HUD + tests; keep in sync with GLSL).
 */

export interface GalaxyLightnessUniforms {
  uLMin: number
  uLMax: number
  uHighRatingT: number
  uHighTierTRangeScale: number
  uLightnessRatingExponent: number
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

/** P17.2 — mirror of `applyHuntChroma` in `oklab.glsl` / active.vert (C scales with L). */
export function applyHuntChroma(L_actual: number, L_ref: number, C_base: number, gamma: number): number {
  const t = clamp01(L_actual / Math.max(L_ref, 1e-4))
  return C_base * Math.pow(t, gamma)
}

/** Same as shader: `voteNorm` ∈ [0,1] → compressed t → pow → L. */
export function lightnessFromVoteNorm(voteNorm: number, snap: GalaxyLightnessUniforms): number {
  const t = clamp01(voteNorm)
  const { uLMin, uLMax, uHighRatingT, uHighTierTRangeScale, uLightnessRatingExponent } = snap
  const tCompressed = t < uHighRatingT ? t : uHighRatingT + (t - uHighRatingT) * uHighTierTRangeScale
  const tPow = Math.pow(Math.max(0, tCompressed), uLightnessRatingExponent)
  console.assert(Number.isFinite(tPow), '[colorMath] tPow finite', voteNorm, snap)
  const L = uLMin + (uLMax - uLMin) * tPow
  console.assert(Number.isFinite(L), '[colorMath] L finite', L)
  return L
}

export function lightnessFromVoteAverage(voteAverage: number, snap: GalaxyLightnessUniforms): number {
  return lightnessFromVoteNorm(clamp01(voteAverage / 10), snap)
}

/** Same `tPow` as shader `mix(uLMin, uLMax, tPow)` — HUD pointer X ∈ [0,1]. */
export function normalizedLBlendTFromVoteNorm(voteNorm: number, snap: GalaxyLightnessUniforms): number {
  const t = clamp01(voteNorm)
  const { uHighRatingT, uHighTierTRangeScale, uLightnessRatingExponent } = snap
  const tCompressed = t < uHighRatingT ? t : uHighRatingT + (t - uHighRatingT) * uHighTierTRangeScale
  return Math.pow(Math.max(0, tCompressed), uLightnessRatingExponent)
}

/** OKLab → linear sRGB (matches `oklab.glsl` / `genreHue.ts`). */
export function oklabToLinearSrgb(lab: readonly [number, number, number]): [number, number, number] {
  const [L, a, b] = lab
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

export function linearSrgbToSrgbChannel(x: number): number {
  const c = Math.max(0, Math.min(1, x))
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

export function linearSrgbToSrgb(rgb: readonly [number, number, number]): [number, number, number] {
  return [linearSrgbToSrgbChannel(rgb[0]), linearSrgbToSrgbChannel(rgb[1]), linearSrgbToSrgbChannel(rgb[2])]
}

/** Snapshot for HUD stripes: P10.1 L + optional P17.2 Hunt on chroma (matches `galaxyActive.vert.glsl`). */
export type GalaxyHudColorSnap = GalaxyLightnessUniforms & {
  uChroma: number
  uHuntGamma?: number
  uHuntApplyMask?: number
}

/** Galaxy star color: OKLab (L from P10.1, chroma from hue; P17.2 Hunt when mask bit1 + gamma present). */
export function srgb01FromHueAndVoteNorm(
  hueRad: number,
  voteNorm: number,
  snap: GalaxyHudColorSnap,
): [number, number, number] {
  const L = lightnessFromVoteNorm(voteNorm, snap)
  const huntActive =
    snap.uHuntGamma !== undefined &&
    snap.uHuntApplyMask !== undefined &&
    (snap.uHuntApplyMask & 2) !== 0
  const C = huntActive ? applyHuntChroma(L, snap.uLMax, snap.uChroma, snap.uHuntGamma!) : snap.uChroma
  const a = C * Math.cos(hueRad)
  const labB = C * Math.sin(hueRad)
  const lin = oklabToLinearSrgb([L, a, labB])
  return linearSrgbToSrgb(lin)
}

/** `rgb` each in [0,1] for `rgb(r g b / 1)` CSS. */
export function srgb01ToCss(rgb: readonly [number, number, number]): string {
  const [r, g, b] = rgb
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)} / 1)`
}
