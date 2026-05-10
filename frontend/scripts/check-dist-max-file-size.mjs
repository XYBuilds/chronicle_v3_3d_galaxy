/**
 * P24.1: Cloudflare Pages rejects any single static asset > 25 MiB.
 * Run after `vite build`; fails fast if dist contains an oversized file.
 */
import fs from 'node:fs'
import path from 'node:path'

const MAX_BYTES = 25 * 1024 * 1024
const DIST_DIR = path.resolve(import.meta.dirname, '..', 'dist')

function walkFiles(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walkFiles(p, acc)
    else acc.push(p)
  }
  return acc
}

function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error('[dist-max-bytes] missing directory:', DIST_DIR)
    process.exit(1)
  }

  const files = walkFiles(DIST_DIR)
  assert(files.length > 0, '[dist-max-bytes] dist must contain at least one file')

  let maxBytes = 0
  let maxRel = ''
  const offenders = []

  for (const f of files) {
    const st = fs.statSync(f)
    assert(st.isFile(), `[dist-max-bytes] not a file: ${f}`)
    const rel = path.relative(DIST_DIR, f)
    if (st.size > maxBytes) {
      maxBytes = st.size
      maxRel = rel
    }
    if (st.size > MAX_BYTES) {
      offenders.push({ path: rel, bytes: st.size })
    }
  }

  console.log('[dist-max-bytes]', {
    distFiles: files.length,
    maxBytes,
    maxFile: maxRel,
    limitBytes: MAX_BYTES,
  })

  if (offenders.length === 0) return

  const enforce =
    process.env.DIST_MAX_BYTES_ENFORCE === '1' ||
    process.env.CI === 'true' ||
    process.env.GITHUB_ACTIONS === 'true'

  console.warn(
    '[dist-max-bytes] Files exceed Cloudflare Pages 25 MiB limit (usually copied from frontend/public/data/). Remove large galaxy exports before a production build, or rely on CI after R2 prune.',
    offenders,
  )

  if (enforce) {
    console.error('[dist-max-bytes] failing because CI/DIST_MAX_BYTES_ENFORCE is set')
    process.exit(1)
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(msg)
    process.exit(1)
  }
}

main()
