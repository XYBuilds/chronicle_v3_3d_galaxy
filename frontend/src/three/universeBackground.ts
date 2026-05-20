import * as THREE from 'three'

/** CSS custom property synced with WebGL clear + `THREE.Scene.background` (P23.4b cosmos field). */
export const COSMOS_UNIVERSE_BG_VAR = '--cosmos-universe-bg'

/** Phase 32.2 — SSOT default for universe field background (SDR main path). */
export const COSMOS_UNIVERSE_BG_DEFAULT = '#000002'

/** Named token bundle for HUD, canvas host, and WebGL targets. */
export const UNIVERSE_BG_TOKEN = {
  cssVar: COSMOS_UNIVERSE_BG_VAR,
  defaultHex: COSMOS_UNIVERSE_BG_DEFAULT,
} as const

/**
 * Phase 32.2 — who last drove the background color.
 * `runtime` (dev console) outranks `interaction` (future UX) outranks `default`.
 */
export type UniverseBgSourceId = 'default' | 'interaction' | 'runtime'

const UNIVERSE_BG_SOURCE_PRIORITY: Record<UniverseBgSourceId, number> = {
  default: 0,
  interaction: 10,
  runtime: 100,
}

let activeUniverseBgSource: UniverseBgSourceId = 'default'
let activeUniverseBgPriority = UNIVERSE_BG_SOURCE_PRIORITY.default
let canonicalUniverseBgHex = COSMOS_UNIVERSE_BG_DEFAULT

export type UniverseBgTargets = {
  scene?: THREE.Scene | null
  renderer?: THREE.WebGLRenderer | null
}

export type UniverseBgApplyOptions = {
  source?: UniverseBgSourceId
  /** When true (default), prints css/scene/clear hex after a successful apply. */
  log?: boolean
}

export function parseUniverseBgColor(input: string | number): THREE.Color {
  const color = new THREE.Color()
  if (typeof input === 'number') {
    color.setHex(input)
  } else {
    color.set(input.trim())
  }
  return color
}

export function formatUniverseBgHex(color: THREE.Color): string {
  return `#${color.getHexString()}`
}

export function readUniverseBgHex(): string {
  if (typeof document === 'undefined') {
    return canonicalUniverseBgHex || COSMOS_UNIVERSE_BG_DEFAULT
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(COSMOS_UNIVERSE_BG_VAR).trim()
  return raw || COSMOS_UNIVERSE_BG_DEFAULT
}

/** Canonical hex last applied through this module (not live CSS unless synced). */
export function getCanonicalUniverseBgHex(): string {
  return canonicalUniverseBgHex
}

export function getActiveUniverseBgSource(): UniverseBgSourceId {
  return activeUniverseBgSource
}

function resolveTargets(targets?: THREE.Scene | null | UniverseBgTargets): UniverseBgTargets {
  if (targets == null) return {}
  if (targets instanceof THREE.Scene) return { scene: targets }
  return targets
}

function syncSceneBackground(scene: THREE.Scene, color: THREE.Color): void {
  if (scene.background instanceof THREE.Color) {
    scene.background.copy(color)
  } else {
    scene.background = color.clone()
  }
}

function syncRendererClearColor(renderer: THREE.WebGLRenderer, color: THREE.Color): void {
  renderer.setClearColor(color, 1)
}

export function readRendererClearHex(renderer: THREE.WebGLRenderer): string {
  return formatUniverseBgHex(renderer.getClearColor(new THREE.Color()))
}

export function formatUniverseBgLogLine(
  targets: UniverseBgTargets,
  source: UniverseBgSourceId,
): string {
  const css = readUniverseBgHex()
  const scene = targets.scene?.background
  const sceneHex = scene instanceof THREE.Color ? formatUniverseBgHex(scene) : 'n/a'
  const clearHex = targets.renderer ? readRendererClearHex(targets.renderer) : 'n/a'
  return (
    `[Galaxy] universe bg token css=${css} scene=${sceneHex} clear=${clearHex} ` +
    `canonical=${canonicalUniverseBgHex} source=${source} default=${COSMOS_UNIVERSE_BG_DEFAULT} ` +
    `| e.g. __galaxyUniverseBg.color='#0a1628'`
  )
}

function shouldAcceptUniverseBgSource(source: UniverseBgSourceId): boolean {
  const next = UNIVERSE_BG_SOURCE_PRIORITY[source]
  if (next < activeUniverseBgPriority) {
    console.warn(
      `[Galaxy] universe bg ignored (source=${source} priority=${next} < active=${activeUniverseBgSource} priority=${activeUniverseBgPriority})`,
    )
    return false
  }
  return true
}

/**
 * Updates HUD/canvas host (`--cosmos-universe-bg`), `scene.background`, and renderer clear color.
 * Returns applied hex. Lower-priority `source` updates are ignored (extension boundary for future UX).
 */
export function applyUniverseBackgroundColor(
  input: string | number,
  targets?: THREE.Scene | null | UniverseBgTargets,
  options?: UniverseBgApplyOptions,
): string {
  const source = options?.source ?? 'runtime'
  if (!shouldAcceptUniverseBgSource(source)) {
    return canonicalUniverseBgHex
  }

  const parsed = parseUniverseBgColor(input)
  const hex = formatUniverseBgHex(parsed)
  const resolved = resolveTargets(targets)

  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty(COSMOS_UNIVERSE_BG_VAR, hex)
  }
  if (resolved.scene) {
    syncSceneBackground(resolved.scene, parsed)
  }
  if (resolved.renderer) {
    syncRendererClearColor(resolved.renderer, parsed)
  }

  canonicalUniverseBgHex = hex
  activeUniverseBgSource = source
  activeUniverseBgPriority = UNIVERSE_BG_SOURCE_PRIORITY[source]

  const log = options?.log ?? true
  if (log) {
    console.log(formatUniverseBgLogLine(resolved, source))
  }
  return hex
}

/** Resets CSS var to stylesheet default and re-applies token default to WebGL targets. */
export function resetUniverseBackgroundColor(
  targets?: THREE.Scene | null | UniverseBgTargets,
  options?: Pick<UniverseBgApplyOptions, 'log'>,
): string {
  if (typeof document !== 'undefined') {
    document.documentElement.style.removeProperty(COSMOS_UNIVERSE_BG_VAR)
  }
  activeUniverseBgSource = 'default'
  activeUniverseBgPriority = UNIVERSE_BG_SOURCE_PRIORITY.default
  return applyUniverseBackgroundColor(COSMOS_UNIVERSE_BG_DEFAULT, targets, {
    source: 'default',
    log: options?.log ?? true,
  })
}
