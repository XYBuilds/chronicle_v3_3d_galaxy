import * as THREE from 'three'

/** CSS custom property synced with `THREE.Scene.background` (P23.4b cosmos field). */
export const COSMOS_UNIVERSE_BG_VAR = '--cosmos-universe-bg'
export const COSMOS_UNIVERSE_BG_DEFAULT = '#000000'

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
  const raw = getComputedStyle(document.documentElement).getPropertyValue(COSMOS_UNIVERSE_BG_VAR).trim()
  return raw || COSMOS_UNIVERSE_BG_DEFAULT
}

/** Updates HUD/canvas host (`--cosmos-universe-bg`) and optional WebGL clear color. */
export function applyUniverseBackgroundColor(input: string | number, scene?: THREE.Scene | null): string {
  const parsed = parseUniverseBgColor(input)
  const hex = formatUniverseBgHex(parsed)
  document.documentElement.style.setProperty(COSMOS_UNIVERSE_BG_VAR, hex)
  if (scene) {
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(parsed)
    } else {
      scene.background = parsed.clone()
    }
  }
  return hex
}

export function resetUniverseBackgroundColor(scene?: THREE.Scene | null): string {
  document.documentElement.style.removeProperty(COSMOS_UNIVERSE_BG_VAR)
  return applyUniverseBackgroundColor(COSMOS_UNIVERSE_BG_DEFAULT, scene)
}
