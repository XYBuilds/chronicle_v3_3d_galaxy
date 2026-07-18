import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { perlinBloomVisualConfigInput } from '@/three/perlinBloomContract'
import { planetVisualConfigHashInput } from '@/three/planetVisualDefaults'
import { planetExportVisualConfigInput } from './visualConfig'

type MutableVisualConfig = {
  schemaVersion: number
  focus: { emission: { modelVersion: string; exponent: number; intensityMax: number } }
  lighting: { keyLightIntensity: number }
  color: { pipelineVersion: string }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function parsePlanetVisualConfig(input: string): MutableVisualConfig {
  return JSON.parse(input) as MutableVisualConfig
}

describe('planet export visual configuration', () => {
  it('builds a stable page input from the planet visual SSOT and export size root', () => {
    const planetConfigInput = planetVisualConfigHashInput()

    expect(planetExportVisualConfigInput).toHaveLength(3)
    expect(JSON.parse(planetExportVisualConfigInput(planetConfigInput, 3))).toEqual({
      planet: planetConfigInput,
      perlinBloom: perlinBloomVisualConfigInput(),
      exportSizeRoot: 3,
      supportedExportSizeRoots: [2, 3, 4],
    })
    expect(planetExportVisualConfigInput(planetConfigInput, 3)).toBe(
      planetExportVisualConfigInput(planetVisualConfigHashInput(), 3),
    )
    expect(planetExportVisualConfigInput(planetConfigInput, 3, { enabled: true, strength: 0, radius: 1, threshold: 0 })).not.toBe(
      planetExportVisualConfigInput(planetConfigInput, 3),
    )
  })

  it('changes the exporter SHA-256 when a versioned visual input changes', () => {
    const currentPlanetConfig = planetVisualConfigHashInput()
    const currentPageConfig = planetExportVisualConfigInput(currentPlanetConfig, 3)

    const currentHash = sha256(currentPageConfig)
    const repeatedHash = sha256(
      planetExportVisualConfigInput(planetVisualConfigHashInput(), 3),
    )

    expect(repeatedHash).toBe(currentHash)
    expect(currentHash).not.toBe('28407a6ebef33b2749fdd5531158540f2c7ff5214f647f0a7de464b087185dcb')

    const emissionChanged = parsePlanetVisualConfig(currentPlanetConfig)
    emissionChanged.focus.emission.intensityMax = 0.61
    expect(sha256(planetExportVisualConfigInput(JSON.stringify(emissionChanged), 3))).not.toBe(sha256(currentPageConfig))

    const exponentChanged = parsePlanetVisualConfig(currentPlanetConfig)
    exponentChanged.focus.emission.exponent = 2
    expect(sha256(planetExportVisualConfigInput(JSON.stringify(exponentChanged), 3))).not.toBe(sha256(currentPageConfig))

    const modelChanged = parsePlanetVisualConfig(currentPlanetConfig)
    modelChanged.focus.emission.modelVersion = 'vote-average-power-clamped-v2'
    expect(sha256(planetExportVisualConfigInput(JSON.stringify(modelChanged), 3))).not.toBe(sha256(currentPageConfig))

    const keyChanged = parsePlanetVisualConfig(currentPlanetConfig)
    keyChanged.lighting.keyLightIntensity = 1.01
    expect(sha256(planetExportVisualConfigInput(JSON.stringify(keyChanged), 3))).not.toBe(sha256(currentPageConfig))

    const pipelineChanged = parsePlanetVisualConfig(currentPlanetConfig)
    pipelineChanged.color.pipelineVersion = 'oklch-local-base-linear-emission-fixed-key-single-srgb-v2'
    expect(sha256(planetExportVisualConfigInput(JSON.stringify(pipelineChanged), 3))).not.toBe(sha256(currentPageConfig))
  })
})