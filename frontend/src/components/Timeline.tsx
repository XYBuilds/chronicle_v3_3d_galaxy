import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

import { getGalaxyCameraZ, setGalaxyCameraZ, subscribeGalaxyCameraZ } from '@/lib/galaxyCameraZBridge'
import { useStrings } from '@/lib/strings'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { cn } from '@/lib/utils'

function yearTickList(zMinDec: number, zMaxDec: number): number[] {
  const lo = Math.floor(zMinDec)
  const hi = Math.ceil(zMaxDec)
  const span = Math.max(1, hi - lo)
  const desired = 8
  const rough = span / desired
  const bases = [1, 2, 5, 10, 20, 25, 50, 100, 250, 500, 1000]
  let step = bases[bases.length - 1]
  for (const b of bases) {
    if (rough <= b) {
      step = b
      break
    }
  }
  const ticks: number[] = []
  const first = Math.ceil(lo / step) * step
  for (let y = first; y <= hi; y += step) {
    if (y >= lo) ticks.push(y)
  }
  if (ticks.length === 0) ticks.push(lo)
  return ticks
}

/** Vertical track: bottom = zMin, top = zMax (fraction from bottom). */
function zToTrackBottomFraction(z: number, zMin: number, zMax: number): number {
  const span = zMax - zMin
  if (!(span > 0)) return 0.5
  const t = (z - zMin) / span
  return Math.min(1, Math.max(0, t))
}

/** Horizontal track: left = zMin, right = zMax (fraction from left). */
function zToTrackLeftFraction(z: number, zMin: number, zMax: number): number {
  return zToTrackBottomFraction(z, zMin, zMax)
}

/** Normalized axis distance (fraction of track): tick labels fade linearly within this radius of the thumb. */
const TICK_LABEL_FADE_RADIUS_FRAC = 0.07

/** Distance → opacity: 0 at thumb, 1 at or beyond `TICK_LABEL_FADE_RADIUS_FRAC` (linear). */
function tickLabelOpacityNearThumb(tickFraction: number, thumbFraction: number): number {
  const d = Math.abs(tickFraction - thumbFraction)
  return Math.min(1, d / TICK_LABEL_FADE_RADIUS_FRAC)
}

/** Map pointer Y to release-year Z: bottom = `zMin`, top = `zMax`. */
function zFromClientY(clientY: number, rect: DOMRectReadOnly, zMin: number, zMax: number): number {
  const span = zMax - zMin
  const h = rect.height
  if (!(span > 0) || !(h > 0)) return (zMin + zMax) / 2
  const tFromTop = (clientY - rect.top) / h
  const tFromBottom = 1 - Math.min(1, Math.max(0, tFromTop))
  return zMin + tFromBottom * span
}

/** Map pointer X to release-year Z: left = `zMin`, right = `zMax`. */
function zFromClientX(clientX: number, rect: DOMRectReadOnly, zMin: number, zMax: number): number {
  const span = zMax - zMin
  const w = rect.width
  if (!(span > 0) || !(w > 0)) return (zMin + zMax) / 2
  const tFromLeft = (clientX - rect.left) / w
  const t = Math.min(1, Math.max(0, tFromLeft))
  return zMin + t * span
}

export type TimelineOrientation = 'vertical' | 'horizontal'

export interface TimelineHudProps {
  /** `[z_min, z_max]` decimal years from `meta.z_range`. */
  zRange: readonly [number, number]
  /** Macro time focus `zCurrent` (Phase 5.1.5), same axis as movie `z`. */
  cameraZ: number
  /**
   * When set, the track is interactive: drag or click updates macro `zCurrent`
   * (Phase 5.3.1). Omit in passive / Storybook previews.
   */
  onZCurrentChange?: (z: number) => void
  /** P14.7: horizontal = bottom-centered bar (default); vertical = left rail. */
  orientation?: TimelineOrientation
  className?: string
}

/**
 * Z-axis era strip (Design Spec §3.1): low-contrast ticks + current marker; optional drag / click → `zCurrent`.
 * For Storybook use {@link TimelineHud}; in the app use {@link Timeline}.
 */
export function TimelineHud({
  zRange,
  cameraZ,
  onZCurrentChange,
  orientation = 'horizontal',
  className,
}: TimelineHudProps) {
  const str = useStrings()
  const [zMinRaw, zMaxRaw] = zRange
  const zMin = Math.min(zMinRaw, zMaxRaw)
  const zMax = Math.max(zMinRaw, zMaxRaw)

  const ticks = useMemo(() => yearTickList(zMin, zMax), [zMin, zMax])
  const thumbT =
    orientation === 'horizontal'
      ? zToTrackLeftFraction(cameraZ, zMin, zMax)
      : zToTrackBottomFraction(cameraZ, zMin, zMax)
  const labelYear = Math.round(cameraZ)

  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const emitZ = useCallback(
    (clientX: number, clientY: number) => {
      if (!onZCurrentChange || !trackRef.current) return
      const rect = trackRef.current.getBoundingClientRect()
      const z =
        orientation === 'horizontal'
          ? zFromClientX(clientX, rect, zMin, zMax)
          : zFromClientY(clientY, rect, zMin, zMax)
      onZCurrentChange(z)
    },
    [onZCurrentChange, orientation, zMin, zMax],
  )

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!onZCurrentChange) return
      if (e.button !== 0) return
      draggingRef.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      emitZ(e.clientX, e.clientY)
    },
    [emitZ, onZCurrentChange],
  )

  const onTrackPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!onZCurrentChange || !draggingRef.current) return
      emitZ(e.clientX, e.clientY)
    },
    [emitZ, onZCurrentChange],
  )

  const endTrackDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  const interactive = Boolean(onZCurrentChange)
  const ariaOrientation = orientation === 'horizontal' ? 'horizontal' : 'vertical'

  const outerAriaLabel = str.timeline.axisDescription(
    Math.round(zMin),
    Math.round(zMax),
    labelYear,
  )

  const keyStepHandler =
    interactive && onZCurrentChange
      ? (e: React.KeyboardEvent<HTMLDivElement>) => {
        const step = Math.max(1, Math.round((zMax - zMin) / 200))
        if (orientation === 'vertical') {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault()
            onZCurrentChange(Math.min(zMax, cameraZ + step))
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault()
            onZCurrentChange(Math.max(zMin, cameraZ - step))
          }
        } else {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault()
            onZCurrentChange(Math.min(zMax, cameraZ + step))
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault()
            onZCurrentChange(Math.max(zMin, cameraZ - step))
          }
        }
        if (e.key === 'Home') {
          e.preventDefault()
          onZCurrentChange(zMin)
        } else if (e.key === 'End') {
          e.preventDefault()
          onZCurrentChange(zMax)
        }
      }
      : undefined

  if (orientation === 'horizontal') {
    return (
      <div
        className={cn(
          // Horizontal rail width: `w-[50vw]` + max-width cap; vertical track uses `h-[80vh]` (see below).
          'pointer-events-none fixed bottom-8 left-1/2 z-30 flex h-24 w-[50vw] max-w-[calc(100vw-2rem)] -translate-x-1/2 select-none flex-col items-stretch sm:bottom-10',
          className,
        )}
        role={interactive ? 'presentation' : 'img'}
        aria-label={outerAriaLabel}
      >
        <div
          ref={trackRef}
          className={cn(
            'relative min-h-0 flex-1 w-full',
            interactive &&
            'pointer-events-auto cursor-grab touch-none active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-edge-canvas-color-strong)]',
          )}
          role={interactive ? 'slider' : undefined}
          tabIndex={interactive ? 0 : undefined}
          aria-valuemin={interactive ? Math.round(zMin) : undefined}
          aria-valuemax={interactive ? Math.round(zMax) : undefined}
          aria-valuenow={interactive ? labelYear : undefined}
          aria-orientation={interactive ? ariaOrientation : undefined}
          aria-label={interactive ? str.timeline.sliderAriaLabel : undefined}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={endTrackDrag}
          onPointerCancel={endTrackDrag}
          onLostPointerCapture={() => {
            draggingRef.current = false
          }}
          onKeyDown={keyStepHandler}
        >
          <div
            className="pointer-events-none absolute left-0 right-0 top-2 rounded-full"
            style={{
              height: 'var(--ui-edge-stroke-width)',
              backgroundColor: 'var(--ui-edge-canvas-color)',
            }}
            aria-hidden
          />
          {ticks.map((y) => {
            const f = zToTrackLeftFraction(y, zMin, zMax)
            const tickOpacity = tickLabelOpacityNearThumb(f, thumbT)
            return (
              <div
                key={y}
                className={cn(
                  'absolute top-2 flex flex-col items-center',
                  interactive && 'pointer-events-auto cursor-pointer',
                )}
                style={{
                  left: `${f * 100}%`,
                  transform: 'translateX(-50%)',
                  opacity: tickOpacity,
                  pointerEvents: interactive && tickOpacity < 0.25 ? 'none' : undefined,
                }}
                onPointerDown={
                  interactive
                    ? (e) => {
                      e.stopPropagation()
                      onZCurrentChange?.(y)
                    }
                    : undefined
                }
              >
                <span className="mt-1 font-mono text-[0.62rem] tabular-nums tracking-tight text-[color:var(--ui-edge-canvas-color)]">
                  {y}
                </span>
              </div>
            )
          })}
          <div
            className="pointer-events-none absolute flex flex-col items-center gap-0.5"
            style={{ left: `${thumbT * 100}%`, top: '0.5rem', transform: 'translate(-50%, -50%)' }}
          >
            <div
              className="h-5 rounded-full"
              style={{
                width: 'var(--ui-edge-stroke-width)',
                backgroundColor: 'var(--ui-edge-canvas-color-strong)',
                boxShadow: '0 0 6px color-mix(in srgb, var(--ui-edge-canvas-color-strong) 35%, transparent)',
              }}
            />
            <span className="font-mono text-[0.62rem] font-semibold tabular-nums text-[color:var(--ui-edge-canvas-color-strong)]">
              {labelYear}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'pointer-events-none fixed left-2 top-[10vh] z-30 flex h-[80vh] w-[4.5rem] select-none flex-col sm:left-4',
        className,
      )}
      role={interactive ? 'presentation' : 'img'}
      aria-label={outerAriaLabel}
    >
      <div
        ref={trackRef}
        className={cn(
          'relative min-h-0 flex-1',
          interactive &&
          'pointer-events-auto cursor-grab touch-none active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-edge-canvas-color-strong)]',
        )}
        role={interactive ? 'slider' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-valuemin={interactive ? Math.round(zMin) : undefined}
        aria-valuemax={interactive ? Math.round(zMax) : undefined}
        aria-valuenow={interactive ? labelYear : undefined}
        aria-orientation={interactive ? ariaOrientation : undefined}
        aria-label={interactive ? str.timeline.sliderAriaLabel : undefined}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onTrackPointerMove}
        onPointerUp={endTrackDrag}
        onPointerCancel={endTrackDrag}
        onLostPointerCapture={() => {
          draggingRef.current = false
        }}
        onKeyDown={keyStepHandler}
      >
        <div
          className="pointer-events-none absolute bottom-0 left-1/2 top-0 -translate-x-1/2 rounded-full"
          style={{
            width: 'var(--ui-edge-stroke-width)',
            backgroundColor: 'var(--ui-edge-canvas-color)',
          }}
          aria-hidden
        />
        {ticks.map((y) => {
          const f = zToTrackBottomFraction(y, zMin, zMax)
          const tickOpacity = tickLabelOpacityNearThumb(f, thumbT)
          return (
            <div
              key={y}
              className={cn(
                'absolute left-0 right-0 flex items-center justify-end pr-0.5',
                interactive && 'pointer-events-auto cursor-pointer',
              )}
              style={{
                bottom: `${f * 100}%`,
                transform: 'translateY(50%)',
                opacity: tickOpacity,
                pointerEvents: interactive && tickOpacity < 0.25 ? 'none' : undefined,
              }}
              onPointerDown={
                interactive
                  ? (e) => {
                    e.stopPropagation()
                    onZCurrentChange?.(y)
                  }
                  : undefined
              }
            >
              <span className="font-mono text-[0.62rem] tabular-nums tracking-tight text-[color:var(--ui-edge-canvas-color)]">
                {y}
              </span>
            </div>
          )
        })}
        <div
          className="pointer-events-none absolute left-0 right-0 flex flex-col items-center gap-0.5"
          style={{ bottom: `${thumbT * 100}%`, transform: 'translateY(50%)' }}
        >
          <div
            className="w-5 rounded-full"
            style={{
              height: 'var(--ui-edge-stroke-width)',
              backgroundColor: 'var(--ui-edge-canvas-color-strong)',
              boxShadow: '0 0 6px color-mix(in srgb, var(--ui-edge-canvas-color-strong) 35%, transparent)',
            }}
          />
          <span className="font-mono text-[0.62rem] font-semibold tabular-nums text-[color:var(--ui-edge-canvas-color-strong)]">
            {labelYear}
          </span>
        </div>
      </div>
    </div>
  )
}

export interface TimelineProps {
  orientation?: TimelineOrientation
}

/** Wired HUD: reads `meta.z_range` and live `zCurrent` from the galaxy scene bridge. */
export function Timeline({ orientation = 'horizontal' }: TimelineProps) {
  const zRange = useGalaxyDataStore((s) => s.data?.meta.z_range)
  const cameraZ = useSyncExternalStore(subscribeGalaxyCameraZ, getGalaxyCameraZ, getGalaxyCameraZ)

  const onZCurrentChange = useCallback(
    (z: number) => {
      if (!zRange || zRange.length !== 2) return
      const zLo = Math.min(zRange[0], zRange[1])
      const zHi = Math.max(zRange[0], zRange[1])
      const clamped = Math.min(zHi, Math.max(zLo, z))
      useGalaxyInteractionStore.setState({ zCurrent: clamped })
      setGalaxyCameraZ(clamped)
    },
    [zRange],
  )

  useEffect(() => {
    if (!zRange || zRange.length !== 2) return
    const lo = Math.min(zRange[0], zRange[1])
    const hi = Math.max(zRange[0], zRange[1])
    assertFiniteRange(lo, hi)
    console.log(
      `[Timeline] z_range (decimal years) [${lo.toFixed(2)}, ${hi.toFixed(2)}] | orientation=${orientation} | tick sample:`,
      yearTickList(lo, hi).slice(0, 4),
    )
  }, [zRange, orientation])

  if (!zRange || zRange.length !== 2) return null

  return (
    <TimelineHud
      orientation={orientation}
      zRange={[zRange[0], zRange[1]]}
      cameraZ={cameraZ}
      onZCurrentChange={onZCurrentChange}
    />
  )
}

function assertFiniteRange(lo: number, hi: number): void {
  console.assert(Number.isFinite(lo) && Number.isFinite(hi), '[Timeline] z_range must be finite', { lo, hi })
}
