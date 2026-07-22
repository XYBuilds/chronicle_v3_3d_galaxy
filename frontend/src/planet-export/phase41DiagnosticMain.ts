import { loadFocusEmissionProfile } from '@/lib/focusEmissionProfileLoader'
import type { GalaxyAssetsManifest } from '@/lib/galaxyAssetUrls'
import { loadGalaxyData } from '@/utils/loadGalaxyData'
import { findExportMovie, indexGalaxyMovies } from './request'
import { computeGlobalPlanetRadius } from './sizing'
import { renderPhase41DiagnosticPlanetImage } from './renderPlanetImage'
import { parsePhase41DiagnosticRequest, resolvePhase41DiagnosticRequest } from './phase41DiagnosticRequest'
import { toPhase41RenderOverride } from './phase41DiagnosticProfile'

async function main(): Promise<void> {
  let failureKind: 'data' | 'render' = 'render'
  try {
    const request = parsePhase41DiagnosticRequest(window.location.search)
    const manifest: GalaxyAssetsManifest = {
      galaxy_data_gzip_url: request.dataUrl,
      data_version: 'diagnostic-request',
      ...(request.profilePointer === undefined ? {} : { focus_emission_profile: request.profilePointer }),
    }
    const resolvedEmission = await loadFocusEmissionProfile({
      manifest,
      profileUrl: request.profileUrl,
      allowLegacyFallback: request.allowLegacyProfile === true,
    })
    const profile = resolvePhase41DiagnosticRequest(request, {
      curve: resolvedEmission.lut,
      provenance: resolvedEmission.provenance,
      source: resolvedEmission.source,
    })
    failureKind = 'data'
    const data = await loadGalaxyData(request.dataUrl)
    const index = indexGalaxyMovies(data)
    const movie = findExportMovie(index, request.movieId)
    console.log(
      `[Phase41 diagnostic] movies=${index.size} targetId=${request.movieId} override=${profile.overrideProvenance} sample=${JSON.stringify({ id: movie.id, title: movie.title, rating: movie.vote_average, genres: movie.genres })} visualConfigInput=${profile.resolvedVisualConfigInput}`,
    )
    const globalRadius = computeGlobalPlanetRadius(data.movies, request.sizeRoot)
    failureKind = 'render'
    const canvas = document.createElement('canvas')
    canvas.width = request.resolution
    canvas.height = request.resolution
    document.body.style.margin = '0'
    document.body.style.background = 'transparent'
    document.body.append(canvas)
    const result = renderPhase41DiagnosticPlanetImage({
      canvas,
      movie,
      meta: data.meta,
      globalRadius,
      ...request,
      visualConfig: profile.visualConfig,
      diagnosticOverride: toPhase41RenderOverride(profile),
      bloomParamsOverride: profile.bloom,
    })
    const renderer = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!renderer) throw new Error('[Phase41 diagnostic] WebGL initialization failed')
    const gl = renderer as WebGLRenderingContext
    document.body.dataset.maxTextureSize = String(gl.getParameter(gl.MAX_TEXTURE_SIZE))
    document.body.dataset.webglRenderer = String(gl.getParameter(gl.RENDERER) ?? 'unknown')
    document.body.dataset.dataVersion = data.meta.version
    document.body.dataset.visualHash = profile.resolvedVisualConfigInput
    document.body.dataset.visualDiagnostics = JSON.stringify({
      ...result.diagnostics,
      phase41_resolved_profile: {
        ...profile,
        direction: result.diagnostics.key_light.direction,
        camera: result.diagnostics.camera,
        seed: result.diagnostics.noise.seed,
        rotation: result.diagnostics.rotation,
      },
    })
    document.body.dataset.exportReady = '1'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    document.body.dataset.exportFailureKind = failureKind
    document.body.dataset.exportError = message
  }
}

void main()