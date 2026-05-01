/**
 * Cross-browser fullscreen helpers (standard + WebKit/Safari prefixes).
 */

type DocFullscreen = Document & {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => Promise<void>
}

type DocElFullscreen = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>
}

export function getGalaxyFullscreenElement(): Element | null {
  const d = document as DocFullscreen
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

export function isGalaxyFullscreenAvailable(): boolean {
  const d = document as DocFullscreen
  return Boolean(document.fullscreenEnabled || d.webkitFullscreenEnabled)
}

export async function toggleGalaxyFullscreen(): Promise<void> {
  const root = document.documentElement as DocElFullscreen
  const d = document as DocFullscreen

  if (getGalaxyFullscreenElement()) {
    if (typeof document.exitFullscreen === 'function') {
      await document.exitFullscreen()
    } else if (typeof d.webkitExitFullscreen === 'function') {
      await d.webkitExitFullscreen()
    }
    return
  }

  if (typeof root.requestFullscreen === 'function') {
    await root.requestFullscreen()
  } else if (typeof root.webkitRequestFullscreen === 'function') {
    await root.webkitRequestFullscreen()
  }
}
