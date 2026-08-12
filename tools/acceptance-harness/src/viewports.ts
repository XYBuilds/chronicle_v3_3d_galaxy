/** Accepted Chronicle acceptance viewports (#371 / #381). */

export type AcceptanceViewport = {
  readonly id: string
  readonly width: number
  readonly height: number
  readonly deviceScaleFactor: number
  readonly surface: 'app' | 'visual-gate' | 'hud'
}

export const ACCEPTANCE_VIEWPORTS = {
  'app-desktop': {
    id: 'app-desktop',
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    surface: 'app',
  },
  'visual-gate': {
    id: 'visual-gate',
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    surface: 'visual-gate',
  },
  'hud-mobile': {
    id: 'hud-mobile',
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    surface: 'hud',
  },
  'hud-desktop': {
    id: 'hud-desktop',
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    surface: 'hud',
  },
} as const satisfies Record<string, AcceptanceViewport>

export type AcceptanceViewportId = keyof typeof ACCEPTANCE_VIEWPORTS
