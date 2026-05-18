/**
 * Export site icons from frontend/icons/source SVGs into frontend/public.
 * Run: npm run icons:export (from frontend workspace)
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = join(__dirname, '..', 'icons', 'source')
const OUT_DIR = join(__dirname, '..', 'public')

/** @type {{ src: string; out: string; size: number }[]} */
const PNG_EXPORTS = [
  { src: 'tmc-tp.svg', out: 'favicon-16.png', size: 16 },
  { src: 'tmc-tp.svg', out: 'favicon-32.png', size: 32 },
  { src: 'tmc-bg.svg', out: 'apple-touch-icon.png', size: 180 },
  { src: 'tmc-bg.svg', out: 'icon-192.png', size: 192 },
  { src: 'themoviecosmos-bg.svg', out: 'icon-512.png', size: 512 },
  { src: 'tmc-bg.svg', out: 'icon-maskable-512.png', size: 512 },
]

mkdirSync(OUT_DIR, { recursive: true })

copyFileSync(join(SRC_DIR, 'tmc-tp.svg'), join(OUT_DIR, 'favicon.svg'))
console.log('[icons] favicon.svg <= tmc-tp.svg')

for (const { src, out, size } of PNG_EXPORTS) {
  const input = join(SRC_DIR, src)
  const output = join(OUT_DIR, out)
  await sharp(input, { density: Math.max(72, Math.ceil((size / 180) * 300)) })
    .resize(size, size)
    .png()
    .toFile(output)
  console.log(`[icons] ${out} (${size}px) <= ${src}`)
}

// Multi-size favicon.ico (16 + 32) from tmc transparent
const ico16 = await sharp(join(SRC_DIR, 'tmc-tp.svg'), { density: 150 })
  .resize(16, 16)
  .png()
  .toBuffer()
const ico32 = await sharp(join(SRC_DIR, 'tmc-tp.svg'), { density: 150 })
  .resize(32, 32)
  .png()
  .toBuffer()

// sharp does not write .ico; use png32 only via to-ico if available — write 32px as fallback ico body
const toIco = (await import('to-ico')).default
const ico = await toIco([ico16, ico32])
await import('node:fs/promises').then((fs) =>
  fs.writeFile(join(OUT_DIR, 'favicon.ico'), ico),
)
console.log('[icons] favicon.ico (16+32) <= tmc-tp.svg')

console.log('[icons] done ->', OUT_DIR)
