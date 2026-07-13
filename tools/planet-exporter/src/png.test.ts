import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { assertPngSafe } from './png.js'

function rgbaPng(width: number, height: number, pixels: number[][]): Buffer {
  const raw = Buffer.concat(pixels.map((pixel) => Buffer.from([0, ...pixel])))
  const chunk = (type: string, body: Buffer): Buffer => {
    const result = Buffer.alloc(12 + body.length)
    result.writeUInt32BE(body.length, 0)
    result.write(type, 4, 'ascii')
    body.copy(result, 8)
    return result
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

describe('planet exporter PNG protocol', () => {
  it('rejects malformed and meaningful edge-touching images', () => {
    expect(() => assertPngSafe(Buffer.from('bad'), 8)).toThrow('signature')
    expect(() => assertPngSafe(rgbaPng(1, 1, [[255, 255, 255, 2]]), 1)).toThrow('cropped')
  })

  it('ignores an invisible one-unit Bloom alpha tail at the edge', () => {
    const transparent = [0, 0, 0, 0]
    const edgeTail = [255, 255, 255, 1]
    const visible = [255, 255, 255, 2]
    const png = rgbaPng(3, 3, [
      [...edgeTail, ...transparent, ...transparent],
      [...transparent, ...visible, ...transparent],
      [...transparent, ...transparent, ...transparent],
    ])
    expect(assertPngSafe(png, 3)).toMatchObject({ alphaPixels: 1, bounds: { left: 1, top: 1, right: 1, bottom: 1 } })
  })
})