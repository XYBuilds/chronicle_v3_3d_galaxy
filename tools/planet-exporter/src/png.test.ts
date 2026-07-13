import { describe, expect, it } from 'vitest'
import { assertPngSafe } from './png.js'

describe('planet exporter PNG protocol', () => {
  it('rejects malformed and edge-touching images', () => {
    expect(() => assertPngSafe(Buffer.from('bad'), 8)).toThrow('signature')
  })
})