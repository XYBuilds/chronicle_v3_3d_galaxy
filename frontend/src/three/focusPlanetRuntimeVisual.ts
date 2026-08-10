import * as THREE from 'three'

import type { Meta, Movie } from '@/types/galaxy'
import type { ResolvedFocusEmissionProfile } from '@/lib/focusEmissionProfileLoader'

import {
  remapFocusEmissionIntensity,
  validateFocusEmissionRuntimeTuning,
  type FocusEmissionRuntimeTuning,
} from './focusEmissionTuning'
import { validatePerlinBloomParams, type PerlinBloomParams } from './perlinBloomContract'
import type { SelectionPlanetHandle } from './planet'
import {
  createPlanetVisualRendererHandle,
  renderPlanetVisualState,
  resolvePlanetVisualState,
  type PlanetVisualAppliedSnapshot,
  type PlanetVisualBloomHandle,
  type PlanetVisualRenderResult,
  type PlanetVisualRendererHandle,
  type PlanetVisualState,
} from './planetVisualState'

export type RuntimePlanetVisualDebugOverlay = {
  emissionTuning: FocusEmissionRuntimeTuning
  lightness: number
  keyLightIntensity: number
  flatShadingMix: number
  direction: [number, number, number]
  bloom: Pick<PerlinBloomParams, 'strength' | 'radius' | 'threshold'>
}

export type FocusPlanetRuntimeVisualDebug = {
  exponent: number
  intensityMin: number
  intensityMax: number
  readonly focus: { lightness: number }
  readonly lighting: {
    keyLightIntensity: number
    flatShadingMix: number
    direction: [number, number, number]
  }
  readonly bloom: {
    strength: number
    radius: number
    threshold: number
  }
  reset(): void
  log(): void
}

export type FocusPlanetRuntimeVisualAdapter = {
  readonly canonicalState: PlanetVisualState
  applyMovie(
    movie: Movie,
    palette: Meta['genre_palette'],
    worldRadius: number,
  ): PlanetVisualRenderResult
  readAppliedSnapshot(): PlanetVisualAppliedSnapshot | null
  productionIdentity(): {
    hashInput: string
    profileProvenance: PlanetVisualState['emissionProvenance']
    profileSource: PlanetVisualState['emissionSource']
    overrideProvenance: PlanetVisualState['overrideProvenance']
  }
  createDebugControls(): FocusPlanetRuntimeVisualDebug
}

function fail(message: string): never {
  throw new Error(`[FocusPlanetRuntimeVisual] ${message}`)
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) fail(`${label} must be finite`)
  return Object.is(value, -0) ? 0 : value
}

function normalizeDirection(value: readonly [number, number, number]): [number, number, number] {
  const direction: [number, number, number] = [
    finite(value[0], 'lighting.direction[0]'),
    finite(value[1], 'lighting.direction[1]'),
    finite(value[2], 'lighting.direction[2]'),
  ]
  const magnitude = Math.hypot(...direction)
  if (magnitude === 0) fail('lighting.direction must not be a zero vector')
  return direction.map((component) => component / magnitude) as [number, number, number]
}

function overlayFromCanonical(state: PlanetVisualState): RuntimePlanetVisualDebugOverlay {
  return {
    emissionTuning: { ...state.focus.emissionTuning },
    lightness: state.focus.lightness,
    keyLightIntensity: state.lighting.keyLightIntensity,
    flatShadingMix: state.lighting.flatShadingMix,
    direction: [...state.lighting.direction] as [number, number, number],
    bloom: {
      strength: state.bloom.strength,
      radius: state.bloom.radius,
      threshold: state.bloom.threshold,
    },
  }
}

function overlayEqualsCanonical(
  overlay: RuntimePlanetVisualDebugOverlay,
  state: PlanetVisualState,
): boolean {
  const canonical = overlayFromCanonical(state)
  return (
    overlay.emissionTuning.exponent === canonical.emissionTuning.exponent
    && overlay.emissionTuning.intensityMin === canonical.emissionTuning.intensityMin
    && overlay.emissionTuning.intensityMax === canonical.emissionTuning.intensityMax
    && overlay.lightness === canonical.lightness
    && overlay.keyLightIntensity === canonical.keyLightIntensity
    && overlay.flatShadingMix === canonical.flatShadingMix
    && overlay.direction[0] === canonical.direction[0]
    && overlay.direction[1] === canonical.direction[1]
    && overlay.direction[2] === canonical.direction[2]
    && overlay.bloom.strength === canonical.bloom.strength
    && overlay.bloom.radius === canonical.bloom.radius
    && overlay.bloom.threshold === canonical.bloom.threshold
  )
}

/**
 * Resolves the website session's canonical production visual state once the active
 * (or soft DEV legacy-fallback) profile has already been validated by the loader.
 */
export function resolveRuntimePlanetVisualState(
  profile: ResolvedFocusEmissionProfile,
  options: { bloomEnabled?: boolean } = {},
): PlanetVisualState {
  if (profile === null || typeof profile !== 'object') {
    fail('resolved focus emission profile is required')
  }
  if (profile.source !== 'active' && profile.source !== 'legacy-fallback') {
    fail(`unsupported runtime emission profile source: ${String(profile.source)}`)
  }
  const bloomEnabled = options.bloomEnabled ?? true
  console.log('[FocusPlanetRuntimeVisual] resolving canonical state', {
    profile_id: profile.provenance.profile_id,
    source: profile.source,
    bloomEnabled,
  })
  const state = resolvePlanetVisualState({
    curve: profile.lut,
    emissionProvenance: profile.provenance,
    emissionSource: profile.source,
    bloomEnabled,
  })
  console.log('[FocusPlanetRuntimeVisual] canonical state ready', {
    hashInputLength: state.hashInput.length,
    emissionSource: state.emissionSource,
    bloomEnabled: state.bloom.enabled,
  })
  return state
}

/**
 * Scene-facing adapter: applies canonical visual state through the shared render seam,
 * then optionally overlays short-lived browser debug tuning without mutating production identity.
 */
export function createFocusPlanetRuntimeVisualAdapter(input: {
  canonicalState: PlanetVisualState
  planet: SelectionPlanetHandle
  bloom: PlanetVisualBloomHandle
}): FocusPlanetRuntimeVisualAdapter {
  const { canonicalState, planet, bloom } = input
  if (canonicalState.overrideProvenance !== 'none') {
    fail('runtime adapter rejects diagnostic override provenance')
  }
  if (canonicalState.diagnosticMarker !== undefined) {
    fail('runtime adapter rejects diagnostic markers')
  }

  const renderer: PlanetVisualRendererHandle = createPlanetVisualRendererHandle(planet, bloom)
  let lastResult: PlanetVisualRenderResult | null = null
  let overlayActive = false
  let overlay = overlayFromCanonical(canonicalState)

  renderer.applyStaticState(canonicalState)

  const applyOverlayToRenderer = (result: PlanetVisualRenderResult): void => {
    if (!overlayActive || overlayEqualsCanonical(overlay, canonicalState)) return

    const uniforms = planet.material.uniforms
    uniforms.uEmissionIntensity.value = remapFocusEmissionIntensity(
      result.application.emission.profileIntensity,
      result.application.state.curve,
      overlay.emissionTuning,
    )
    uniforms.uPerlinL.value = overlay.lightness
    uniforms.uKeyLightIntensity.value = overlay.keyLightIntensity
    uniforms.uFlatShadingMix.value = overlay.flatShadingMix
    const lightDirection = uniforms.uLightDir.value as THREE.Vector3
    lightDirection.set(...overlay.direction).normalize()
    bloom.applyParams(
      validatePerlinBloomParams({
        ...canonicalState.bloom,
        ...overlay.bloom,
      }),
    )
  }

  const applyCanonicalMovie = (
    movie: Movie,
    palette: Meta['genre_palette'],
    worldRadius: number,
  ): PlanetVisualRenderResult => {
    const result = renderPlanetVisualState(
      canonicalState,
      { movie, palette, worldRadius },
      renderer,
    )
    lastResult = result
    applyOverlayToRenderer(result)
    console.log('[FocusPlanetRuntimeVisual] applied movie', {
      movieId: movie.id,
      emission: result.appliedSnapshot.emission,
      overlayActive,
      hashInputLength: canonicalState.hashInput.length,
    })
    return result
  }

  const restoreCanonicalDisplay = (): void => {
    overlay = overlayFromCanonical(canonicalState)
    overlayActive = false
    if (lastResult !== null) {
      const { movie, palette, worldRadius } = lastResult.application
      applyCanonicalMovie(movie, palette, worldRadius)
      return
    }
    renderer.applyStaticState(canonicalState)
  }

  const createDebugControls = (): FocusPlanetRuntimeVisualDebug => {
    const markOverlay = (): void => {
      overlayActive = !overlayEqualsCanonical(overlay, canonicalState)
    }

    const reapplyAfterOverlayMutation = (): void => {
      markOverlay()
      if (lastResult !== null) {
        applyOverlayToRenderer(lastResult)
      } else {
        const uniforms = planet.material.uniforms
        uniforms.uPerlinL.value = overlay.lightness
        uniforms.uKeyLightIntensity.value = overlay.keyLightIntensity
        uniforms.uFlatShadingMix.value = overlay.flatShadingMix
        const lightDirection = uniforms.uLightDir.value as THREE.Vector3
        lightDirection.set(...overlay.direction).normalize()
        bloom.applyParams(
          validatePerlinBloomParams({
            ...canonicalState.bloom,
            ...overlay.bloom,
          }),
        )
      }
    }

    const setEmissionTuning = (patch: Partial<FocusEmissionRuntimeTuning>): void => {
      overlay = {
        ...overlay,
        emissionTuning: validateFocusEmissionRuntimeTuning({
          ...overlay.emissionTuning,
          ...patch,
        }),
      }
      reapplyAfterOverlayMutation()
    }

    const controls: FocusPlanetRuntimeVisualDebug = {
      get exponent() {
        return overlay.emissionTuning.exponent
      },
      set exponent(value: number) {
        setEmissionTuning({ exponent: Number(value) })
      },
      get intensityMin() {
        return overlay.emissionTuning.intensityMin
      },
      set intensityMin(value: number) {
        setEmissionTuning({ intensityMin: Number(value) })
      },
      get intensityMax() {
        return overlay.emissionTuning.intensityMax
      },
      set intensityMax(value: number) {
        setEmissionTuning({ intensityMax: Number(value) })
      },
      focus: {
        get lightness() {
          return overlay.lightness
        },
        set lightness(value: number) {
          overlay = { ...overlay, lightness: finite(Number(value), 'focus.lightness') }
          reapplyAfterOverlayMutation()
        },
      },
      lighting: {
        get keyLightIntensity() {
          return overlay.keyLightIntensity
        },
        set keyLightIntensity(value: number) {
          overlay = {
            ...overlay,
            keyLightIntensity: finite(Number(value), 'lighting.keyLightIntensity'),
          }
          reapplyAfterOverlayMutation()
        },
        get flatShadingMix() {
          return overlay.flatShadingMix
        },
        set flatShadingMix(value: number) {
          const next = finite(Number(value), 'lighting.flatShadingMix')
          if (next < 0 || next > 1) fail('lighting.flatShadingMix must be in [0, 1]')
          overlay = { ...overlay, flatShadingMix: next }
          reapplyAfterOverlayMutation()
        },
        get direction() {
          return [...overlay.direction] as [number, number, number]
        },
        set direction(value: [number, number, number]) {
          if (!Array.isArray(value) || value.length !== 3) {
            fail('lighting.direction must be a finite [x, y, z] tuple')
          }
          overlay = { ...overlay, direction: normalizeDirection(value) }
          reapplyAfterOverlayMutation()
        },
      },
      bloom: {
        get strength() {
          return overlay.bloom.strength
        },
        set strength(value: number) {
          overlay = {
            ...overlay,
            bloom: validatePerlinBloomParams({
              ...canonicalState.bloom,
              ...overlay.bloom,
              strength: Number(value),
            }),
          }
          reapplyAfterOverlayMutation()
        },
        get radius() {
          return overlay.bloom.radius
        },
        set radius(value: number) {
          overlay = {
            ...overlay,
            bloom: validatePerlinBloomParams({
              ...canonicalState.bloom,
              ...overlay.bloom,
              radius: Number(value),
            }),
          }
          reapplyAfterOverlayMutation()
        },
        get threshold() {
          return overlay.bloom.threshold
        },
        set threshold(value: number) {
          overlay = {
            ...overlay,
            bloom: validatePerlinBloomParams({
              ...canonicalState.bloom,
              ...overlay.bloom,
              threshold: Number(value),
            }),
          }
          reapplyAfterOverlayMutation()
        },
      },
      reset() {
        restoreCanonicalDisplay()
        this.log()
      },
      log() {
        const [x, y, z] = overlay.direction
        console.log(
          `[PlanetVisual] exponent=${overlay.emissionTuning.exponent.toFixed(3)} intensityMin=${overlay.emissionTuning.intensityMin.toFixed(4)} intensityMax=${overlay.emissionTuning.intensityMax.toFixed(4)} | ` +
            `focus.lightness=${overlay.lightness.toFixed(4)} | lighting.keyLightIntensity=${overlay.keyLightIntensity.toFixed(4)} flatShadingMix=${overlay.flatShadingMix.toFixed(4)} direction=(${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}) | ` +
            `bloom strength=${overlay.bloom.strength.toFixed(4)} radius=${overlay.bloom.radius.toFixed(4)} threshold=${overlay.bloom.threshold.toFixed(4)}`,
        )
      },
    }
    return controls
  }

  return {
    canonicalState,
    applyMovie: applyCanonicalMovie,
    readAppliedSnapshot() {
      return lastResult?.appliedSnapshot ?? null
    },
    productionIdentity() {
      return {
        hashInput: canonicalState.hashInput,
        profileProvenance: canonicalState.emissionProvenance,
        profileSource: canonicalState.emissionSource,
        overrideProvenance: canonicalState.overrideProvenance,
      }
    },
    createDebugControls,
  }
}
