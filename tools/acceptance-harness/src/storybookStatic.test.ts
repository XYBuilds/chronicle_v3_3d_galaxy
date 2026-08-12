import { describe, expect, it } from 'vitest'

import { HUD_CAPTURE_STORY_IDS, VISUAL_GATE_CAPTURE_STORY_IDS } from './storybookStatic.js'

describe('Storybook capture targets', () => {
  it('covers HUD journey groups and three Visual Gate stories', () => {
    const hud = [...HUD_CAPTURE_STORY_IDS]
    expect(new Set(hud).size).toBe(hud.length)
    expect(hud.some((id) => id.startsWith('boot-'))).toBe(true)
    expect(hud.some((id) => id.startsWith('chrome-'))).toBe(true)
    expect(hud.some((id) => id.startsWith('hover-'))).toBe(true)
    expect(hud.some((id) => id.startsWith('drawer-'))).toBe(true)
    expect(hud.some((id) => id.startsWith('timeline-'))).toBe(true)
    expect(hud).toContain('chrome-toptools--rtl')
    expect([...VISUAL_GATE_CAPTURE_STORY_IDS]).toEqual([
      'visual-gate--idle-particles',
      'visual-gate--focused-planet',
      'visual-gate--focused-bloom-debug',
    ])
  })
})
