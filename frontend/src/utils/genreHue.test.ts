import { describe, expect, it } from 'vitest'

import {
  hueFromGenreColor,
  pipelineRingSrgb01,
  pointColorFromHueVote,
} from './genreHue'

function angularDiffRad(a: number, b: number): number {
  let d = Math.abs(a - b) % (2 * Math.PI)
  if (d > Math.PI) d = 2 * Math.PI - d
  return d
}

describe('genreHue (P8.1)', () => {
  it('hueFromGenreColor round-trip vs pipeline ring within gamut tolerance (rad)', () => {
    const h = 3.0
    const rgb = pipelineRingSrgb01(h)
    const recovered = hueFromGenreColor(rgb)
    expect(angularDiffRad(recovered, h)).toBeLessThan(0.06)
  })

  it('pointColorFromHueVote matches CPU gold (point.vert OKLab path)', () => {
    const out = pointColorFromHueVote(0.7, 0.5, 0.4, 0.85, 0.15)
    expect(out[0]).toBeCloseTo(0.4670697010472143, 6)
    expect(out[1]).toBeCloseTo(0.7081253326694931, 6)
    expect(out[2]).toBeCloseTo(0.42300774725904583, 6)
  })
})
