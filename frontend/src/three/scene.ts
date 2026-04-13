import * as THREE from 'three'

import type { Meta, Movie } from '@/types/galaxy'

import { attachGalaxyCameraControls, GALAXY_CAMERA_EULER } from './camera'
import { createGalaxyPoints } from './galaxy'

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
  meta: Pick<Meta, 'z_range' | 'xy_range'>,
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

  const resize = () => {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    galaxy.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2)
  }

  resize()

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null
  ro?.observe(container)
  window.addEventListener('resize', resize)

  container.appendChild(renderer.domElement)

  const detachControls = attachGalaxyCameraControls(camera, renderer.domElement, {
    zRange: meta.z_range,
    xyRange: meta.xy_range,
  })

  const w = renderer.domElement.width
  const h = renderer.domElement.height
  console.log(
    `[Scene] Renderer: ${webglLabel} | Canvas: ${w}x${h} | Camera initial Z: ${camera.position.z.toFixed(4)}`,
  )

  let raf = 0
  const tick = () => {
    raf = requestAnimationFrame(tick)
    renderer.render(scene, camera)
  }
  tick()

  const dispose = () => {
    cancelAnimationFrame(raf)
    ro?.disconnect()
    window.removeEventListener('resize', resize)
    detachControls()
    galaxy.points.removeFromParent()
    galaxy.dispose()
    renderer.dispose()
    if (renderer.domElement.parentElement === container) {
      container.removeChild(renderer.domElement)
    }
  }

  return { renderer, scene, camera, dispose }
}
