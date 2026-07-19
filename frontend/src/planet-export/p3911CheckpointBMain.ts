import { loadGalaxyData } from '@/utils/loadGalaxyData'
import { findExportMovie, indexGalaxyMovies } from './request'
import { computeGlobalPlanetRadius } from './sizing'
import { planetVisualConfigHashInput } from '@/three/planetVisualDefaults'
import { planetExportVisualConfigInput } from './visualConfig'
import {
  assertP3911CheckpointBProductionContract,
  p3911CheckpointBVisualConfigInput,
  parseP3911CheckpointBRequest,
  renderP3911CheckpointBPlanetImage,
} from './p3911CheckpointBDiagnostics'

async function main(): Promise<void> {
  let failureKind: 'data' | 'render' = 'render'
  try {
    const request = parseP3911CheckpointBRequest(window.location.search)
    assertP3911CheckpointBProductionContract()
    failureKind = 'data'
    const data = await loadGalaxyData(request.dataUrl)
    const index = indexGalaxyMovies(data)
    const movie = findExportMovie(index, request.movieId)
    console.log(`[P39.11 Checkpoint B] candidates=3 movies=${index.size} targetId=${request.movieId} exponent=${request.emissionExponent} sample=${JSON.stringify({ id: movie.id, title: movie.title, rating: movie.vote_average, genres: movie.genres })}`)
    const globalRadius = computeGlobalPlanetRadius(data.movies, request.sizeRoot)
    failureKind = 'render'
    const canvas = document.createElement('canvas')
    canvas.width = request.resolution
    canvas.height = request.resolution
    document.body.style.margin = '0'
    document.body.style.background = 'transparent'
    document.body.append(canvas)
    const result = renderP3911CheckpointBPlanetImage({
      canvas,
      movie,
      meta: data.meta,
      globalRadius,
      ...request,
      diagnosticsEmissionExponent: request.emissionExponent,
    })
    console.assert(result.visible, '[P39.11 diagnostics] rendered planet visibility invariant')
    const renderer = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!renderer) throw new Error('[P39.11 diagnostics] WebGL initialization failed')
    const gl = renderer as WebGLRenderingContext
    document.body.dataset.maxTextureSize = String(gl.getParameter(gl.MAX_TEXTURE_SIZE))
    document.body.dataset.webglRenderer = String(gl.getParameter(gl.RENDERER) ?? 'unknown')
    document.body.dataset.dataVersion = data.meta.version
    const productionVisualConfig = planetExportVisualConfigInput(
      planetVisualConfigHashInput(),
      request.sizeRoot,
      request.bloomParamsOverride,
    )
    document.body.dataset.visualHash = p3911CheckpointBVisualConfigInput(productionVisualConfig, request.emissionExponent)
    document.body.dataset.visualDiagnostics = JSON.stringify(result.diagnostics)
    document.body.dataset.exportReady = '1'
    console.log(`[P39.11 Checkpoint B] ready movieId=${movie.id} resolution=${request.resolution} exponent=${request.emissionExponent} key=0.35 bloom=off mode=${request.renderMode}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    document.body.dataset.exportFailureKind = failureKind
    document.body.dataset.exportError = message
  }
}

void main()