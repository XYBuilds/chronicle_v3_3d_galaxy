import { promises as fs } from 'node:fs'
import path from 'node:path'
import { CliError, EXIT_CODES } from './args.js'

export type ArtifactFiles = { png: string; metadata: string }

export async function writeArtifactsAtomically(files: ArtifactFiles, png: Buffer, metadata: unknown): Promise<void> {
  const directory = path.dirname(files.png)
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const pngTemp = path.join(directory, `.${path.basename(files.png)}.${stamp}.tmp`)
  const metadataTemp = path.join(directory, `.${path.basename(files.metadata)}.${stamp}.tmp`)
  let pngCommitted = false
  try {
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(pngTemp, png, { flag: 'wx' })
    await fs.writeFile(metadataTemp, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' })
    await fs.rename(pngTemp, files.png)
    pngCommitted = true
    await fs.rename(metadataTemp, files.metadata)
  } catch (error) {
    if (pngCommitted) await fs.rm(files.png, { force: true }).catch(() => undefined)
    throw new CliError(`artifact write failed: ${error instanceof Error ? error.message : String(error)}`, EXIT_CODES.write)
  } finally {
    await Promise.all([fs.rm(pngTemp, { force: true }), fs.rm(metadataTemp, { force: true })])
  }
}