import { useState } from 'react'

const TIMELINE_PARAM = 'timeline'

/**
 * P14.7: `?timeline=horizontal|vertical` selects Timeline HUD orientation. Omitted or invalid → vertical.
 */
export function useTimelineOrientationFromQuery(): 'vertical' | 'horizontal' {
  const [orientation] = useState<'vertical' | 'horizontal'>(() => {
    if (typeof window === 'undefined') return 'vertical'
    const q = new URLSearchParams(window.location.search).get(TIMELINE_PARAM)
    const resolved = q === 'horizontal' || q === 'vertical' ? q : 'vertical'
    if (import.meta.env.DEV) {
      console.log('[useTimelineOrientationFromQuery]', { timeline: q, orientation: resolved })
    }
    return resolved
  })
  return orientation
}
