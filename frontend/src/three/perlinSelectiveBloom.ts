import * as THREE from 'three'
import {
  createPerlinBloomDeltaCompositor,
  PERLIN_BLOOM_DEFAULTS,
  PERLIN_BLOOM_LAYER,
  type PerlinBloomParams,
  validatePerlinBloomParams,
  withCameraLayer,
} from './perlinBloomContract'

export { PERLIN_BLOOM_DEFAULTS, PERLIN_BLOOM_LAYER, type PerlinBloomParams, validatePerlinBloomParams } from './perlinBloomContract'

export type PerlinBloomCompositeInput = {
  userEnabled: boolean
  globalPostFxBloomEnabled: boolean
  planetVisible: boolean
  planetAlpha: number
}

export function shouldCompositePerlinBloom(input: PerlinBloomCompositeInput): boolean {
  if (!input.userEnabled) return false
  if (input.globalPostFxBloomEnabled) return false
  if (!input.planetVisible) return false
  return input.planetAlpha > 0.001
}

export interface PerlinBloomDebugControls {
  enabled: boolean
  strength: number
  radius: number
  threshold: number
  readonly compositing: boolean
  log(): void
  reset(): void
}

export interface PerlinSelectiveBloomHandle {
  assignBloomLayer(mesh: THREE.Mesh): void
  setSize(width: number, height: number, pixelRatio: number): void
  applyParams(params: PerlinBloomParams): void
  /** SDR base render + optional planet-only pure Bloom delta composite. */
  renderFrame(compositeInput: PerlinBloomCompositeInput): void
  readonly debug: PerlinBloomDebugControls
  dispose(): void
}

export function createPerlinSelectiveBloom(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PerlinSelectiveBloomHandle {
  let params = validatePerlinBloomParams({ ...PERLIN_BLOOM_DEFAULTS })
  let compositing = false
  const delta = createPerlinBloomDeltaCompositor(renderer, scene, camera)

  const applyParams = (next: PerlinBloomParams): void => {
    params = validatePerlinBloomParams(next)
    delta.applyParams(params)
  }

  const debug: PerlinBloomDebugControls = {
    get enabled() { return params.enabled },
    set enabled(value: boolean) { applyParams({ ...params, enabled: value }) },
    get strength() { return params.strength },
    set strength(value: number) { applyParams({ ...params, strength: value }) },
    get radius() { return params.radius },
    set radius(value: number) { applyParams({ ...params, radius: value }) },
    get threshold() { return params.threshold },
    set threshold(value: number) { applyParams({ ...params, threshold: value }) },
    get compositing() { return compositing },
    log() {
      console.log(
        `[PerlinBloom] enabled=${params.enabled ? 1 : 0} compositing=${compositing ? 1 : 0} | ` +
        `threshold=${params.threshold.toFixed(2)} strength=${params.strength.toFixed(3)} radius=${params.radius.toFixed(2)} | ` +
        `layer=${PERLIN_BLOOM_LAYER} contract=pure-bloom-delta-v1 (planet.mesh only; galaxy excluded)`,
      )
    },
    reset() { applyParams({ ...PERLIN_BLOOM_DEFAULTS }); debug.log() },
  }

  return {
    assignBloomLayer(mesh) { mesh.layers.enable(PERLIN_BLOOM_LAYER) },
    setSize(width, height, pixelRatio) { delta.setSize(width, height, pixelRatio) },
    applyParams,
    renderFrame(compositeInput) {
      renderer.render(scene, camera)
      compositing = shouldCompositePerlinBloom(compositeInput)
      if (!compositing) return
      withCameraLayer(camera, PERLIN_BLOOM_LAYER, () => delta.renderDelta())
      delta.compositeDelta()
    },
    debug,
    dispose() { delta.dispose() },
  }
}