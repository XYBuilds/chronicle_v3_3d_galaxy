import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { focusEmissionIntensityFromVoteAverage } from './planetAppearance'
import { PLANET_VISUAL_DEFAULTS } from './planetVisualDefaults'

const source = readFileSync(fileURLToPath(new URL('./shaders/perlin.frag.glsl', import.meta.url)), 'utf8')

type LinearRgb = readonly [number, number, number]

function keyLitLinear(baseLinear: LinearRgb, keyLightIntensity: number, lambert: number): LinearRgb {
  return [
    baseLinear[0] * keyLightIntensity * lambert,
    baseLinear[1] * keyLightIntensity * lambert,
    baseLinear[2] * keyLightIntensity * lambert,
  ]
}

function litLinear(
  baseLinear: LinearRgb,
  emissionIntensity: number,
  keyLightIntensity: number,
  lambert: number,
): LinearRgb {
  const key = keyLitLinear(baseLinear, keyLightIntensity, lambert)
  return [
    baseLinear[0] * emissionIntensity + key[0],
    baseLinear[1] * emissionIntensity + key[1],
    baseLinear[2] * emissionIntensity + key[2],
  ]
}

function expectRgbClose(actual: LinearRgb, expected: LinearRgb): void {
  actual.forEach((channel, index) => {
    expect(channel).toBeCloseTo(expected[index]!, 12)
  })
}

function indexOfContract(fragment: string): number {
  const index = source.indexOf(fragment)
  expect(index, `missing shader contract: ${fragment}`).toBeGreaterThanOrEqual(0)
  return index
}

describe('Perlin linear-emission shader contract', () => {
  it('derives each genre band in linear RGB and emits the final local band color', () => {
    expect(source).toContain('vec3 hueToOkLinear(float hue, float L, float C)')
    expect(source).toContain('return max(oklab_to_linear_srgb(vec3(L, a, b)), vec3(0.0));')

    for (let band = 0; band < 8; band += 1) {
      expect(source).toContain(`vec3 col${band} = hueToOkLinear(uHue[${band}], uPerlinL, C_perlin);`)
    }

    const base = indexOfContract('vec3 baseLinear =')
    const emission = indexOfContract('vec3 emissiveLinear = baseLinear * uEmissionIntensity;')
    expect(emission).toBeGreaterThan(base)
    expect(source).not.toMatch(/hueToOkSrgb|baseCol|vec3\s+whiteEmission/)
  })

  it('adds local emission and a fixed Lambert key in linear RGB before one shared output conversion', () => {
    const emission = indexOfContract('vec3 emissiveLinear = baseLinear * uEmissionIntensity;')
    const key = indexOfContract('vec3 keyLitLinear = baseLinear * uKeyLightIntensity * lambert;')
    const sum = indexOfContract('vec3 litLinear = emissiveLinear + keyLitLinear;')
    const diagnostic = indexOfContract('vec3 finalLinear = mix(baseLinear, litLinear, step(0.5, uLightingEnabled));')
    const output = indexOfContract('gl_FragColor = vec4(linear_to_srgb(max(finalLinear, vec3(0.0))), uAlpha);')

    expect(key).toBeGreaterThan(emission)
    expect(sum).toBeGreaterThan(key)
    expect(diagnostic).toBeGreaterThan(sum)
    expect(output).toBeGreaterThan(diagnostic)
    expect(source.match(/\blinear_to_srgb\s*\(/g)).toHaveLength(1)
    expect(source).not.toMatch(/colorspace_fragment|uAmbient|baseLinear\s*\*\s*(?:uAmbient|ambient)|clamp\s*\(\s*(?:litLinear|finalLinear)|min\s*\(\s*(?:litLinear|finalLinear)/)
  })

  it('keeps the configured Key fixed while rating-derived emission brightens dark and lit sides without HDR clipping', () => {
    const base: LinearRgb = [0.25, 0.5, 0.75]
    const voteAverages = [0, 5, 10] as const
    const { emissionIntensityMin, emissionIntensityMax } = PLANET_VISUAL_DEFAULTS.focus
    const keyLightIntensity = PLANET_VISUAL_DEFAULTS.lighting.keyLightIntensity
    const emissions = voteAverages.map((voteAverage) =>
      focusEmissionIntensityFromVoteAverage(voteAverage, emissionIntensityMin, emissionIntensityMax),
    )

    expectRgbClose([emissions[0]!, emissions[1]!, emissions[2]!], [
      emissionIntensityMin,
      (emissionIntensityMin + emissionIntensityMax) / 2,
      emissionIntensityMax,
    ])

    for (const lambert of [0, 0.7]) {
      const linearByRating = emissions.map((emissionIntensity) =>
        litLinear(base, emissionIntensity, keyLightIntensity, lambert),
      )
      const keyByRating = emissions.map(() => keyLitLinear(base, keyLightIntensity, lambert))

      for (let ratingIndex = 1; ratingIndex < linearByRating.length; ratingIndex += 1) {
        linearByRating[ratingIndex]!.forEach((channel, channelIndex) => {
          expect(channel).toBeGreaterThanOrEqual(linearByRating[ratingIndex - 1]![channelIndex]!)
        })
      }
      keyByRating.forEach((key) => expectRgbClose(key, keyByRating[0]!))
    }

    const hdrBase: LinearRgb = [0.9, 0.8, 0.7]
    const hdrLambert = 0.7
    const hdrLinear = litLinear(hdrBase, emissions[2]!, keyLightIntensity, hdrLambert)
    const expectedHdrGreen = hdrBase[1] * (emissions[2]! + keyLightIntensity * hdrLambert)

    expect(hdrBase.every((channel) => channel <= 1)).toBe(true)
    expect(hdrLinear[1]).toBeGreaterThan(1)
    expect(hdrLinear[1]).toBeCloseTo(expectedHdrGreen, 12)
  })
})