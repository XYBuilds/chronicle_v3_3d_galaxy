export type EasingFn = (t: number) => number

export const easeOutCubic: EasingFn = (t) => {
  const x = Math.min(1, Math.max(0, t))
  return 1 - Math.pow(1 - x, 3)
}

export interface TransitionDriver {
  /** Eased progress in [0, 1] (1 = fully in the “on” endpoint for focus enter). */
  readonly progress: number
  /** True while a start/reverse animation is running. */
  readonly active: boolean
  /** Animate from 0 → 1 over `durationMs` (focus enter / selecting). */
  start(durationMs: number, options?: { easing?: EasingFn; onDone?: () => void }): void
  /** Animate from current `progress` → 0 over `durationMs` (focus exit / deselecting). */
  reverse(durationMs: number, options?: { easing?: EasingFn; onDone?: () => void }): void
  /** Snap to an endpoint without animation. */
  setImmediate(value: 0 | 1): void
  /** Advance animation from wall-clock `nowMs` (e.g. rAF time). */
  tick(nowMs: number): void
}

export function createTransitionDriver(): TransitionDriver {
  let progress = 0
  let running = false
  let startMs = 0
  let duration = 0
  let fromP = 0
  let toP = 0
  let easing: EasingFn = easeOutCubic
  let onDone: (() => void) | undefined

  const applyTick = (nowMs: number) => {
    if (!running) return
    const u = Math.min(1, Math.max(0, (nowMs - startMs) / duration))
    progress = fromP + (toP - fromP) * easing(u)
    if (u >= 1) {
      progress = toP
      running = false
      const cb = onDone
      onDone = undefined
      cb?.()
    }
  }

  return {
    get progress() {
      return progress
    },
    get active() {
      return running
    },
    start(durationMs, options) {
      progress = 0
      fromP = 0
      toP = 1
      duration = Math.max(1, durationMs)
      easing = options?.easing ?? easeOutCubic
      onDone = options?.onDone
      running = true
      startMs = performance.now()
    },
    reverse(durationMs, options) {
      fromP = progress
      toP = 0
      duration = Math.max(1, durationMs)
      easing = options?.easing ?? easeOutCubic
      onDone = options?.onDone
      running = true
      startMs = performance.now()
    },
    setImmediate(value) {
      running = false
      onDone = undefined
      progress = value
    },
    tick(nowMs: number) {
      applyTick(nowMs)
    },
  }
}
