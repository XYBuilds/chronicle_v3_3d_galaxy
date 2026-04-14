import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

import type { Meta, Movie } from '@/types/galaxy'

import { attachGalaxyCameraControls, GALAXY_CAMERA_EULER } from './camera'
import { createGalaxyPoints } from './galaxy'
import { attachGalaxyPointsInteraction } from './interaction'

interface BloomDebugControls {
  strength: number
  radius: number
  threshold: number
  log: () => void
}

interface GalaxyPointScaleDebug {
  /** Multiplier on screen point diameter (JSON `size` × perspective × this). */
  scale: number
  log: () => void
}

declare global {
  interface Window {
    __bloom?: BloomDebugControls
    __galaxyPointScale?: GalaxyPointScaleDebug
  }
}

export interface GalaxySceneMount {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  dispose: () => void
}

function xyCenter(meta: Pick<Meta, 'xy_range'>): { cx: number; cy: number } {
  const { x, y } = meta.xy_range
  if (x.length !== 2 || y.length !== 2) {
    throw new Error('[Scene] meta.xy_range.x / .y must be length-2 [min, max]')
  }
  return { cx: (x[0] + x[1]) / 2, cy: (y[0] + y[1]) / 2 }
}

/**
 * Black fullscreen scene: WebGL2 renderer, perspective camera at XY center and
 * Z = z_range[0] - 2, facing +Z (axis-parallel, no rotation in controls).
 */
export function mountGalaxyScene(
  container: HTMLElement,
  meta: Pick<Meta, 'z_range' | 'xy_range' | 'count'>,
  movies: Movie[],
): GalaxySceneMount {
  const zRange = meta.z_range
  if (zRange.length !== 2) {
    throw new Error('[Scene] meta.z_range must be [z_min, z_max]')
  }
  const [zMin] = zRange
  const { cx, cy } = xyCenter(meta)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 1e6)
  camera.position.set(cx, cy, zMin - 2)
  camera.rotation.copy(GALAXY_CAMERA_EULER)
  camera.updateMatrixWorld(true)

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const gl = renderer.getContext()
  const webglLabel = gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1'

  const pr = Math.min(window.devicePixelRatio, 2)
  const galaxy = createGalaxyPoints(movies, pr)
  scene.add(galaxy.points)

  const composer = new EffectComposer(renderer)
  const renderPass = new RenderPass(scene, camera)
  // strength 0: disable bloom for readability / solid-entity inspection (restore e.g. 1.0 when tuning glow).
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.0, 0.5, 0.85)
  composer.addPass(renderPass)
  composer.addPass(bloomPass)

  const bloomDebug: BloomDebugControls = {
    get strength() {
      return bloomPass.strength
    },
    set strength(value: number) {
      bloomPass.strength = value
    },
    get radius() {
      return bloomPass.radius
    },
    set radius(value: number) {
      bloomPass.radius = value
    },
    get threshold() {
      return bloomPass.threshold
    },
    set threshold(value: number) {
      bloomPass.threshold = value
    },
    log() {
      console.log(
        `[PostFX] Bloom enabled | threshold=${bloomPass.threshold.toFixed(2)} strength=${bloomPass.strength.toFixed(
          2,
        )} radius=${bloomPass.radius.toFixed(2)}`,
      )
    },
  }
  window.__bloom = bloomDebug
  bloomDebug.log()

  const uSizeScale = galaxy.material.uniforms.uSizeScale as THREE.Uniform<number>
  const pointScaleDebug: GalaxyPointScaleDebug = {
    get scale() {
      return uSizeScale.value
    },
    set scale(value: number) {
      uSizeScale.value = value
    },
    log() {
      console.log(`[Galaxy] point size scale=${uSizeScale.value} (uniform uSizeScale)`)
    },
  }
  window.__galaxyPointScale = pointScaleDebug
  pointScaleDebug.log()

  const resize = () => {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    composer.setSize(w, h)
    bloomPass.setSize(w, h)
    galaxy.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2)
  }

  resize()

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null
  ro?.observe(container)
  window.addEventListener('resize', resize)

  container.appendChild(renderer.domElement)

  const canvas = renderer.domElement

  const detachControls = attachGalaxyCameraControls(camera, canvas, {
    zRange: meta.z_range,
    xyRange: meta.xy_range,
  })

  const detachInteraction = attachGalaxyPointsInteraction({
    camera,
    domElement: canvas,
    points: galaxy.points,
    movies,
    meta,
  })

  const w = renderer.domElement.width
  const h = renderer.domElement.height
  console.log(
    `[Scene] Renderer: ${webglLabel} | Canvas: ${w}x${h} | Camera initial Z: ${camera.position.z.toFixed(4)}`,
  )

  let raf = 0
  const tick = () => {
    raf = requestAnimationFrame(tick)
    composer.render()
  }
  tick()

  const dispose = () => {
    cancelAnimationFrame(raf)
    ro?.disconnect()
    window.removeEventListener('resize', resize)
    detachControls()
    detachInteraction()
    galaxy.points.removeFromParent()
    galaxy.dispose()
    if (window.__bloom === bloomDebug) {
      delete window.__bloom
    }
    if (window.__galaxyPointScale === pointScaleDebug) {
      delete window.__galaxyPointScale
    }
    composer.dispose()
    renderer.dispose()
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement)
    }
  }

  return { renderer, scene, camera, dispose }
}
