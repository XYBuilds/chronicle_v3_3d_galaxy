import { loadGalaxyData } from '@/utils/loadGalaxyData'
import { findExportMovie, indexGalaxyMovies } from './request'
import { computeGlobalPlanetRadius } from './sizing'
import {
  p3910BloomStrengthZeroVisualConfigInput,
  p3910ProductionVisualConfigInput,
  parseP3910BloomStrengthZeroRequest,
  renderP3910BloomStrengthZeroPlanetImage,
} from './p3910BloomStrengthZeroDiagnostics'

async function main(): Promise<void> {
  let failureKind: 'data' | 'render' = 'render'
  try {
    const request = parseP3910BloomStrengthZeroRequest(window.location.search)
    failureKind = 'data'
    const data = await loadGalaxyData(request.dataUrl)
    const index = indexGalaxyMovies(data)
    const movie = findExportMovie(index, request.movieId)
    console.log(`[P39.10 diagnostics] movies=${index.size} targetId=${request.movieId} strength=0 sample=${JSON.stringify({ id: movie.id, title: movie.title, rating: movie.vote_average, genres: movie.genres })}`)
    const globalRadius = computeGlobalPlanetRadius(data.movies, request.sizeRoot)
    failureKind = 'render'
    const canvas = document.createElement('canvas')
    canvas.width = request.resolution
    canvas.height = request.resolution
    document.body.style.margin = '0'
    document.body.style.background = 'transparent'
    document.body.append(canvas)
    const result = renderP3910BloomStrengthZeroPlanetImage({ canvas, movie, meta: data.meta, globalRadius, ...request })
    const renderer = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!renderer) throw new Error('[P39.10 diagnostics] WebGL initialization failed')
    const gl = renderer as WebGLRenderingContext
    document.body.dataset.maxTextureSize = String(gl.getParameter(gl.MAX_TEXTURE_SIZE))
    document.body.dataset.webglRenderer = String(gl.getParameter(gl.RENDERER) ?? 'unknown')
    document.body.dataset.dataVersion = data.meta.version
    document.body.dataset.visualHash = p3910BloomStrengthZeroVisualConfigInput(p3910ProductionVisualConfigInput(request.sizeRoot))
    document.body.dataset.visualDiagnostics = JSON.stringify(result.diagnostics)
    document.body.dataset.exportReady = '1'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    document.body.dataset.exportFailureKind = failureKind
    document.body.dataset.exportError = message
  }
}

void main()