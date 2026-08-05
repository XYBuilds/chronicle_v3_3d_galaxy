import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url))

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(path)
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

function sourceByRelativePath(): ReadonlyMap<string, string> {
  return new Map(
    collectSourceFiles(sourceRoot).map((path) => [
      relative(sourceRoot, path).replaceAll('\\', '/'),
      readFileSync(path, 'utf8'),
    ]),
  )
}

describe('exploration lifecycle boundary audit', () => {
  const sources = sourceByRelativePath()

  it('keeps canonical lifecycle writes inside the exploration adapter', () => {
    const lifecycleWriters = [...sources]
      .filter(([, source]) => /setState\(\{\s*explorationContext\s*:/.test(source))
      .map(([path]) => path)

    expect(lifecycleWriters).toEqual(['lib/exploration/storeAdapter.ts'])
  })

  it('keeps development tools away from the full Zustand store', () => {
    const scene = sources.get('three/scene.ts')
    expect(scene).toBeDefined()
    expect(scene).not.toMatch(/__galaxyInteraction\.store/)
    expect(scene).not.toMatch(/readonly store:\s*typeof useGalaxyInteractionStore/)

    const storeSubscribe = ['useGalaxyInteractionStore', 'subscribe'].join('.')
    const directTestSubscriptions = [...sources]
      .filter(([path, source]) => path.endsWith('.spec.ts') && source.includes(storeSubscribe))
      .map(([path]) => path)
    expect(directTestSubscriptions).toEqual([])
  })

  it('names Select collections separately from mask membership and focus neighborhoods', () => {
    const selectors = sources.get('lib/exploration/selectors.ts')
    const mask = sources.get('three/selectionMask.ts')
    const constellation = sources.get('three/constellation.ts')

    expect(selectors).toContain('collectionMovieIds')
    expect(selectors).not.toContain('selectionMovieIds')
    expect(mask).toContain('memberMovieIds')
    expect(mask).toContain('focusNeighborIds')
    expect(constellation).toContain('collectionMovieIds')
    expect(constellation).not.toContain('selectionIds')
  })
})