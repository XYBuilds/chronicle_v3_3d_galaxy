import { useEffect, useRef } from 'react'

import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { mountGalaxyScene } from '@/three/scene'
import type { Meta, Movie } from '@/types/galaxy'

export interface GalaxyThreeLayerLabProps {
  meta: Pick<Meta, 'z_range' | 'xy_range' | 'count' | 'genre_palette'>
  movies: Movie[]
  /** Macro Z focus (decimal year); drives store + galaxy `uZCurrent` each frame. */
  zCurrent: number
  /** Visible slab width along Z (world years). */
  zVisWindow: number
  /** Active (viz-window) mesh size multiplier — uniform `uActiveSizeMul`. */
  uActiveSizeMul: number
  /** Background slab point size multiplier (`uBgSizeMul`). */
  uBgSizeMul: number
  /** OKLCH lightness floor (`uLMin`). */
  uLMin: number
  /** OKLCH lightness ceiling (`uLMax`). */
  uLMax: number
  /** OKLCH chroma (`uChroma`). */
  uChroma: number
  /** Global world scale for dual mesh (`uSizeScale`; former Points scale × mesh calib). */
  uSizeScale: number
  /** When true, attaches `UnrealBloomPass` and uses composer rendering (revive path). */
  postProcessBloom: boolean
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number
  /** When set, runs the same selection path as the app (fly-to + planet). */
  selectedMovieId: number | null
  planetUScale: number
  planetOctaves: number
  planetPersistence: number
  /** P8.3 — geometric area ratio x in weights [1,x,x²,x³]; default 1/φ. */
  planetAreaRatio: number
}

/**
 * Storybook / lab host: mounts the real galaxy WebGL scene and mirrors tuning props into uniforms / store.
 */
export function GalaxyThreeLayerLabCore(props: GalaxyThreeLayerLabProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const mountHandle = useRef<ReturnType<typeof mountGalaxyScene> | null>(null)

  const {
    meta,
    movies,
    zCurrent,
    zVisWindow,
    uActiveSizeMul,
    uBgSizeMul,
    uLMin,
    uLMax,
    uChroma,
    uSizeScale,
    postProcessBloom,
    bloomStrength,
    bloomRadius,
    bloomThreshold,
    selectedMovieId,
    planetUScale,
    planetOctaves,
    planetPersistence,
    planetAreaRatio,
  } = props

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const m = mountGalaxyScene(el, meta, movies)
    mountHandle.current = m
    return () => {
      mountHandle.current = null
      m.dispose()
    }
  }, [meta, movies])

  useEffect(() => {
    const m = mountHandle.current
    if (!m) return

    useGalaxyInteractionStore.setState({ zCurrent, zVisWindow, selectedMovieId })

    const gm = m.galaxyMaterial
    gm.uniforms.uActiveSizeMul.value = uActiveSizeMul
    gm.uniforms.uBgSizeMul.value = uBgSizeMul
    gm.uniforms.uLMin.value = uLMin
    gm.uniforms.uLMax.value = uLMax
    gm.uniforms.uChroma.value = uChroma
    gm.uniforms.uSizeScale.value = uSizeScale

    const b = window.__bloom
    if (b) {
      if (postProcessBloom) b.enable()
      else b.disable()
      b.strength = bloomStrength
      b.radius = bloomRadius
      b.threshold = bloomThreshold
    }
  }, [
    zCurrent,
    zVisWindow,
    uActiveSizeMul,
    uBgSizeMul,
    uLMin,
    uLMax,
    uChroma,
    uSizeScale,
    postProcessBloom,
    bloomStrength,
    bloomRadius,
    bloomThreshold,
    selectedMovieId,
  ])

  /** P8.3 CPU Perlin — only recompute when planet tuning knobs change (not every zCurrent tick). */
  useEffect(() => {
    const m = mountHandle.current
    if (!m) return
    const pu = m.selectionPlanet.material.uniforms
    pu.uScale.value = planetUScale
    pu.uOctaves.value = planetOctaves
    pu.uPersistence.value = planetPersistence
    pu.uAreaRatio.value = planetAreaRatio
    m.selectionPlanet.syncCpuNoiseFromUniforms()
  }, [planetUScale, planetOctaves, planetPersistence, planetAreaRatio])

  return <div ref={rootRef} className="h-full min-h-[480px] w-full bg-black" />
}
