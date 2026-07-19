import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

/** Shared Focus/Cover/export bloom contract. The compositor adds only composite-base on the GPU. */
export const PERLIN_BLOOM_COMPOSITION = 'pure-bloom-delta-v1' as const
/** Shared layer identity; only the selected Perlin planet enters the bloom source pass. */
export const PERLIN_BLOOM_LAYER = 1

export const PERLIN_BLOOM_DEFAULTS = {
  enabled: true,
  strength: 0.01,
  radius: 1.0,
  threshold: 0,
} as const

export type PerlinBloomParams = {
  enabled: boolean
  strength: number
  radius: number
  threshold: number
}

export function validatePerlinBloomParams(params: PerlinBloomParams): PerlinBloomParams {
  if (typeof params.enabled !== 'boolean') throw new Error('[PerlinBloom] enabled must be boolean')
  for (const [label, value] of Object.entries(params)) {
    if (label !== 'enabled' && !Number.isFinite(value)) throw new Error(`[PerlinBloom] ${label} must be finite`)
  }
  if (params.strength < 0) throw new Error('[PerlinBloom] strength must be >= 0')
  if (params.radius < 0 || params.radius > 1) throw new Error('[PerlinBloom] radius must be in [0, 1]')
  if (params.threshold < 0) throw new Error('[PerlinBloom] threshold must be >= 0')
  return { ...params }
}

export function isPerlinBloomDeltaEnabled(params: PerlinBloomParams): boolean {
  return validatePerlinBloomParams(params).enabled && params.strength > 0
}

export function withCameraLayer<T>(camera: THREE.Camera, layer: number, render: () => T): T {
  if (!Number.isSafeInteger(layer) || layer < 0 || layer > 31) {
    throw new Error('[PerlinBloom] camera layer must be an integer in [0, 31]')
  }
  const previousMask = camera.layers.mask
  try {
    camera.layers.set(layer)
    return render()
  } finally {
    camera.layers.mask = previousMask
  }
}

export function withRendererAutoClear<T>(renderer: Pick<THREE.WebGLRenderer, 'autoClear'>, render: () => T): T {
  const previousAutoClear = renderer.autoClear
  renderer.autoClear = false
  try {
    return render()
  } finally {
    renderer.autoClear = previousAutoClear
  }
}

export function perlinBloomVisualConfigInput(params: PerlinBloomParams = PERLIN_BLOOM_DEFAULTS): string {
  return JSON.stringify({ composition: PERLIN_BLOOM_COMPOSITION, ...validatePerlinBloomParams(params) })
}

export const PERLIN_BLOOM_DELTA_FRAGMENT = `
  uniform sampler2D tComposite;
  uniform sampler2D tBase;
  varying vec2 vUv;
  void main() {
    vec3 delta = max(texture2D(tComposite, vUv).rgb - texture2D(tBase, vUv).rgb, vec3(0.0));
    gl_FragColor = vec4(delta, max(max(delta.r, delta.g), delta.b));
  }
`

export interface PerlinBloomDeltaCompositor {
  applyParams(params: PerlinBloomParams): void
  setSize(width: number, height: number, pixelRatio: number): void
  /** Renders the isolated planet base and composer result into HalfFloat targets. */
  renderDelta(): void
  /** Adds only max(composer RGB - isolated-base RGB, 0) to the active framebuffer. */
  compositeDelta(): void
  readonly params: PerlinBloomParams
  dispose(): void
}

/**
 * Contract implementation deliberately retains UnrealBloomPass's normal composite output,
 * then removes its RenderPass base on-GPU. This avoids a readback and guarantees callers
 * never add the source planet a second time.
 */
export function createPerlinBloomDeltaCompositor(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PerlinBloomDeltaCompositor {
  let params = validatePerlinBloomParams({ ...PERLIN_BLOOM_DEFAULTS })
  const options: THREE.RenderTargetOptions = { type: THREE.HalfFloatType, format: THREE.RGBAFormat }
  const baseTarget = new THREE.WebGLRenderTarget(1, 1, options)
  const bloomTarget = new THREE.WebGLRenderTarget(1, 1, options)
  const composer = new EffectComposer(renderer, bloomTarget)
  composer.renderToScreen = false
  const renderPass = new RenderPass(scene, camera)
  renderPass.clearAlpha = 0
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), params.strength, params.radius, params.threshold)
  composer.addPass(renderPass)
  composer.addPass(bloomPass)

  const compositeUniforms = {
    tComposite: { value: composer.readBuffer.texture },
    tBase: { value: baseTarget.texture },
  }
  const material = new THREE.ShaderMaterial({
    uniforms: compositeUniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: PERLIN_BLOOM_DELTA_FRAGMENT,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquation: THREE.AddEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    blendEquationAlpha: THREE.MaxEquation,
    depthTest: false,
    depthWrite: false,
  })
  const compositeScene = new THREE.Scene()
  const compositeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  compositeScene.add(compositeQuad)
  const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  const applyParams = (next: PerlinBloomParams): void => {
    params = validatePerlinBloomParams(next)
    bloomPass.strength = params.strength
    bloomPass.radius = params.radius
    bloomPass.threshold = params.threshold
    console.log(`[PerlinBloom] contract=${PERLIN_BLOOM_COMPOSITION} strength=${params.strength} radius=${params.radius} threshold=${params.threshold}`)
  }
  applyParams(params)

  return {
    applyParams,
    setSize(width, height, pixelRatio) {
      if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(pixelRatio) || width <= 0 || height <= 0 || pixelRatio <= 0) {
        throw new Error('[PerlinBloom] render target dimensions and pixel ratio must be finite positive values')
      }
      baseTarget.setSize(width * pixelRatio, height * pixelRatio)
      composer.setPixelRatio(pixelRatio)
      composer.setSize(width, height)
      bloomPass.setSize(width * pixelRatio, height * pixelRatio)
      compositeUniforms.tComposite.value = composer.readBuffer.texture
    },
    renderDelta() {
      const previousTarget = renderer.getRenderTarget()
      const previousBackground = scene.background
      // A Scene background is not layer-filtered. Suppress it in both passes so
      // threshold=0 still remains planet-only rather than blooming the universe.
      scene.background = null
      try {
        renderer.setRenderTarget(baseTarget)
        renderer.clear()
        renderer.render(scene, camera)
        renderer.setRenderTarget(previousTarget)
        composer.render()
        compositeUniforms.tComposite.value = composer.readBuffer.texture
      } finally {
        renderer.setRenderTarget(previousTarget)
        scene.background = previousBackground
      }
    },
    compositeDelta() {
      // A zero-strength ON pass is exactly the OFF image; do not even touch the framebuffer.
      if (!isPerlinBloomDeltaEnabled(params)) return
      withRendererAutoClear(renderer, () => renderer.render(compositeScene, compositeCamera))
    },
    get params() { return { ...params } },
    dispose() {
      // r183 EffectComposer.dispose owns and disposes the supplied bloomTarget plus its clone.
      // UnrealBloomPass owns its own mip-chain targets and is not disposed by the composer.
      bloomPass.dispose()
      composer.dispose()
      baseTarget.dispose()
      material.dispose()
      compositeQuad.geometry.dispose()
    },
  }
}