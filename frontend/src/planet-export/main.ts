import { loadGalaxyData } from '@/utils/loadGalaxyData'
import { parsePlanetExportRequest, findExportMovie, indexGalaxyMovies } from './request'
import { computeGlobalPlanetRadius } from './sizing'
import { planetVisualConfigHashInput } from '@/three/planetVisualDefaults'
import { planetExportVisualConfigInput } from './visualConfig'
import { renderPlanetImage } from './renderPlanetImage'

async function main(): Promise<void> {
  let failureKind: 'data' | 'render' = 'render'
  try {
    const request = parsePlanetExportRequest(window.location.search)
    failureKind = 'data'
    const data = await loadGalaxyData(request.dataUrl)
    const index = indexGalaxyMovies(data)
    const movie = findExportMovie(index, request.movieId)
    console.log(`[PlanetExport] movies=${index.size} targetId=${request.movieId} sample=${JSON.stringify({ id: movie.id, title: movie.title, size: movie.size, genres: movie.genres })}`)
    const globalRadius = computeGlobalPlanetRadius(data.movies, request.sizeRoot)
    failureKind = 'render'
    const canvas = document.createElement('canvas')
    canvas.width = request.resolution
    canvas.height = request.resolution
    document.body.style.margin = '0'
    document.body.style.background = 'transparent'
    document.body.append(canvas)
    const result = renderPlanetImage({ canvas, movie, meta: data.meta, globalRadius, ...request })
    console.assert(result.visible, '[PlanetExport] rendered planet visibility invariant')
    const renderer = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!renderer) throw new Error('[PlanetExport] WebGL initialization failed')
    const gl = renderer as WebGLRenderingContext
    document.body.dataset.maxTextureSize = String(gl.getParameter(gl.MAX_TEXTURE_SIZE))
    document.body.dataset.webglRenderer = String(gl.getParameter(gl.RENDERER) ?? 'unknown')
    document.body.dataset.dataVersion = data.meta.version
    document.body.dataset.visualHash = planetExportVisualConfigInput(
      planetVisualConfigHashInput(),
      request.sizeRoot,
    )
    document.body.dataset.visualDiagnostics = JSON.stringify(result.diagnostics)
    document.body.dataset.exportReady = '1'
    console.log(`[PlanetExport] ready movieId=${movie.id} resolution=${request.resolution} bloom=${request.bloom ? 'on' : 'off'} mode=${request.renderMode}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    document.body.dataset.exportFailureKind = failureKind
    document.body.dataset.exportError = message
  }
}

void main()