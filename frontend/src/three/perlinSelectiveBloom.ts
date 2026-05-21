import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

/** Layer mask for Perlin `planet.mesh` only (see three.js selective bloom example). */
export const PERLIN_BLOOM_LAYER = 1

const bloomLayerMask = new THREE.Layers()
bloomLayerMask.set(PERLIN_BLOOM_LAYER)

/** Phase 32.7 — conservative defaults (edge polish, not fog). */
export const PERLIN_BLOOM_DEFAULTS = {
  enabled: true,
  strength: 0.005,
  radius: 2,
  threshold: 0,
} as const

export type PerlinBloomParams = {
  enabled: boolean
  strength: number
  radius: number
  threshold: number
}

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
  /** True when the last frame used bloom composite (read-only). */
  readonly compositing: boolean
  log(): void
  reset(): void
}

export interface PerlinSelectiveBloomHandle {
  assignBloomLayer(mesh: THREE.Mesh): void
  setSize(width: number, height: number, pixelRatio: number): void
  applyParams(params: PerlinBloomParams): void
  /**
   * SDR base render + optional perlin-only bloom composite.
   * Global `postFxBloomEnabled` must be handled by the caller (composer path).
   */
  renderFrame(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    compositeInput: PerlinBloomCompositeInput,
  ): void
  readonly debug: PerlinBloomDebugControls
  dispose(): void
}

export function createPerlinSelectiveBloom(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PerlinSelectiveBloomHandle {
  let params: PerlinBloomParams = { ...PERLIN_BLOOM_DEFAULTS }
  let compositing = false

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), params.strength, params.radius, params.threshold)
  const bloomRenderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
  const bloomComposer = new EffectComposer(renderer, bloomRenderTarget)
  bloomComposer.renderToScreen = false
  bloomComposer.addPass(new RenderPass(scene, camera))
  bloomComposer.addPass(bloomPass)

  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const blendScene = new THREE.Scene()
  const blendUniforms = {
    tBloom: { value: bloomComposer.readBuffer.texture },
    bloomStrength: { value: 1.0 },
  }
  const blendMaterial = new THREE.ShaderMaterial({
    uniforms: blendUniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tBloom;
      uniform float bloomStrength;
      varying vec2 vUv;
      void main() {
        vec3 bloom = texture2D(tBloom, vUv).rgb * bloomStrength;
        gl_FragColor = vec4(bloom, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
  })
  const blendQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blendMaterial)
  blendScene.add(blendQuad)

  const applyParams = (next: PerlinBloomParams) => {
    params = { ...next }
    bloomPass.strength = params.strength
    bloomPass.radius = params.radius
    bloomPass.threshold = params.threshold
  }
  applyParams(params)

  const debug: PerlinBloomDebugControls = {
    get enabled() {
      return params.enabled
    },
    set enabled(value: boolean) {
      params.enabled = value
    },
    get strength() {
      return bloomPass.strength
    },
    set strength(value: number) {
      params.strength = value
      bloomPass.strength = value
    },
    get radius() {
      return bloomPass.radius
    },
    set radius(value: number) {
      params.radius = value
      bloomPass.radius = value
    },
    get threshold() {
      return bloomPass.threshold
    },
    set threshold(value: number) {
      params.threshold = value
      bloomPass.threshold = value
    },
    get compositing() {
      return compositing
    },
    log() {
      console.log(
        `[PerlinBloom] enabled=${params.enabled ? 1 : 0} compositing=${compositing ? 1 : 0} | ` +
        `threshold=${bloomPass.threshold.toFixed(2)} strength=${bloomPass.strength.toFixed(2)} radius=${bloomPass.radius.toFixed(2)} | ` +
        `layer=${PERLIN_BLOOM_LAYER} (planet.mesh only; galaxy idle/active excluded)`,
      )
    },
    reset() {
      applyParams({ ...PERLIN_BLOOM_DEFAULTS })
      debug.log()
    },
  }

  return {
    assignBloomLayer(mesh: THREE.Mesh) {
      mesh.layers.enable(PERLIN_BLOOM_LAYER)
    },

    setSize(width: number, height: number, pixelRatio: number) {
      bloomComposer.setPixelRatio(pixelRatio)
      bloomComposer.setSize(width, height)
      bloomPass.setSize(width, height)
      blendUniforms.tBloom.value = bloomComposer.readBuffer.texture
    },

    applyParams,

    renderFrame(renderer, scene, camera, compositeInput) {
      renderer.render(scene, camera)
      compositing = shouldCompositePerlinBloom(compositeInput)
      if (!compositing) return

      const prevCameraLayers = camera.layers.mask
      camera.layers.set(PERLIN_BLOOM_LAYER)
      bloomComposer.render()
      camera.layers.mask = prevCameraLayers

      blendUniforms.tBloom.value = bloomComposer.readBuffer.texture
      blendUniforms.bloomStrength.value = 1.0

      const prevAutoClear = renderer.autoClear
      renderer.autoClear = false
      renderer.render(blendScene, orthoCam)
      renderer.autoClear = prevAutoClear
    },

    debug,

    dispose() {
      bloomComposer.dispose()
      bloomRenderTarget.dispose()
      blendMaterial.dispose()
      blendQuad.geometry.dispose()
    },
  }
}
