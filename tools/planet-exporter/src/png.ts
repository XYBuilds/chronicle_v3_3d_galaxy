import { inflateSync } from 'node:zlib'

export type PngInspection = {
  width: number
  height: number
  colorType: number
  alphaPixels: number
  bounds: { left: number; top: number; right: number; bottom: number } | null
}

type PngHeader = {
  width: number
  height: number
  bitDepth: number
  colorType: number
  compression: number
  filter: number
  interlace: number
}

const PNG_SIGNATURE = '89504e470d0a1a0a'

// Bloom's separable blur may leave a one-unit alpha tail at the canvas edge.
// It is invisible in 8-bit output and must not be treated as geometric cropping.
const VISIBLE_ALPHA_MIN = 2

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance ? above : upperLeft
}

function readPngChunks(png: Buffer): { header: PngHeader; imageData: Buffer } {
  if (png.length < 8 || png.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) {
    throw new Error('PNG signature invalid')
  }

  let position = 8
  let header: PngHeader | undefined
  let reachedEnd = false
  const imageChunks: Buffer[] = []

  while (position + 12 <= png.length) {
    const length = png.readUInt32BE(position)
    const chunkEnd = position + 12 + length
    if (chunkEnd > png.length) throw new Error('PNG chunk exceeds input length')
    const type = png.subarray(position + 4, position + 8).toString('ascii')
    const body = png.subarray(position + 8, position + 8 + length)

    if (type === 'IHDR') {
      if (length !== 13) throw new Error('PNG IHDR length invalid')
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        bitDepth: body[8]!,
        colorType: body[9]!,
        compression: body[10]!,
        filter: body[11]!,
        interlace: body[12]!,
      }
    } else if (type === 'IDAT') {
      imageChunks.push(body)
    } else if (type === 'IEND') {
      reachedEnd = true
      break
    }
    position = chunkEnd
  }

  if (!header || !reachedEnd || imageChunks.length === 0) throw new Error('PNG required chunks missing')
  if (!header.width || !header.height || header.bitDepth !== 8 || header.colorType !== 6) {
    throw new Error('PNG must be non-empty 8-bit RGBA')
  }
  if (header.compression !== 0 || header.filter !== 0 || header.interlace !== 0) {
    throw new Error('PNG compression, filter, or interlace method unsupported')
  }
  return { header, imageData: Buffer.concat(imageChunks) }
}

export function inspectPng(png: Buffer): PngInspection {
  const { header, imageData } = readPngChunks(png)
  const { width, height, colorType } = header
  const stride = width * 4
  const expectedBytes = (stride + 1) * height
  const raw = inflateSync(imageData, { maxOutputLength: expectedBytes })
  if (raw.length !== expectedBytes) throw new Error('PNG decompressed byte length invalid')

  let previous = Buffer.alloc(stride)
  let offset = 0
  let alphaPixels = 0
  let left = width
  let top = height
  let right = -1
  let bottom = -1

  for (let y = 0; y < height; y += 1) {
    const filter = raw[offset++]!
    const row = Buffer.from(raw.subarray(offset, offset + stride))
    offset += stride
    for (let x = 0; x < stride; x += 1) {
      const fromLeft = x >= 4 ? row[x - 4]! : 0
      const fromAbove = previous[x]!
      const fromUpperLeft = x >= 4 ? previous[x - 4]! : 0
      if (filter === 1) row[x] = (row[x]! + fromLeft) & 255
      else if (filter === 2) row[x] = (row[x]! + fromAbove) & 255
      else if (filter === 3) row[x] = (row[x]! + Math.floor((fromLeft + fromAbove) / 2)) & 255
      else if (filter === 4) row[x] = (row[x]! + paethPredictor(fromLeft, fromAbove, fromUpperLeft)) & 255
      else if (filter !== 0) throw new Error(`PNG row filter ${filter} unsupported`)
    }
    for (let x = 0; x < width; x += 1) {
      if (row[x * 4 + 3]! < VISIBLE_ALPHA_MIN) continue
      alphaPixels += 1
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = y
    }
    previous = row
  }

  return {
    width,
    height,
    colorType,
    alphaPixels,
    bounds: right >= 0 ? { left, top, right, bottom } : null,
  }
}

export function assertPngSafe(png: Buffer, resolution: number): PngInspection {
  const inspection = inspectPng(png)
  if (inspection.width !== resolution || inspection.height !== resolution) {
    throw new Error(`PNG dimensions ${inspection.width}x${inspection.height} != ${resolution}`)
  }
  if (!inspection.bounds) throw new Error('PNG has no visible pixels')
  if (
    inspection.bounds.left === 0
    || inspection.bounds.top === 0
    || inspection.bounds.right === resolution - 1
    || inspection.bounds.bottom === resolution - 1
  ) {
    throw new Error('PNG visible bounds touch canvas edge (cropped)')
  }
  return inspection
}