import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { PERLIN_BLOOM_DEFAULTS, PERLIN_BLOOM_LAYER } from '@/three/perlinSelectiveBloom'
import { createSelectionPlanet, type SelectionPlanetHandle } from '@/three/planet'
import type { Meta, Movie } from '@/types/galaxy'
import { PLANET_VISUAL_DEFAULTS } from '@/three/planetVisualDefaults'
import { computeExportWorldRadius, computeOrthographicHalfExtent } from './sizing'
import type { PlanetExportRenderMode } from './request'

export type PlanetRenderOptions = {
  canvas: HTMLCanvasElement
  movie: Movie
  meta: Meta
  globalRadius: number
  resolution: number
  padding: number
  bloom: boolean
  renderMode: PlanetExportRenderMode
}

export type PlanetRenderResult = {
  renderer: THREE.WebGLRenderer
  visible: boolean
  renderMode: PlanetExportRenderMode
}

export function prepareExportPlanet(
  movie: Movie,
  meta: Meta,
  renderMode: PlanetExportRenderMode,
): SelectionPlanetHandle {
  const defaults = PLANET_VISUAL_DEFAULTS
  const planet = createSelectionPlanet()
  const worldRadius = computeExportWorldRadius(movie)
  planet.setFromMovie(movie, meta.genre_palette, worldRadius, {
    uLMin: defaults.galaxyColor.lMin,
    uLMax: defaults.galaxyColor.lMax,
    uHighRatingT: defaults.galaxyColor.highRatingT,
    uHighTierTRangeScale: defaults.galaxyColor.highTierTRangeScale,
    uLightnessRatingExponent: defaults.galaxyColor.lightnessRatingExponent,
    uChroma: defaults.galaxyColor.chroma,
  })
  planet.mesh.position.set(0, 0, 0)
  planet.material.uniforms.uMeshWorldPos.value.set(0, 0, 0)
  planet.setOpacity(1)
  planet.mesh.updateMatrixWorld(true)
  if (renderMode === 'basic') {
    planet.mesh.material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })
  }
  console.assert(planet.mesh.visible, '[PlanetExport] planet must be visible before rendering')
  return planet
}

function renderAlphaPreservingBloom(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  planet: THREE.Mesh,
  resolution: number,
): void {
  renderer.render(scene, camera)
  planet.layers.enable(PERLIN_BLOOM_LAYER)
  const target = new THREE.WebGLRenderTarget(resolution, resolution, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
  })
  const composer = new EffectComposer(renderer, target)
  composer.renderToScreen = false
  const renderPass = new RenderPass(scene, camera)
  renderPass.clearAlpha = 0
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(resolution, resolution),
    PERLIN_BLOOM_DEFAULTS.strength,
    PERLIN_BLOOM_DEFAULTS.radius,
    PERLIN_BLOOM_DEFAULTS.threshold,
  )
  composer.addPass(renderPass)
  composer.addPass(bloomPass)
  const previousMask = camera.layers.mask
  camera.layers.set(PERLIN_BLOOM_LAYER)
  composer.render()
  camera.layers.mask = previousMask

  const blend = new THREE.ShaderMaterial({
    uniforms: { tBloom: { value: composer.readBuffer.texture } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: 'uniform sampler2D tBloom; varying vec2 vUv; void main(){ vec3 bloom=texture2D(tBloom,vUv).rgb; gl_FragColor=vec4(bloom,max(max(bloom.r,bloom.g),bloom.b)); }',
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
  const blendScene = new THREE.Scene()
  const blendQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blend)
  blendScene.add(blendQuad)
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const previousAutoClear = renderer.autoClear
  renderer.autoClear = false
  renderer.render(blendScene, ortho)
  renderer.autoClear = previousAutoClear

  blend.dispose()
  blendQuad.geometry.dispose()
  composer.dispose()
  target.dispose()
}

export function renderPlanetImage(options: PlanetRenderOptions): PlanetRenderResult {
  const { canvas, movie, meta, globalRadius, resolution, padding, bloom, renderMode } = options
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(resolution, resolution, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  renderer.autoClear = true

  const scene = new THREE.Scene()
  const half = computeOrthographicHalfExtent(globalRadius, padding)
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, half * 4)
  camera.position.set(0, 0, half * 2)
  camera.lookAt(0, 0, 0)

  const planet = prepareExportPlanet(movie, meta, renderMode)
  scene.add(planet.mesh)
  if (bloom) {
    renderAlphaPreservingBloom(renderer, scene, camera, planet.mesh, resolution)
  } else {
    renderer.render(scene, camera)
  }
  console.assert(planet.mesh.visible, '[PlanetExport] planet must be visible before rendering')
  return { renderer, visible: planet.mesh.visible, renderMode }
}
