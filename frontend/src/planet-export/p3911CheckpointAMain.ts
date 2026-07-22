import { loadGalaxyData } from '@/utils/loadGalaxyData'
import { findExportMovie, indexGalaxyMovies } from './request'
import { computeGlobalPlanetRadius } from './sizing'
import { p3911LegacyFrozenProfileVisualConfigHashInput } from '@/three/planetVisualDefaults'
import { planetExportVisualConfigInput } from './visualConfig'
import {
  assertP3911CheckpointAEmissionContract,
  p3911CheckpointAVisualConfigInput,
  parseP3911CheckpointARequest,
  renderP3911CheckpointAPlanetImage,
} from './p3911CheckpointADiagnostics'

async function main(): Promise<void> {
  let failureKind: 'data' | 'render' = 'render'
  try {
    const request = parseP3911CheckpointARequest(window.location.search)
    assertP3911CheckpointAEmissionContract()
    failureKind = 'data'
    const data = await loadGalaxyData(request.dataUrl)
    const index = indexGalaxyMovies(data)
    const movie = findExportMovie(index, request.movieId)
    console.log(`[P39.11 Checkpoint A] movies=${index.size} targetId=${request.movieId} key=${request.keyLightIntensity} sample=${JSON.stringify({ id: movie.id, title: movie.title, size: movie.size, genres: movie.genres })}`)
    const globalRadius = computeGlobalPlanetRadius(data.movies, request.sizeRoot)
    failureKind = 'render'
    const canvas = document.createElement('canvas')
    canvas.width = request.resolution
    canvas.height = request.resolution
    document.body.style.margin = '0'
    document.body.style.background = 'transparent'
    document.body.append(canvas)
    const result = renderP3911CheckpointAPlanetImage({
      canvas,
      movie,
      meta: data.meta,
      globalRadius,
      ...request,
      diagnosticsKeyLightIntensity: request.keyLightIntensity,
    })
    console.assert(result.visible, '[P39.11 diagnostics] rendered planet visibility invariant')
    const renderer = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!renderer) throw new Error('[P39.11 diagnostics] WebGL initialization failed')
    const gl = renderer as WebGLRenderingContext
    document.body.dataset.maxTextureSize = String(gl.getParameter(gl.MAX_TEXTURE_SIZE))
    document.body.dataset.webglRenderer = String(gl.getParameter(gl.RENDERER) ?? 'unknown')
    document.body.dataset.dataVersion = data.meta.version
    const productionVisualConfig = planetExportVisualConfigInput(
      p3911LegacyFrozenProfileVisualConfigHashInput(),
      request.sizeRoot,
    )
    document.body.dataset.visualHash = p3911CheckpointAVisualConfigInput(productionVisualConfig, request.keyLightIntensity)
    document.body.dataset.visualDiagnostics = JSON.stringify(result.diagnostics)
    document.body.dataset.exportReady = '1'
    console.log(`[P39.11 Checkpoint A] ready movieId=${movie.id} resolution=${request.resolution} key=${request.keyLightIntensity} bloom=off mode=${request.renderMode}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    document.body.dataset.exportFailureKind = failureKind
    document.body.dataset.exportError = message
  }
}

void main()