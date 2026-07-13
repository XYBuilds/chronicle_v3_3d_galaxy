import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CliError, EXIT_CODES } from './args.js'
import { writeArtifactsAtomically } from './artifacts.js'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'planet-export-artifacts-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe('writeArtifactsAtomically', () => {
  it('commits the PNG and metadata together', async () => {
    const directory = await temporaryDirectory()
    const pngPath = path.join(directory, 'planet.png')
    const metadataPath = `${pngPath}.render.json`

    await writeArtifactsAtomically({ png: pngPath, metadata: metadataPath }, Buffer.from('png'), { tmdb_id: 1 })

    await expect(fs.readFile(pngPath, 'utf8')).resolves.toBe('png')
    await expect(fs.readFile(metadataPath, 'utf8')).resolves.toBe('{\n  "tmdb_id": 1\n}\n')
  })

  it('removes the committed PNG when the metadata rename fails', async () => {
    const directory = await temporaryDirectory()
    const pngPath = path.join(directory, 'planet.png')
    const metadataPath = path.join(directory, 'metadata-target')
    await fs.mkdir(metadataPath)

    await expect(writeArtifactsAtomically(
      { png: pngPath, metadata: metadataPath },
      Buffer.from('png'),
      { tmdb_id: 1 },
    )).rejects.toMatchObject<Partial<CliError>>({ exitCode: EXIT_CODES.write })

    await expect(fs.stat(pngPath)).rejects.toMatchObject({ code: 'ENOENT' })
    const entries = await fs.readdir(directory)
    expect(entries.filter((entry) => entry.endsWith('.tmp'))).toEqual([])
  })
})