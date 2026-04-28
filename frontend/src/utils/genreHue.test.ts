import { describe, expect, it } from 'vitest'

import {
  genreHueForGenreName,
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

  it('pointColorFromHueVote matches CPU gold (OKLab path, same as galaxy vert)', () => {
    const out = pointColorFromHueVote(0.7, 0.5, 0.4, 0.85, 0.15)
    expect(out[0]).toBeCloseTo(0.8183484375234074, 6)
    expect(out[1]).toBeCloseTo(0.38652820698316337, 6)
    expect(out[2]).toBeCloseTo(0.22750723655951766, 6)
  })

  it('genreHueForGenreName follows Python sorted order, not localeCompare order', () => {
    const palette = {
      'Science Fiction': '#83ABFF',
      'TV Movie': '#A4A0FF',
      Thriller: '#C097F6',
    }

    expect(genreHueForGenreName('TV Movie', palette)).toBeCloseTo((2 * Math.PI) / 3, 12)
    expect(genreHueForGenreName('Thriller', palette)).toBeCloseTo((4 * Math.PI) / 3, 12)
  })
})
