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
  /** Screen-space background point diameter scale (layer A). */
  uBgPointSizePx: number
  /** Multiplier on in-focus point size (`uSizeScale`). */
  uSizeScale: number
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number
  /** When set, runs the same selection path as the app (fly-to + planet). */
  selectedMovieId: number | null
  planetUScale: number
  planetOctaves: number
  planetPersistence: number
  planetThreshold: number
}

/**
 * Storybook-only host: mounts the real galaxy WebGL scene and mirrors Controls into uniforms / store.
 */
export function GalaxyThreeLayerLab(props: GalaxyThreeLayerLabProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const mountHandle = useRef<ReturnType<typeof mountGalaxyScene> | null>(null)

  const {
    meta,
    movies,
    zCurrent,
    zVisWindow,
    uBgPointSizePx,
    uSizeScale,
    bloomStrength,
    bloomRadius,
    bloomThreshold,
    selectedMovieId,
    planetUScale,
    planetOctaves,
    planetPersistence,
    planetThreshold,
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
    gm.uniforms.uBgPointSizePx.value = uBgPointSizePx
    gm.uniforms.uSizeScale.value = uSizeScale

    const b = window.__bloom
    if (b) {
      b.strength = bloomStrength
      b.radius = bloomRadius
      b.threshold = bloomThreshold
    }

    const pu = m.selectionPlanet.material.uniforms
    pu.uScale.value = planetUScale
    pu.uOctaves.value = planetOctaves
    pu.uPersistence.value = planetPersistence
    pu.uThreshold.value = planetThreshold
  }, [
    zCurrent,
    zVisWindow,
    uBgPointSizePx,
    uSizeScale,
    bloomStrength,
    bloomRadius,
    bloomThreshold,
    selectedMovieId,
    planetUScale,
    planetOctaves,
    planetPersistence,
    planetThreshold,
  ])

  return <div ref={rootRef} className="h-full min-h-[480px] w-full bg-black" />
}
