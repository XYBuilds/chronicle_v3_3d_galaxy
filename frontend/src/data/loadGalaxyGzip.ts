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

function isGzipPayload(u8: Uint8Array): boolean {
  return u8.byteLength >= 2 && u8[0] === 0x1f && u8[1] === 0x8b
}

async function readBodyWithProgress(
  body: ReadableStream<Uint8Array>,
  totalBytes: number | null,
  onProgress?: (p: GalaxyGzipProgress) => void,
): Promise<Uint8Array> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let downloadedBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      downloadedBytes += value.byteLength
      const message =
        totalBytes !== null ? `下载 ${mb(downloadedBytes)} / ${mb(totalBytes)}` : `已下载 ${mb(downloadedBytes)}`
      emit(onProgress, { phase: 'download', downloadedBytes, totalBytes, message })
    }
  }
  const out = new Uint8Array(downloadedBytes)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

async function gunzipBuffer(u8: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      '[GalaxyData] 当前浏览器不支持 gzip 解压（DecompressionStream）。请使用 Safari 16.4+、Chrome 80+ 或 Firefox 113+。',
    )
  }
  const gzipStream = new DecompressionStream('gzip') as TransformStream<Uint8Array, Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(u8)
      controller.close()
    },
  }).pipeThrough(gzipStream)
  return new Response(stream).text()
}

/**
 * Fetch `galaxy_data.json.gz` from CDN / static host.
 *
 * **双路径**：若 HTTP 层已对 `Content-Encoding: gzip` 做透明解压（Vite preview / 常见 CDN），body 首字节为 `{`；
 * 若仍收到磁盘上的 gzip 原始字节（首两字节为 gzip 魔数），则用 `DecompressionStream` 解压后再解析。
 */
export async function fetchGunzippedJson(
  url: string,
  onProgress?: (p: GalaxyGzipProgress) => void,
): Promise<unknown> {
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
    throw new Error('[GalaxyData] 响应无 body，无法读取')
  }

  const bytes = await readBodyWithProgress(body, totalBytes, onProgress)

  let text: string
  if (isGzipPayload(bytes)) {
    emit(onProgress, {
      phase: 'decompress',
      downloadedBytes: bytes.byteLength,
      totalBytes,
      message: '解压 gzip…',
    })
    text = await gunzipBuffer(bytes)
  } else {
    text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  }

  emit(onProgress, {
    phase: 'parse',
    downloadedBytes: bytes.byteLength,
    totalBytes,
    message: '解析 JSON…',
  })

  try {
    return JSON.parse(text) as unknown
  } catch (e) {
    throw new Error(`[GalaxyData] JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`)
  }
}
