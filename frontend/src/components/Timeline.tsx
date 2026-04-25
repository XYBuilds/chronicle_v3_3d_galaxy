import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Info } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getGalaxyCameraZ, setGalaxyCameraZ, subscribeGalaxyCameraZ } from '@/lib/galaxyCameraZBridge'
import { InfoModal } from '@/hud/InfoModal'
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

function zToTrackBottomFraction(z: number, zMin: number, zMax: number): number {
  const span = zMax - zMin
  if (!(span > 0)) return 0.5
  const t = (z - zMin) / span
  return Math.min(1, Math.max(0, t))
}

/** Map pointer Y to release-year Z: bottom of track = `zMin`, top = `zMax`. */
function zFromClientY(clientY: number, rect: DOMRectReadOnly, zMin: number, zMax: number): number {
  const span = zMax - zMin
  const h = rect.height
  if (!(span > 0) || !(h > 0)) return (zMin + zMax) / 2
  const tFromTop = (clientY - rect.top) / h
  const tFromBottom = 1 - Math.min(1, Math.max(0, tFromTop))
  return zMin + tFromBottom * span
}

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
  className?: string
}

/**
 * Z-axis era strip (Design Spec §3.1): low-contrast ticks + current marker; optional drag / click → `zCurrent`.
 * For Storybook use {@link TimelineHud}; in the app use {@link Timeline}.
 */
export function TimelineHud({ zRange, cameraZ, onZCurrentChange, className }: TimelineHudProps) {
  const [infoOpen, setInfoOpen] = useState(false)
  const [zMinRaw, zMaxRaw] = zRange
  const zMin = Math.min(zMinRaw, zMaxRaw)
  const zMax = Math.max(zMinRaw, zMaxRaw)

  const ticks = useMemo(() => yearTickList(zMin, zMax), [zMin, zMax])
  const thumbT = zToTrackBottomFraction(cameraZ, zMin, zMax)
  const labelYear = Math.round(cameraZ)

  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const emitZ = useCallback(
    (clientY: number) => {
      if (!onZCurrentChange || !trackRef.current) return
      const z = zFromClientY(clientY, trackRef.current.getBoundingClientRect(), zMin, zMax)
      onZCurrentChange(z)
    },
    [onZCurrentChange, zMin, zMax],
  )

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!onZCurrentChange) return
      if (e.button !== 0) return
      draggingRef.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      emitZ(e.clientY)
    },
    [emitZ, onZCurrentChange],
  )

  const onTrackPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!onZCurrentChange || !draggingRef.current) return
      emitZ(e.clientY)
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

  return (
    <div
      className={cn(
        'pointer-events-none fixed left-2 top-[10vh] z-30 flex h-[80vh] w-[4.5rem] select-none flex-col sm:left-4',
        className,
      )}
      role="group"
    >
      <div className="pointer-events-auto mb-1.5 flex shrink-0 justify-end pr-0.5">
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className={cn(
            'border border-white/10 bg-black/45 text-white/85 shadow-sm backdrop-blur-sm',
            'motion-safe:transition-[background-color,border-color] motion-safe:duration-200',
            'hover:bg-black/55 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30',
          )}
          aria-haspopup="dialog"
          aria-expanded={infoOpen}
          aria-controls="app-info-dialog"
          onClick={() => setInfoOpen(true)}
        >
          <Info className="size-[1.05rem]" aria-hidden />
          <span className="sr-only">打开关于本体验的说明（占位内容）</span>
        </Button>
      </div>
      <InfoModal open={infoOpen} onOpenChange={setInfoOpen} />
      <div
        ref={trackRef}
        className={cn(
          'relative min-h-0 flex-1',
          interactive &&
            'pointer-events-auto cursor-grab touch-none active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25',
        )}
        role={interactive ? 'slider' : 'img'}
        tabIndex={interactive ? 0 : undefined}
        aria-valuemin={interactive ? Math.round(zMin) : undefined}
        aria-valuemax={interactive ? Math.round(zMax) : undefined}
        aria-valuenow={interactive ? labelYear : undefined}
        aria-orientation={interactive ? 'vertical' : undefined}
        aria-label={
          interactive
            ? 'Release-year focus'
            : `Release-year axis from ${Math.round(zMin)} to ${Math.round(zMax)}, view focus near ${labelYear}`
        }
        onPointerDown={onTrackPointerDown}
        onPointerMove={onTrackPointerMove}
        onPointerUp={endTrackDrag}
        onPointerCancel={endTrackDrag}
        onLostPointerCapture={() => {
          draggingRef.current = false
        }}
        onKeyDown={
          interactive
            ? (e) => {
                const step = Math.max(1, Math.round((zMax - zMin) / 200))
                if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                  e.preventDefault()
                  onZCurrentChange?.(Math.min(zMax, cameraZ + step))
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
                  e.preventDefault()
                  onZCurrentChange?.(Math.max(zMin, cameraZ - step))
                } else if (e.key === 'Home') {
                  e.preventDefault()
                  onZCurrentChange?.(zMin)
                } else if (e.key === 'End') {
                  e.preventDefault()
                  onZCurrentChange?.(zMax)
                }
              }
            : undefined
        }
      >
        <div
          className="pointer-events-none absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 rounded-full bg-white/[0.12]"
          aria-hidden
        />
        {ticks.map((y) => {
          const f = zToTrackBottomFraction(y, zMin, zMax)
          return (
            <div
              key={y}
              className={cn(
                'absolute left-0 right-0 flex items-center justify-end pr-0.5',
                interactive && 'pointer-events-auto cursor-pointer',
              )}
              style={{ bottom: `${f * 100}%`, transform: 'translateY(50%)' }}
              onPointerDown={
                interactive
                  ? (e) => {
                      e.stopPropagation()
                      onZCurrentChange?.(y)
                    }
                  : undefined
              }
            >
              <span className="font-mono text-[0.62rem] tabular-nums tracking-tight text-white/[0.38]">
                {y}
              </span>
            </div>
          )
        })}
        <div
          className="pointer-events-none absolute left-0 right-0 flex flex-col items-center gap-0.5"
          style={{ bottom: `${thumbT * 100}%`, transform: 'translateY(50%)' }}
        >
          <div className="h-px w-5 rounded-full bg-white/[0.55] shadow-[0_0_6px_rgba(255,255,255,0.25)]" />
          <span className="font-mono text-[0.62rem] tabular-nums text-white/[0.72]">{labelYear}</span>
        </div>
      </div>
    </div>
  )
}

/** Wired HUD: reads `meta.z_range` and live `zCurrent` from the galaxy scene bridge. */
export function Timeline() {
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
    console.log(
      `[Timeline] z_range (decimal years) [${lo.toFixed(2)}, ${hi.toFixed(2)}] | tick sample:`,
      yearTickList(lo, hi).slice(0, 4),
    )
  }, [zRange])

  if (!zRange || zRange.length !== 2) return null

  return (
    <TimelineHud zRange={[zRange[0], zRange[1]]} cameraZ={cameraZ} onZCurrentChange={onZCurrentChange} />
  )
}
