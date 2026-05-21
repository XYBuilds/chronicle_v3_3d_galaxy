import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COSMOS_UNIVERSE_BG_DEFAULT,
  formatUniverseBgHex,
  getActiveUniverseBgSource,
  getCanonicalUniverseBgHex,
  parseUniverseBgColor,
  resetUniverseBackgroundColor,
  applyUniverseBackgroundColor,
} from './universeBackground'

describe('universeBackground token', () => {
  beforeEach(() => {
    resetUniverseBackgroundColor(undefined, { log: false })
  })

  it('parses hex string and numeric 0x', () => {
    expect(formatUniverseBgHex(parseUniverseBgColor('#0a1628'))).toBe('#0a1628')
    expect(formatUniverseBgHex(parseUniverseBgColor(0x0a1628))).toBe('#0a1628')
  })

  it('apply syncs scene.background and renderer clear color', () => {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#000000')
    const renderer = {
      setClearColor: vi.fn(),
      getClearColor: vi.fn((out: THREE.Color) => out.set('#0a1628')),
    } as unknown as THREE.WebGLRenderer

    const hex = applyUniverseBackgroundColor(
      '#0a1628',
      { scene, renderer },
      { source: 'runtime', log: false },
    )

    expect(hex).toBe('#0a1628')
    expect(scene.background).toBeInstanceOf(THREE.Color)
    expect(formatUniverseBgHex(scene.background as THREE.Color)).toBe('#0a1628')
    expect(renderer.setClearColor).toHaveBeenCalledWith(expect.any(THREE.Color), 1)
    expect(getCanonicalUniverseBgHex()).toBe('#0a1628')
    expect(getActiveUniverseBgSource()).toBe('runtime')
  })

  it('ignores lower-priority source after runtime apply', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    applyUniverseBackgroundColor('#111111', undefined, { source: 'runtime', log: false })
    const hex = applyUniverseBackgroundColor('#222222', undefined, {
      source: 'interaction',
      log: false,
    })
    expect(hex).toBe('#111111')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('reset restores default token and default source', () => {
    applyUniverseBackgroundColor('#0a1628', undefined, { source: 'runtime', log: false })
    const hex = resetUniverseBackgroundColor(undefined, { log: false })
    expect(hex).toBe(COSMOS_UNIVERSE_BG_DEFAULT)
    expect(getActiveUniverseBgSource()).toBe('default')
    expect(getCanonicalUniverseBgHex()).toBe(COSMOS_UNIVERSE_BG_DEFAULT)
  })
})
