export type GalaxyGzipLoadPhase = 'download' | 'decompress' | 'parse'

export interface GalaxyGzipProgress {
  phase: GalaxyGzipLoadPhase
  downloadedBytes: number
  totalBytes: number | null
  message: string
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function emit(onProgress: ((p: GalaxyGzipProgress) => void) | undefined, p: GalaxyGzipProgress): void {
  onProgress?.(p)
}

/**
 * Fetch gzip-compressed JSON from `public/data` (or CDN), gunzip via DecompressionStream, return parsed JSON.
 * Safari ≥ 16.4 / Chrome ≥ 80 / Firefox ≥ 113.
 */
export async function fetchGunzippedJson(
  url: string,
  onProgress?: (p: GalaxyGzipProgress) => void,
): Promise<unknown> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      '[GalaxyData] 当前浏览器不支持 gzip 流式解压（DecompressionStream）。请使用 Safari 16.4+、Chrome 80+ 或 Firefox 113+。',
    )
  }

  let res: Response
  try {
    res = await fetch(url)
  } catch (e) {
    const hint = e instanceof TypeError ? '（网络错误：请检查网络或服务是否可达）' : ''
    throw new Error(
      `[GalaxyData] 请求失败 ${url}${hint}: ${e instanceof Error ? e.message : String(e)}`,
    )
  }

  if (!res.ok) {
    throw new Error(
      `[GalaxyData] HTTP ${res.status} ${res.statusText} — 请确认已部署 frontend/public/data/galaxy_data.json.gz`,
    )
  }

  const cl = res.headers.get('Content-Length')
  const parsedLen = cl !== null && cl !== '' ? Number.parseInt(cl, 10) : Number.NaN
  const totalBytes = Number.isFinite(parsedLen) ? parsedLen : null
  const body = res.body
  if (!body) {
    throw new Error('[GalaxyData] 响应无 body，无法流式读取')
  }

  let downloadedBytes = 0
  const meter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      downloadedBytes += chunk.byteLength
      const message =
        totalBytes !== null ? `下载 ${mb(downloadedBytes)} / ${mb(totalBytes)}` : `已下载 ${mb(downloadedBytes)}`
      emit(onProgress, { phase: 'download', downloadedBytes, totalBytes, message })
      controller.enqueue(chunk)
    },
  })

  emit(onProgress, {
    phase: 'decompress',
    downloadedBytes,
    totalBytes,
    message: '解压 gzip…',
  })

  const gzipStream = new DecompressionStream('gzip') as TransformStream<Uint8Array, Uint8Array>
  const inflated = body.pipeThrough(meter).pipeThrough(gzipStream)

  emit(onProgress, {
    phase: 'parse',
    downloadedBytes,
    totalBytes,
    message: '解析 JSON…',
  })

  const text = await new Response(inflated).text()

  try {
    return JSON.parse(text) as unknown
  } catch (e) {
    throw new Error(`[GalaxyData] JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`)
  }
}
