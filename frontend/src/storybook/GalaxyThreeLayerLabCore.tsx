import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import {
  dispatchExplorationIntent,
  readExplorationContext,
} from '@/lib/exploration'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { STORYBOOK_GENRE_SELECT, STORYBOOK_PERSON_SELECT, type VisualGateSessionKind } from '@/storybook/visualGateSessions'
import type { VisualGateProps } from '@/storybook/visualGateControls'
import { mountGalaxyScene } from '@/three/scene'
import { LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE } from '@/three/focusEmission'
import { resolveRuntimePlanetVisualState } from '@/three/focusPlanetRuntimeVisual'
import { PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE } from '@/three/productionFocusEmissionProfile'
import { applyUniverseBackgroundColor } from '@/three/universeBackground'
import type { Meta, Movie } from '@/types/galaxy'

const STORYBOOK_PLANET_VISUAL_STATE = resolveRuntimePlanetVisualState({
  lut: PRODUCTION_FOCUS_EMISSION_CDF_LUT_PROFILE,
  provenance: LEGACY_FOCUS_EMISSION_FALLBACK_PROVENANCE,
  source: 'legacy-fallback',
}, { bloomEnabled: true })

function synchronizeLabSession(sessionKind: VisualGateSessionKind, focusMovieId: number | null): void {
  if (sessionKind === 'person') {
    dispatchExplorationIntent({ type: 'select/entered', session: STORYBOOK_PERSON_SELECT })
    if (focusMovieId !== null) {
      dispatchExplorationIntent({
        type: 'focus/requested',
        movieId: focusMovieId,
        policy: 'preserve-if-member',
      })
    } else if (readExplorationContext().kind === 'focus') {
      dispatchExplorationIntent({ type: 'focus/exited' })
    }
    return
  }
  if (sessionKind === 'genre') {
    dispatchExplorationIntent({ type: 'select/entered', session: STORYBOOK_GENRE_SELECT })
    if (focusMovieId !== null) {
      dispatchExplorationIntent({
        type: 'focus/requested',
        movieId: focusMovieId,
        policy: 'preserve-if-member',
      })
    } else if (readExplorationContext().kind === 'focus') {
      dispatchExplorationIntent({ type: 'focus/exited' })
    }
    return
  }
  if (focusMovieId !== null) {
    dispatchExplorationIntent({
      type: 'focus/requested',
      movieId: focusMovieId,
      policy: 'replace',
    })
    return
  }
  if (readExplorationContext().kind === 'focus') {
    dispatchExplorationIntent({ type: 'focus/exited' })
  }
  if (readExplorationContext().kind === 'select') {
    dispatchExplorationIntent({ type: 'select/cleared' })
  }
}

export type GalaxyThreeLayerLabProps = VisualGateProps & {
  meta: Pick<Meta, 'z_range' | 'xy_range' | 'count' | 'genre_palette'>
  movies: Movie[]
}

/**
 * Storybook Visual Gate host: mounts the real galaxy WebGL scene and mirrors tuning props into uniforms / store.
 */
export function GalaxyThreeLayerLabCore(props: GalaxyThreeLayerLabProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const mountHandle = useRef<ReturnType<typeof mountGalaxyScene> | null>(null)

  const {
    meta,
    movies,
    sessionKind,
    focusMovieId,
    zCurrent,
    zVisWindow,
    uZCamDistance,
    universeBgHex,
    uActiveSizeMul,
    uBgSizeMul,
    idleNearFadeEnabled,
    idleNearFadeStartDist,
    idleNearFadeWidth,
    idleNearFadeMinAlpha,
    idleZFadeMode,
    idleZFadeOutsideAlpha,
    uLMin,
    uLMax,
    uHighRatingT,
    uHighTierTRangeScale,
    uLightnessRatingExponent,
    uDistanceLightnessFloor,
    uChroma,
    uHuntGamma,
    uHuntApplyMask,
    uSizeScale,
    postProcessBloom,
    bloomStrength,
    bloomRadius,
    bloomThreshold,
    perlinBloomEnabled,
    perlinBloomStrength,
    perlinBloomRadius,
    perlinBloomThreshold,
    planetUScale,
    planetOctaves,
    planetPersistence,
    planetAreaRatio,
    planetStepHeight,
    planetStepSmoothness,
    planetLightness,
    planetChroma,
    lightingEnabled,
    lightDirX,
    lightDirY,
    lightDirZ,
    keyLightIntensity,
    flatShadingMix,
    uFocusDimChroma,
    uFocusDimL,
    uFocusDimMode,
    focusNonTargetActiveAlpha,
    focusHoveredActiveAlpha,
    focusNeighborRadius,
    constellationEnabled,
    constellationChainOpacity,
  } = props

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const m = mountGalaxyScene(el, meta, movies, STORYBOOK_PLANET_VISUAL_STATE)
    mountHandle.current = m
    return () => {
      mountHandle.current = null
      m.dispose()
    }
  }, [meta, movies])

  useEffect(() => {
    synchronizeLabSession(sessionKind, focusMovieId)
  }, [sessionKind, focusMovieId])

  useEffect(() => {
    const m = mountHandle.current
    if (!m) return

    useGalaxyInteractionStore.setState({
      ...(focusMovieId === null ? { zCurrent } : {}),
      zVisWindow,
      zCamDistance: uZCamDistance,
      constellationEnabled,
      focusNeighborRadius,
    })

    applyUniverseBackgroundColor(universeBgHex, { scene: m.scene, renderer: m.renderer }, { source: 'runtime', log: false })

    const gm = m.galaxyMaterial
    gm.uniforms.uActiveSizeMul.value = uActiveSizeMul
    gm.uniforms.uBgSizeMul.value = uBgSizeMul
    gm.uniforms.uLMin.value = uLMin
    gm.uniforms.uLMax.value = uLMax
    gm.uniforms.uHighRatingT.value = uHighRatingT
    gm.uniforms.uHighTierTRangeScale.value = uHighTierTRangeScale
    gm.uniforms.uLightnessRatingExponent.value = uLightnessRatingExponent
    gm.uniforms.uZCamDistance.value = uZCamDistance
    gm.uniforms.uDistanceLightnessFloor.value = uDistanceLightnessFloor
    gm.uniforms.uChroma.value = uChroma
    gm.uniforms.uHuntGamma.value = uHuntGamma
    gm.uniforms.uHuntApplyMask.value = uHuntApplyMask
    gm.uniforms.uSizeScale.value = uSizeScale
    gm.uniforms.uFocusDimChroma.value = uFocusDimChroma
    gm.uniforms.uFocusDimL.value = uFocusDimL
    gm.uniforms.uFocusDimMode.value = uFocusDimMode === 1 ? 1 : 0
    gm.uniforms.uFocusNonTargetActiveAlpha.value = focusNonTargetActiveAlpha
    gm.uniforms.uFocusHoveredActiveAlpha.value = focusHoveredActiveAlpha
    gm.uniforms.uIdleNearFadeEnabled.value = idleNearFadeEnabled ? 1 : 0
    gm.uniforms.uIdleNearFadeStartDist.value = idleNearFadeStartDist
    gm.uniforms.uIdleNearFadeWidth.value = idleNearFadeWidth
    gm.uniforms.uIdleNearFadeMinAlpha.value = idleNearFadeMinAlpha
    gm.uniforms.uIdleZFadeMode.value = idleZFadeMode > 0.5 ? 1 : idleZFadeMode < -0.5 ? -1 : 0
    gm.uniforms.uIdleZFadeOutsideAlpha.value = idleZFadeOutsideAlpha

    const b = window.__bloom
    if (b) {
      if (postProcessBloom) b.enable()
      else b.disable()
      b.strength = bloomStrength
      b.radius = bloomRadius
      b.threshold = bloomThreshold
    }

    const planetVisual = window.__planetVisual
    if (planetVisual) {
      planetVisual.focus.lightness = planetLightness
      planetVisual.lighting.keyLightIntensity = keyLightIntensity
      planetVisual.lighting.flatShadingMix = flatShadingMix
      planetVisual.lighting.direction = [lightDirX, lightDirY, lightDirZ] as [number, number, number]
      planetVisual.bloom.strength = perlinBloomEnabled ? perlinBloomStrength : 0
      planetVisual.bloom.radius = perlinBloomRadius
      planetVisual.bloom.threshold = perlinBloomThreshold
    }

    const pu = m.selectionPlanet.material.uniforms
    pu.uPerlinChroma.value = planetChroma
    pu.uLightingEnabled.value = lightingEnabled ? 1 : 0
    ;(pu.uLightDir.value as THREE.Vector3).set(lightDirX, lightDirY, lightDirZ).normalize()

    m.constellation.setChainOpacity('producers', constellationChainOpacity)
    m.constellation.setChainOpacity('crew', constellationChainOpacity)
    m.constellation.setChainOpacity('cast', constellationChainOpacity)
  }, [
    zCurrent,
    zVisWindow,
    uZCamDistance,
    universeBgHex,
    uActiveSizeMul,
    uBgSizeMul,
    idleNearFadeEnabled,
    idleNearFadeStartDist,
    idleNearFadeWidth,
    idleNearFadeMinAlpha,
    idleZFadeMode,
    idleZFadeOutsideAlpha,
    uLMin,
    uLMax,
    uHighRatingT,
    uHighTierTRangeScale,
    uLightnessRatingExponent,
    uDistanceLightnessFloor,
    uChroma,
    uHuntGamma,
    uHuntApplyMask,
    uSizeScale,
    uFocusDimChroma,
    uFocusDimL,
    uFocusDimMode,
    focusNonTargetActiveAlpha,
    focusHoveredActiveAlpha,
    focusNeighborRadius,
    constellationEnabled,
    constellationChainOpacity,
    postProcessBloom,
    bloomStrength,
    bloomRadius,
    bloomThreshold,
    perlinBloomEnabled,
    perlinBloomStrength,
    perlinBloomRadius,
    perlinBloomThreshold,
    planetLightness,
    planetChroma,
    lightingEnabled,
    lightDirX,
    lightDirY,
    lightDirZ,
    keyLightIntensity,
    flatShadingMix,
    focusMovieId,
    sessionKind,
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
  }, [planetUScale, planetOctaves, planetPersistence, planetAreaRatio, focusMovieId])

  /** P11.3 — shader-only terrace uniforms (no CPU noise recompute). */
  useEffect(() => {
    const m = mountHandle.current
    if (!m) return
    const pu = m.selectionPlanet.material.uniforms
    pu.uStepHeight.value = planetStepHeight
    pu.uStepSmoothness.value = planetStepSmoothness
  }, [planetStepHeight, planetStepSmoothness, focusMovieId])

  return <div ref={rootRef} className="h-full min-h-[480px] w-full bg-black" />
}
