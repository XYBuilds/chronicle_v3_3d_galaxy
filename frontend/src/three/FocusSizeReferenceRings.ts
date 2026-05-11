import * as THREE from 'three'

import {
  FOCUS_VOTE_REFERENCE_TIERS,
  computeLogVoteRangeFromMovies,
  focusShellRadiiForVoteTiers,
} from '@/lib/galaxyVoteSize'
import { getStrings } from '@/lib/strings'
import { useLocaleStore } from '@/store/localeStore'
import type { Movie } from '@/types/galaxy'

// ---------------------------------------------------------------------------
// Size reference — tunables
//
// 圆环：**世界空间绝对线宽** `RING_STROKE_WORLD`（与半径 r 无关）。几何为
// `RingGeometry(max(ε, r − stroke/2), r + stroke/2)`，`mesh.scale = 1`。
// 标注：**Sprite** 永远朝向相机；方位角由 `movieId` 种子固定（同一电影稳定、各档同角）；
//      径向置于外沿外 `LABEL_OUTSIDE_GAP_WORLD`。
// ---------------------------------------------------------------------------

/**
 * Annulus thickness in **world units** (constant on screen at a given camera scale),
 * not proportional to tier radius `r`.
 */
export const RING_STROKE_WORLD = 0.001

/** Rebuild `RingGeometry` only when tier radius `r` changes by more than this (avoid float churn). */
export const RING_GEOMETRY_R_EPS = 1e-5

/** Minimum inner radius when `r` is very small vs stroke (keeps RingGeometry valid). */
export const RING_INNER_RADIUS_FLOOR = 1e-5

/** Ring alpha multiplier (also multiplied by focus fade `opacity`). */
export const RING_OPACITY_BASE = 0.38

/** Canvas text size (px); same for every tier. Smaller than legacy 32 to match HUD rating scale. */
export const LABEL_CANVAS_FONT_PX = 24

/** Matches {@link FocusLReference} rating row (`font-semibold` ≈ 600). */
export const LABEL_CANVAS_FONT_WEIGHT = 600

/** World-space gap from ring outer edge (r + stroke/2) to label center along outward radial. */
export const LABEL_OUTSIDE_GAP_WORLD = 0.006

/**
 * Sprite vertical size in world units (width follows canvas aspect × `LABEL_CANVAS_W`/`LABEL_CANVAS_H`).
 * Also floored with `r * 0.06` so tiny tiers stay readable.
 */
export const LABEL_SPRITE_WORLD_HEIGHT = 0.024

/**
 * Same face order as `index.css` `@theme` `--font-sans` + fallbacks (HUD / {@link FocusLReference} rating digits).
 */
export const LABEL_UI_FONT_STACK =
  '"Geist Variable", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'

const LABEL_CANVAS_W = 720
const LABEL_CANVAS_H = 112

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

function createRingMesh(): THREE.Mesh {
  const geo = new THREE.RingGeometry(0.001, 0.002, 32)
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
  mesh.scale.setScalar(1)
  return mesh
}

function createLabelCanvasTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = LABEL_CANVAS_W
  canvas.height = LABEL_CANVAS_H
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('[FocusSizeReferenceRings] canvas 2d context unavailable')
  }
  ctx.clearRect(0, 0, LABEL_CANVAS_W, LABEL_CANVAS_H)
  ctx.direction = useLocaleStore.getState().locale === 'ar' ? 'rtl' : 'ltr'
  ctx.font = `${LABEL_CANVAS_FONT_WEIGHT} ${LABEL_CANVAS_FONT_PX}px ${LABEL_UI_FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cx = LABEL_CANVAS_W / 2
  const cy = LABEL_CANVAS_H / 2
  ctx.lineJoin = 'round'
  ctx.lineWidth = 2.5
  ctx.strokeStyle = 'rgba(0,0,0,0.78)'
  ctx.strokeText(text, cx, cy + 1)
  ctx.fillStyle = 'rgba(255,255,255,0.93)'
  ctx.fillText(text, cx, cy + 1)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function makeLabelSprite(text: string): THREE.Sprite {
  const tex = createLabelCanvasTexture(text)
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

/** Replace sprite billboard texture (locale change for tier vote labels). */
function applyLabelTextToSprite(sprite: THREE.Sprite, text: string): void {
  const mat = sprite.material as THREE.SpriteMaterial
  mat.map?.dispose()
  mat.map = createLabelCanvasTexture(text)
  mat.needsUpdate = true
}

function refreshTierLabelsFromStrings(sprites: readonly THREE.Sprite[]): void {
  const tierLabels = getStrings().focusVoteReference.tierLabels
  console.assert(
    tierLabels.length === sprites.length,
    '[FocusSizeReferenceRings] tierLabels vs sprites',
    tierLabels.length,
    sprites.length,
  )
  for (let i = 0; i < sprites.length; i++) {
    applyLabelTextToSprite(sprites[i]!, tierLabels[i]!)
  }
  if (import.meta.env.DEV) {
    console.log('[FocusSizeReferenceRings] tier label textures refreshed', {
      locale: useLocaleStore.getState().locale,
      sample: tierLabels[2],
    })
  }
}

export interface FocusSizeReferenceRingsHandle {
  readonly group: THREE.Group
  dispose(): void
  /**
   * Labels: Sprite billboard (always face viewer), fixed seed azimuth per `movieId`, radial offset outside ring.
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

  const rings: THREE.Mesh[] = []
  const sprites: THREE.Sprite[] = []
  const lastRingR = new Float32Array(FOCUS_VOTE_REFERENCE_TIERS.length)
  lastRingR.fill(-1)
  const orient = new THREE.Quaternion()
  let lastMovieId = Number.NaN
  let lastLoggedRingDiag = Number.NaN
  /** Fixed azimuth (rad) in ring local XY for all tiers — seeded by `movieId`. */
  let sharedLabelAzimuth = 0

  const tierLabels = getStrings().focusVoteReference.tierLabels
  console.assert(
    tierLabels.length === FOCUS_VOTE_REFERENCE_TIERS.length,
    '[FocusSizeReferenceRings] tierLabels vs FOCUS_VOTE_REFERENCE_TIERS',
    tierLabels.length,
    FOCUS_VOTE_REFERENCE_TIERS.length,
  )

  for (let i = 0; i < FOCUS_VOTE_REFERENCE_TIERS.length; i++) {
    rings.push(createRingMesh())
    sprites.push(makeLabelSprite(tierLabels[i]!))
    group.add(rings[i]!)
    group.add(sprites[i]!)
  }

  const unsubLocale = useLocaleStore.subscribe((state, prev) => {
    if (state.locale === prev.locale) return
    refreshTierLabelsFromStrings(sprites)
  })

  const tmpLocal = new THREE.Vector3()

  const dispose = () => {
    unsubLocale()
    for (const m of rings) {
      m.geometry.dispose()
        ; (m.material as THREE.MeshBasicMaterial).dispose()
    }
    for (const s of sprites) {
      const mat = s.material as THREE.SpriteMaterial
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
      lastRingR.fill(-1)
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

    const halfStroke = RING_STROKE_WORLD * 0.5

    for (let i = 0; i < rings.length; i++) {
      const tier = FOCUS_VOTE_REFERENCE_TIERS[i]!
      const show = voteCount <= tier
      const r = radii[i]!
      const ringMesh = rings[i]!
      const spr = sprites[i]!

      ringMesh.visible = show
      spr.visible = show
      if (!show) continue

      if (Math.abs(lastRingR[i]! - r) > RING_GEOMETRY_R_EPS) {
        lastRingR[i] = r
        const inner = Math.max(RING_INNER_RADIUS_FLOOR, r - halfStroke)
        const outer = r + halfStroke
        console.assert(outer > inner, '[FocusSizeReferenceRings] ring outer>inner', { inner, outer, r })
        ringMesh.geometry.dispose()
        ringMesh.geometry = new THREE.RingGeometry(inner, outer, 96)
      }
      ringMesh.scale.setScalar(1)

      const mat = ringMesh.material as THREE.MeshBasicMaterial
      mat.opacity = RING_OPACITY_BASE * op

      const radialDist = r + halfStroke + LABEL_OUTSIDE_GAP_WORLD
      tmpLocal.set(cosT * radialDist, sinT * radialDist, 0)
      spr.position.copy(tmpLocal)

      const sprMat = spr.material as THREE.SpriteMaterial
      sprMat.opacity = 0.95 * op
      const h = Math.max(LABEL_SPRITE_WORLD_HEIGHT, r * 0.06)
      spr.scale.set(h * aspect, h, 1)
    }
  }

  return { group, dispose, update }
}
