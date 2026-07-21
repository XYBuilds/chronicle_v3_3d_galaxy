import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { assertPureBloomCore, BLOOM_CORE_PROOF } from '../src/bloomProof.js'

const root = path.resolve(import.meta.dirname, '../../..')
const output = path.join(root, 'data/runs/phase39-p39.10')
const ratings = [0, 4, 5, 10]
const tile = 750

type Rgba = { data: Buffer; width: number; height: number }

async function rgba(file: string): Promise<Rgba> {
  const image = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  if (image.info.channels !== 4 || image.info.width !== 3000 || image.info.height !== 3000) throw new Error(`expected 3000x3000 RGBA image: ${file}`)
  return { data: image.data, width: image.info.width, height: image.info.height }
}

async function main(): Promise<void> {
  const rows: unknown[] = []
  const zeroStrengthProof: unknown[] = []
  const composite: Array<{ input: Buffer; left: number; top: number }> = []
  for (let row = 0; row < ratings.length; row += 1) {
    const rating = ratings[row]!
    const offFile = path.join(output, `planet-rating-${rating}-bloom-off.png`)
    const onFile = path.join(output, `planet-rating-${rating}-bloom-on.png`)
    const zeroFile = path.join(output, `planet-rating-${rating}-bloom-on-strength-zero.png`)
    const [off, on, offPng, zeroPng, offSidecar, onSidecar, zeroSidecar] = await Promise.all([
      rgba(offFile), rgba(onFile),
      fs.readFile(offFile), fs.readFile(zeroFile),
      fs.readFile(`${offFile}.render.json`, 'utf8').then(JSON.parse),
      fs.readFile(`${onFile}.render.json`, 'utf8').then(JSON.parse),
      fs.readFile(`${zeroFile}.render.json`, 'utf8').then(JSON.parse),
    ])
    if (!offPng.equals(zeroPng)) throw new Error(`strength=0 Bloom PNG differs from Bloom OFF for rating ${rating}`)
    if (zeroSidecar.bloom !== 'on' || zeroSidecar.visual_diagnostics?.bloom?.strength !== 0) {
      throw new Error(`strength=0 sidecar contract invalid for rating ${rating}`)
    }
    zeroStrengthProof.push({
      rating,
      off_png_sha256: createHash('sha256').update(offPng).digest('hex'),
      bloom_on_strength_zero_png_sha256: createHash('sha256').update(zeroPng).digest('hex'),
      byte_identical: true,
      diagnostics: zeroSidecar.visual_diagnostics.bloom,
    })
    const coreStats = assertPureBloomCore(off, on)
    let negativeRgbChannels = 0
    let minRgbDelta = 0
    let positiveRgbChannels = 0
    let maxPositiveDelta = 0
    let alphaChangedPixels = 0
    for (let index = 0; index < off.data.length; index += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        const delta = on.data[index + channel]! - off.data[index + channel]!
        if (delta < 0) { negativeRgbChannels += 1; minRgbDelta = Math.min(minRgbDelta, delta) }
        if (delta > 0) { positiveRgbChannels += 1; maxPositiveDelta = Math.max(maxPositiveDelta, delta) }
      }
      if (on.data[index + 3] !== off.data[index + 3]) alphaChangedPixels += 1
    }
    rows.push({
      rating,
      off: { file: path.basename(offFile), metadata: path.basename(`${offFile}.render.json`), bloom: offSidecar.bloom, diagnostics: offSidecar.visual_diagnostics.bloom },
      on: { file: path.basename(onFile), metadata: path.basename(`${onFile}.render.json`), bloom: onSidecar.bloom, diagnostics: onSidecar.visual_diagnostics.bloom },
      core_bloom_stats: coreStats,
      rgb_delta: { negative_channels: negativeRgbChannels, min_delta: minRgbDelta, positive_channels: positiveRgbChannels, max_positive: maxPositiveDelta },
      alpha_changed_pixels: alphaChangedPixels,
    })
    const [offTile, onTile] = await Promise.all([sharp(offFile).resize(tile, tile).png().toBuffer(), sharp(onFile).resize(tile, tile).png().toBuffer()])
    composite.push({ input: offTile, left: 0, top: row * tile }, { input: onTile, left: tile, top: row * tile })
  }
  await sharp({ create: { width: tile * 2, height: tile * ratings.length, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite(composite.map((entry) => ({ ...entry, blend: 'over' as const })))
    .png().toFile(path.join(output, 'contact-sheet-rating-rows-off-on-columns.png'))
  await fs.writeFile(path.join(output, 'correctness-stats.json'), `${JSON.stringify({
    contract: 'pure-bloom-delta-v1', resolution: 3000,
    gpu_delta_clamped_nonnegative: true,
    png_rgb_note: '8-bit transparent PNG quantization may produce isolated -2 channel deltas; the GPU contract clamps before blending.',
    matrix: 'rows=rating(0,4,5,10); columns=bloom(off,on)',
    core_luma_assertions: {
      core_alpha_min: BLOOM_CORE_PROOF.alphaMin,
      min_positive_core_luma_fraction: BLOOM_CORE_PROOF.minPositiveCoreLumaFraction,
      min_mean_positive_core_luma_delta: BLOOM_CORE_PROOF.minMeanPositiveCoreLumaDelta,
      rationale: 'Core statistics require a meaningful positive Bloom increment; the ON/OFF ratio is recorded diagnostically.',
    },
    zero_strength_proof: zeroStrengthProof,
    nonzero_strength_contract: 'GPU adds max(composite - isolated_base, 0) only; source is not re-added.',
    png_rgb_deltas_nonnegative: false, rows,
  }, null, 2)}\n`)
  console.log(JSON.stringify({ output, ratings, rows: rows.length, contactSheet: 'contact-sheet-rating-rows-off-on-columns.png' }))
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })