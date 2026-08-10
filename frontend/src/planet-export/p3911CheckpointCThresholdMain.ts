import { loadGalaxyData } from '@/utils/loadGalaxyData'
import { findExportMovie, indexGalaxyMovies } from './request'
import { computeGlobalPlanetRadius } from './sizing'
import {
  assertP3911CheckpointCThresholdProductionContract,
  parseP3911CheckpointCThresholdRequest,
  renderP3911CheckpointCThresholdPlanetImage,
} from './p3911CheckpointCThresholdDiagnostics'
import { requireP39RendererEvidence } from './p39LegacyVisualState'

async function main(): Promise<void> {
  let failureKind: 'data' | 'render' = 'render'
  try {
    const request = parseP3911CheckpointCThresholdRequest(window.location.search)
    assertP3911CheckpointCThresholdProductionContract()
    failureKind = 'data'
    const data = await loadGalaxyData(request.dataUrl)
    const index = indexGalaxyMovies(data)
    const movie = findExportMovie(index, request.movieId)
    console.log(`[P39.11 Checkpoint C1] candidates=3 movies=${index.size} targetId=${request.movieId} threshold=${request.bloomThreshold} sample=${JSON.stringify({ id: movie.id, rating: movie.vote_average, genres: movie.genres })}`)
    const globalRadius = computeGlobalPlanetRadius(data.movies, request.sizeRoot)
    failureKind = 'render'
    const canvas = document.createElement('canvas')
    canvas.width = request.resolution
    canvas.height = request.resolution
    document.body.style.margin = '0'
    document.body.style.background = 'transparent'
    document.body.append(canvas)
    const result = renderP3911CheckpointCThresholdPlanetImage({ canvas, movie, meta: data.meta, globalRadius, ...request, diagnosticsBloomThreshold: request.bloomThreshold })
    console.assert(result.visible, '[P39.11 diagnostics] rendered planet visibility invariant')
    const renderer = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!renderer) throw new Error('[P39.11 diagnostics] WebGL initialization failed')
    const gl = renderer as WebGLRenderingContext
    document.body.dataset.maxTextureSize = String(gl.getParameter(gl.MAX_TEXTURE_SIZE))
    document.body.dataset.webglRenderer = String(gl.getParameter(gl.RENDERER) ?? 'unknown')
    document.body.dataset.dataVersion = data.meta.version
    document.body.dataset.visualHash = requireP39RendererEvidence(
      result.diagnostics,
      'p39.11-checkpoint-c1-threshold-pure-delta-v1',
    )
    document.body.dataset.visualDiagnostics = JSON.stringify(result.diagnostics)
    document.body.dataset.exportReady = '1'
    console.log(`[P39.11 Checkpoint C1] ready movieId=${movie.id} resolution=${request.resolution} threshold=${request.bloomThreshold} strength=.005 radius=1 bloom=on`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    document.body.dataset.exportFailureKind = failureKind
    document.body.dataset.exportError = message
  }
}

void main()