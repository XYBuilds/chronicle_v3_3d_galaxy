import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const THREE_ROOT = path.dirname(fileURLToPath(import.meta.url))

function read(relativePath: string): string {
  return fs.readFileSync(path.join(THREE_ROOT, relativePath), 'utf-8')
}

describe('cover WebGL retirement contract', () => {
  it('keeps ordinary active shell sizing aligned between shader and ray picking', () => {
    expect(read('shaders/galaxyActive.vert.glsl')).toContain(
      'float sActive = inFocus * uSizeScale * uActiveSizeMul * aSize;',
    )
    expect(read('screenRadius.ts')).toContain('const R = inF * uSizeScale * uActiveSizeMul * m.size')
  })

  it('removes cover uniforms and picking branches from shader and interaction paths', () => {
    for (const relativePath of [
      'scene.ts',
      'interaction.ts',
      'screenRadius.ts',
      'galaxyMeshes.ts',
      'shaders/galaxyIdle.vert.glsl',
      'shaders/galaxyActive.vert.glsl',
    ]) {
      const source = read(relativePath)
      expect(source).not.toMatch(/uCover|coverMode|todayMovieId|exitCover/)
    }
  })
})