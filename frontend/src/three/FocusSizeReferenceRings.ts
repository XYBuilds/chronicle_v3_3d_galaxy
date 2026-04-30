import * as THREE from 'three'

import {
  FOCUS_VOTE_REFERENCE_TIERS,
  computeLogVoteRangeFromMovies,
  focusShellRadiiForVoteTiers,
} from '@/lib/galaxyVoteSize'
import type { Movie } from '@/types/galaxy'

// ---------------------------------------------------------------------------
// Size reference — tunables (圆环粗细 / 标签大小)
//
// 圆环「线粗」由内外半径相对值决定：实际世界线宽 ≈ (RING_STROKE_OUTER_FR − RING_STROKE_INNER_FR) × r，
// 其中 r 为该档 vote 对应的壳半径。两常数越接近 1.0 线越细，越远越粗。
//
// 标签为同一字号、固定世界高度 LABEL_PLANE_WORLD_HEIGHT；与相机无关，贴在环平面内、沿切向。
// ---------------------------------------------------------------------------

/** Inner radius factor (unit ring geometry, before `mesh.scale.setScalar(r)`). */
export const RING_STROKE_INNER_FR = 1
/** Outer radius factor; stroke thickness in «r» units is (OUTER − INNER). */
export const RING_STROKE_OUTER_FR = 1.01

/** Ring alpha multiplier (also multiplied by focus fade `opacity`). */
export const RING_OPACITY_BASE = 0.38

/** Label canvas text size (px); same for every tier. */
export const LABEL_CANVAS_FONT_PX = 36

/** Label plane height in world units (width follows canvas aspect). */
export const LABEL_PLANE_WORLD_HEIGHT = 0.032

/** Unicode superscripts for 10¹ … 10⁵ (Votes). */
const VOTE_TIER_SUP = ['\u00b9', '\u00b2', '\u00b3', '\u2074', '\u2075'] as const

const TIER_LABEL_TEXTS = VOTE_TIER_SUP.map((s) => `10${s} Votes`) as readonly string[]

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

const LABEL_CANVAS_W = 720
const LABEL_CANVAS_H = 112

function makeLabelPlaneMesh(text: string, planeGeo: THREE.PlaneGeometry): THREE.Mesh {
  const canvas = document.createElement('canvas')
  canvas.width = LABEL_CANVAS_W
  canvas.height = LABEL_CANVAS_H
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('[FocusSizeReferenceRings] canvas 2d context unavailable')
  }
  ctx.clearRect(0, 0, LABEL_CANVAS_W, LABEL_CANVAS_H)
  ctx.font = `600 ${LABEL_CANVAS_FONT_PX}px ui-monospace, "Cascadia Code", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cx = LABEL_CANVAS_W / 2
  const cy = LABEL_CANVAS_H / 2
  ctx.lineJoin = 'round'
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(0,0,0,0.82)'
  ctx.strokeText(text, cx, cy + 1)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillText(text, cx, cy + 1)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(planeGeo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 2.7
  return mesh
}

export interface FocusSizeReferenceRingsHandle {
  readonly group: THREE.Group
  dispose(): void
  /**
   * Sync pose, radii, per-tier visibility (rings with tier &lt; `voteCount` stay visible; tier &lt; votes hidden).
   * Labels lie in the ring plane, tangent to the circle, shared azimuth; not camera-facing.
   */
  update(params: {
    pivotWorld: THREE.Vector3
    movieId: number
    voteCount: number
    opacity: number
    uSizeScale: number
    uActiveSizeMul: number
  }): void
}

/**
 * P13.5 — vote_count reference rings coplanar with Perlin sphere center, radii from pipeline size mapping.
 */
export function createFocusSizeReferenceRings(movies: readonly Movie[]): FocusSizeReferenceRingsHandle {
  const { logMin, logMax } = computeLogVoteRangeFromMovies(movies)
  console.log('[P13.5] FocusSizeReferenceRings init', { movieCount: movies.length, logMin, logMax })

  const group = new THREE.Group()
  group.name = 'FocusSizeReferenceRings'
  group.visible = false
  group.renderOrder = 2.5

  const aspect = LABEL_CANVAS_W / LABEL_CANVAS_H
  const planeGeo = new THREE.PlaneGeometry(LABEL_PLANE_WORLD_HEIGHT * aspect, LABEL_PLANE_WORLD_HEIGHT)

  const rings: THREE.Mesh[] = []
  const labels: THREE.Mesh[] = []
  const orient = new THREE.Quaternion()
  let lastMovieId = Number.NaN
  let lastLoggedRingDiag = Number.NaN
  /** Shared azimuth (rad) in ring-plane XY for all tiers — same clock position. */
  let sharedLabelAzimuth = 0

  for (let i = 0; i < FOCUS_VOTE_REFERENCE_TIERS.length; i++) {
    rings.push(makeRingMesh(RING_STROKE_INNER_FR, RING_STROKE_OUTER_FR))
    labels.push(makeLabelPlaneMesh(TIER_LABEL_TEXTS[i]!, planeGeo))
    group.add(rings[i]!)
    group.add(labels[i]!)
  }

  const tmpPos = new THREE.Vector3()

  const dispose = () => {
    planeGeo.dispose()
    for (const m of rings) {
      m.geometry.dispose()
        ; (m.material as THREE.MeshBasicMaterial).dispose()
    }
    for (const m of labels) {
      const mat = m.material as THREE.MeshBasicMaterial
      mat.map?.dispose()
      mat.dispose()
    }
  }

  const update = (params: {
    pivotWorld: THREE.Vector3
    movieId: number
    voteCount: number
    opacity: number
    uSizeScale: number
    uActiveSizeMul: number
  }) => {
    const { pivotWorld, movieId, voteCount, opacity, uSizeScale, uActiveSizeMul } = params
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
      sharedLabelAzimuth = rnd() * Math.PI * 2
    }
    group.quaternion.copy(orient)

    const radii = focusShellRadiiForVoteTiers(logMin, logMax, uSizeScale, uActiveSizeMul)
    console.assert(radii.length === rings.length, '[FocusSizeReferenceRings] radii vs rings')
    if (op > 0.5 && movieId !== lastLoggedRingDiag) {
      lastLoggedRingDiag = movieId
      console.log('[P13.5] size ring radii (world)', { movieId, voteCount, uSizeScale, uActiveSizeMul, radii: [...radii] })
    }

    const th = sharedLabelAzimuth
    const cosT = Math.cos(th)
    const sinT = Math.sin(th)

    for (let i = 0; i < rings.length; i++) {
      const tier = FOCUS_VOTE_REFERENCE_TIERS[i]!
      const show = voteCount <= tier
      const r = radii[i]!
      const ringMesh = rings[i]!
      const labelMesh = labels[i]!

      ringMesh.visible = show
      labelMesh.visible = show
      if (!show) continue

      ringMesh.scale.setScalar(r)
      const mat = ringMesh.material as THREE.MeshBasicMaterial
      mat.opacity = RING_OPACITY_BASE * op

      tmpPos.set(cosT * r, sinT * r, 0)
      labelMesh.position.copy(tmpPos)
      labelMesh.rotation.set(0, 0, th + Math.PI / 2)
      const lm = labelMesh.material as THREE.MeshBasicMaterial
      lm.opacity = 0.95 * op
    }
  }

  return { group, dispose, update }
}
