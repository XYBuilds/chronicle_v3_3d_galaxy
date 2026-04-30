import * as THREE from 'three'

import {
  FOCUS_VOTE_REFERENCE_TIERS,
  computeLogVoteRangeFromMovies,
  focusShellRadiiForVoteTiers,
} from '@/lib/galaxyVoteSize'
import type { Movie } from '@/types/galaxy'

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

const TIER_LABELS = ['10', '100', '1k', '10k', '100k'] as const

/** Mulberry32 PRNG in [0, 1) — stable per integer seed. */
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable random plane orientation for reference rings (P13.5). */
export function seededRingPlaneQuaternion(movieId: number): THREE.Quaternion {
  let s = (movieId >>> 0) ^ 0x9e3779b9
  const rnd = mulberry32(s)
  const yaw = rnd() * Math.PI * 2
  const roll = rnd() * Math.PI * 2
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, yaw, 0, 'XYZ'))
}

function makeRingMesh(innerR: number, outerR: number): THREE.Mesh {
  const geo = new THREE.RingGeometry(innerR, outerR, 96)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 2.6
  return mesh
}

function makeLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const w = 256
  const h = 112
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('[FocusSizeReferenceRings] canvas 2d context unavailable')
  }
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(8,10,18,0.55)'
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 3
  const pad = 10
  ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2)
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = '600 52px ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h / 2 + 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.center.set(0.5, 0.5)
  sprite.renderOrder = 2.7
  return sprite
}

export interface FocusSizeReferenceRingsHandle {
  readonly group: THREE.Group
  dispose(): void
  /**
   * Sync pose, radii (from live `uSizeScale` / `uActiveSizeMul`), opacity (Perlin blend), billboards.
   * @param opacity — multiply with ring alpha; use `uFocusCameraBlend` × planet alpha during transitions.
   */
  update(params: {
    camera: THREE.PerspectiveCamera
    pivotWorld: THREE.Vector3
    movieId: number
    opacity: number
    uSizeScale: number
    uActiveSizeMul: number
  }): void
}

/**
 * P13.5 — five vote_count reference rings coplanar with Perlin sphere center, radii from pipeline size mapping.
 */
export function createFocusSizeReferenceRings(movies: readonly Movie[]): FocusSizeReferenceRingsHandle {
  const { logMin, logMax } = computeLogVoteRangeFromMovies(movies)
  console.log('[P13.5] FocusSizeReferenceRings init', { movieCount: movies.length, logMin, logMax })

  const group = new THREE.Group()
  group.name = 'FocusSizeReferenceRings'
  group.visible = false
  group.renderOrder = 2.5

  const rings: THREE.Mesh[] = []
  const sprites: THREE.Sprite[] = []
  const orient = new THREE.Quaternion()
  let lastMovieId = Number.NaN
  let lastLoggedRingDiag = Number.NaN
  const labelAngles = new Float32Array(FOCUS_VOTE_REFERENCE_TIERS.length)

  for (let i = 0; i < FOCUS_VOTE_REFERENCE_TIERS.length; i++) {
    rings.push(makeRingMesh(0.97, 1.03))
    sprites.push(makeLabelSprite(TIER_LABELS[i]!))
    group.add(rings[i]!)
    group.add(sprites[i]!)
  }

  const tmpPos = new THREE.Vector3()

  const dispose = () => {
    for (const m of rings) {
      m.geometry.dispose()
      ;(m.material as THREE.MeshBasicMaterial).dispose()
    }
    for (const s of sprites) {
      const mat = s.material as THREE.SpriteMaterial
      mat.map?.dispose()
      mat.dispose()
    }
  }

  const update = (params: {
    camera: THREE.PerspectiveCamera
    pivotWorld: THREE.Vector3
    movieId: number
    opacity: number
    uSizeScale: number
    uActiveSizeMul: number
  }) => {
    const { camera, pivotWorld, movieId, opacity, uSizeScale, uActiveSizeMul } = params
    const op = THREE.MathUtils.clamp(opacity, 0, 1)
    if (op < 0.002) {
      group.visible = false
      return
    }
    group.visible = true
    group.position.copy(pivotWorld)

    if (movieId !== lastMovieId) {
      lastMovieId = movieId
      lastLoggedRingDiag = Number.NaN
      orient.copy(seededRingPlaneQuaternion(movieId))
      const rnd = mulberry32((movieId >>> 0) ^ 0x85ebca6b)
      const phase = rnd() * Math.PI * 2
      for (let i = 0; i < labelAngles.length; i++) {
        labelAngles[i] = phase + i * GOLDEN_ANGLE
      }
    }
    group.quaternion.copy(orient)

    const radii = focusShellRadiiForVoteTiers(logMin, logMax, uSizeScale, uActiveSizeMul)
    console.assert(radii.length === rings.length, '[FocusSizeReferenceRings] radii vs rings')
    if (op > 0.5 && movieId !== lastLoggedRingDiag) {
      lastLoggedRingDiag = movieId
      console.log('[P13.5] size ring radii (world)', { movieId, uSizeScale, uActiveSizeMul, radii: [...radii] })
    }

    const camQ = camera.quaternion
    for (let i = 0; i < rings.length; i++) {
      const r = radii[i]!
      const mesh = rings[i]!
      const spr = sprites[i]!
      mesh.scale.setScalar(r)
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = 0.38 * op

      const th = labelAngles[i]!
      tmpPos.set(Math.cos(th) * r * 1.08, Math.sin(th) * r * 1.08, 0)
      spr.position.copy(tmpPos)
      spr.quaternion.copy(camQ)
      const sprMat = spr.material as THREE.SpriteMaterial
      sprMat.opacity = 0.92 * op
      const labelScale = Math.max(r * 0.55, 0.04)
      spr.scale.set(labelScale, labelScale * 0.38, 1)
    }
  }

  return { group, dispose, update }
}
