import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import {
  isPerlinBloomDeltaEnabled,
  PERLIN_BLOOM_COMPOSITION,
  PERLIN_BLOOM_DELTA_FRAGMENT,
  perlinBloomVisualConfigInput,
  withCameraLayer,
  withRendererAutoClear,
} from './perlinBloomContract'
import {
  PERLIN_BLOOM_DEFAULTS,
  shouldCompositePerlinBloom,
  validatePerlinBloomParams,
} from './perlinSelectiveBloom'

const bloomContractSource = readFileSync(fileURLToPath(new URL('./perlinBloomContract.ts', import.meta.url)), 'utf8')

describe('perlinSelectiveBloom', () => {
  it('exports the shipped pure-delta baseline without advancing visual tuning', () => {
    expect(PERLIN_BLOOM_DEFAULTS).toEqual({ enabled: true, strength: 0.005, radius: 1, threshold: 0 })
    expect(perlinBloomVisualConfigInput()).toBe(JSON.stringify({ composition: PERLIN_BLOOM_COMPOSITION, ...PERLIN_BLOOM_DEFAULTS }))
  })

  it('uses one finite validated parameter contract across Focus, Cover, and export', () => {
    expect(validatePerlinBloomParams({ ...PERLIN_BLOOM_DEFAULTS })).toEqual(PERLIN_BLOOM_DEFAULTS)
    for (const params of [
      { ...PERLIN_BLOOM_DEFAULTS, strength: -0.001 },
      { ...PERLIN_BLOOM_DEFAULTS, radius: -0.001 },
      { ...PERLIN_BLOOM_DEFAULTS, radius: 1.001 },
      { ...PERLIN_BLOOM_DEFAULTS, threshold: -0.001 },
      { ...PERLIN_BLOOM_DEFAULTS, strength: Number.NaN },
      { ...PERLIN_BLOOM_DEFAULTS, radius: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => validatePerlinBloomParams(params)).toThrow(/PerlinBloom/)
    }
  })

  it('keeps Bloom ON/OFF RGB identical at strength zero by skipping the final composite', () => {
    expect(isPerlinBloomDeltaEnabled({ ...PERLIN_BLOOM_DEFAULTS, strength: 0 })).toBe(false)
    expect(isPerlinBloomDeltaEnabled(PERLIN_BLOOM_DEFAULTS)).toBe(true)
  })

  it('restores renderer autoClear when the additive composite render throws', () => {
    const renderer = { autoClear: true }
    expect(() => withRendererAutoClear(renderer, () => { throw new Error('composite failed') })).toThrow('composite failed')
    expect(renderer.autoClear).toBe(true)

    renderer.autoClear = false
    expect(withRendererAutoClear(renderer, () => 'ok')).toBe('ok')
    expect(renderer.autoClear).toBe(false)
  })

  it('gives r183 composer ownership of its supplied target and disposes the Unreal Bloom mip chain once', () => {
    expect(bloomContractSource).toMatch(/bloomPass\.dispose\(\)\s*\n\s*composer\.dispose\(\)/)
    expect(bloomContractSource).not.toContain('bloomTarget.dispose()')
  })

  it('defines one GPU pure-increment shader that subtracts the isolated base before additive blend', () => {
    expect(PERLIN_BLOOM_DELTA_FRAGMENT).toContain('tComposite')
    expect(PERLIN_BLOOM_DELTA_FRAGMENT).toContain('tBase')
    expect(PERLIN_BLOOM_DELTA_FRAGMENT).toMatch(/max\(texture2D\(tComposite, vUv\)\.rgb - texture2D\(tBase, vUv\)\.rgb, vec3\(0\.0\)\)/)
  })

  it('always restores the camera layer after a successful or failed isolated pass', () => {
    const camera = new THREE.PerspectiveCamera()
    camera.layers.mask = 0b10101
    expect(withCameraLayer(camera, 1, () => camera.layers.mask)).toBe(0b10)
    expect(camera.layers.mask).toBe(0b10101)
    expect(() => withCameraLayer(camera, 1, () => { throw new Error('render failed') })).toThrow('render failed')
    expect(camera.layers.mask).toBe(0b10101)
    expect(() => withCameraLayer(camera, 32, () => undefined)).toThrow(/camera layer/)
  })

  it('shouldCompositePerlinBloom requires visible planet and user enable', () => {
    const base = { userEnabled: true, globalPostFxBloomEnabled: false, planetVisible: true, planetAlpha: 1 }
    expect(shouldCompositePerlinBloom(base)).toBe(true)
    expect(shouldCompositePerlinBloom({ ...base, userEnabled: false })).toBe(false)
    expect(shouldCompositePerlinBloom({ ...base, globalPostFxBloomEnabled: true })).toBe(false)
    expect(shouldCompositePerlinBloom({ ...base, planetVisible: false })).toBe(false)
    expect(shouldCompositePerlinBloom({ ...base, planetAlpha: 0 })).toBe(false)
  })
})