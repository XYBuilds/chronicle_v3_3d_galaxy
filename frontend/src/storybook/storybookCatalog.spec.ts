import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const srcRoot = path.join(frontendRoot, 'src')
const previewSource = readFileSync(path.join(frontendRoot, '.storybook/preview.ts'), 'utf8')
const mainSource = readFileSync(path.join(frontendRoot, '.storybook/main.ts'), 'utf8')
const packageJson = JSON.parse(readFileSync(path.join(frontendRoot, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const STORY_GROUPS = ['Boot', 'Chrome', 'Hover', 'Drawer', 'Timeline', 'Visual Gate'] as const

const VISUAL_GATE_CONTROLS = [
  'sessionKind',
  'focusMovieId',
  'zCurrent',
  'zVisWindow',
  'uZCamDistance',
  'universeBgHex',
  'uSizeScale',
  'uBgSizeMul',
  'idleNearFadeEnabled',
  'idleNearFadeStartDist',
  'idleNearFadeWidth',
  'idleNearFadeMinAlpha',
  'idleZFadeMode',
  'idleZFadeOutsideAlpha',
  'uActiveSizeMul',
  'uLMin',
  'uLMax',
  'uChroma',
  'uHighRatingT',
  'uHighTierTRangeScale',
  'uLightnessRatingExponent',
  'uDistanceLightnessFloor',
  'uHuntGamma',
  'uHuntApplyMask',
  'uFocusDimChroma',
  'uFocusDimL',
  'uFocusDimMode',
  'focusNonTargetActiveAlpha',
  'focusHoveredActiveAlpha',
  'focusNeighborRadius',
  'planetUScale',
  'planetOctaves',
  'planetPersistence',
  'planetAreaRatio',
  'planetStepHeight',
  'planetStepSmoothness',
  'planetLightness',
  'planetChroma',
  'lightingEnabled',
  'lightDirX',
  'lightDirY',
  'lightDirZ',
  'keyLightIntensity',
  'flatShadingMix',
  'perlinBloomEnabled',
  'perlinBloomStrength',
  'perlinBloomRadius',
  'perlinBloomThreshold',
  'postProcessBloom',
  'bloomStrength',
  'bloomRadius',
  'bloomThreshold',
  'constellationEnabled',
  'constellationChainOpacity',
] as const

/** Accepted Variant B inventory (#372 / #383). */
const EXPECTED_STORIES = [
  'Boot/Loading/Default',
  'Boot/Loading/SearchIndexLoading',
  'Boot/Loading/SearchIndexFailed',
  'Boot/LoadFailure/NetworkFailure',
  'Boot/LoadFailure/GzipFailure',
  'Boot/LoadFailure/JsonParseFailure',
  'Chrome/SearchBar/Idle',
  'Chrome/SearchBar/MovieSuggestions',
  'Chrome/TopTools/Default',
  'Chrome/TopTools/InfoDialog',
  'Chrome/TopTools/LanguageMenu',
  'Chrome/TopTools/RTL',
  'Chrome/FocusExit/Visible',
  'Chrome/Attribution/Footer',
  'Hover/MovieTooltip/Default',
  'Hover/MovieTooltip/LongTitle',
  'Hover/MovieTooltip/NoPrimaryGenre',
  'Hover/HoverRing/Default',
  'Drawer/Default',
  'Drawer/NoPoster',
  'Drawer/BadPoster',
  'Drawer/LongCastList',
  'Drawer/EmptyCast',
  'Drawer/MissingDetails',
  'Timeline/Default',
  'Timeline/Horizontal',
  'Timeline/CameraAtMinZ',
  'Timeline/CameraAtMaxZ',
  'Timeline/WideZSpan',
  'Timeline/Interactive',
  'Timeline/InteractiveVertical',
  'Visual Gate/IdleField',
  'Visual Gate/FocusedPlanet',
  'Visual Gate/PersonSelect',
  'Visual Gate/GenreSelect',
  'Visual Gate/FocusNeighborhood',
] as const

const FORBIDDEN_FILES = [
  'src/storybook/GalaxyThreeLayerLabLevaHost.tsx',
  'src/storybook/GalaxyThreeLayerLab.tsx',
  'src/storybook/GalaxyThreeLayerLab.stories.tsx',
  'src/storybook/InstancedMeshBench.tsx',
  'src/storybook/InstancedMeshBench.stories.tsx',
  'src/storybook/HdrProofLab.tsx',
  'src/storybook/HdrProofLab.stories.tsx',
  'src/components/ScaffoldStatus.tsx',
  'src/components/ScaffoldStatus.stories.tsx',
  'src/components/ui/close-button.stories.tsx',
  'src/hud/FullscreenButton.stories.tsx',
] as const

function walkStoryFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkStoryFiles(full))
      continue
    }
    if (entry.name.endsWith('.stories.tsx') || entry.name.endsWith('.stories.ts')) {
      out.push(full)
    }
  }
  return out
}

function parseCsfInventory(source: string): string[] {
  const titleMatch = source.match(/\btitle:\s*['"]([^'"]+)['"]/)
  if (!titleMatch) return []
  const title = titleMatch[1]!
  const names = [...source.matchAll(/^export const ([A-Z][A-Za-z0-9]+)/gm)].map((m) => m[1]!)
  return names.map((name) => `${title}/${name}`)
}

function collectCatalog(): string[] {
  return walkStoryFiles(srcRoot).flatMap((file) => parseCsfInventory(readFileSync(file, 'utf8'))).sort()
}

describe('Storybook Variant B catalog', () => {
  it('orders groups Boot → Chrome → Hover → Drawer → Timeline → Visual Gate', () => {
    expect(previewSource).toMatch(/order:\s*\[([^\]]+)\]/)
    const orderMatch = previewSource.match(/order:\s*\[([^\]]+)\]/)
    expect(orderMatch).not.toBeNull()
    const order = [...orderMatch![1]!.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
    expect(order).toEqual([...STORY_GROUPS])
  })

  it('registers hud-desktop and fullscreen lab-desktop viewports without a mobile HUD viewport', () => {
    expect(previewSource).not.toMatch(/hud-mobile/)
    expect(previewSource).toMatch(/['"]hud-desktop['"]/)
    expect(previewSource).toMatch(/1280px/)
    expect(previewSource).toMatch(/800px/)
    expect(previewSource).toMatch(/['"]lab-desktop['"]/)
    expect(previewSource).toMatch(/100%/)
  })

  it('keeps a11y + docs addons and drops onboarding', () => {
    expect(mainSource).toContain('@storybook/addon-a11y')
    expect(mainSource).toContain('@storybook/addon-docs')
    expect(mainSource).not.toContain('@storybook/addon-onboarding')
  })

  it('drops leva and onboarding packages', () => {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
    expect(deps.leva).toBeUndefined()
    expect(deps['@storybook/addon-onboarding']).toBeUndefined()
  })

  it('keeps subsampleMovies.ts as the fixture SSOT', () => {
    expect(existsSync(path.join(srcRoot, 'storybook/fixtures/subsampleMovies.ts'))).toBe(true)
  })

  it('matches the HUD + five-state Visual Gate inventory', () => {
    expect(collectCatalog()).toEqual([...EXPECTED_STORIES].sort())
    expect(EXPECTED_STORIES).toHaveLength(36)
  })

  it('groups Visual Gate controls by scene object and does not use Leva', () => {
    const controls = readFileSync(path.join(srcRoot, 'storybook/visualGateControls.ts'), 'utf8')
    const stories = readFileSync(path.join(srcRoot, 'storybook/VisualGate.stories.tsx'), 'utf8')
    const argTypesBlock = controls.match(/export const visualGateArgTypes = \{([\s\S]*?)\n\} satisfies/)
    expect(argTypesBlock).not.toBeNull()
    const keys = [...argTypesBlock![1]!.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*)\s*:/gm)].map((m) => m[1])
    expect(keys).toEqual([...VISUAL_GATE_CONTROLS])
    expect(controls).toMatch(/cat\('Session'\)/)
    expect(controls).toMatch(/cat\('Camera \/ Z slab'\)/)
    expect(controls).toMatch(/cat\('Perlin planet'\)/)
    expect(controls).toMatch(/cat\('Bloom'\)/)
    expect(stories).toMatch(/argTypes:\s*visualGateArgTypes/)
    expect(stories).not.toMatch(/from ['"]leva['"]/)
    expect(controls).not.toMatch(/from ['"]leva['"]/)
  })

  it('removes retired lab, scaffold, and primitive story surfaces', () => {
    for (const rel of FORBIDDEN_FILES) {
      expect(existsSync(path.join(frontendRoot, rel)), rel).toBe(false)
    }
    const catalog = collectCatalog().join('\n')
    expect(catalog).not.toMatch(/Leva|ScaffoldStatus|InstancedMeshBench|HdrProof|CloseButton|FullscreenButton/i)
  })
})
