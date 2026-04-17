import { useEffect, useMemo, useSyncExternalStore } from 'react'

import { getGalaxyCameraZ, subscribeGalaxyCameraZ } from '@/lib/galaxyCameraZBridge'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'
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

export interface TimelineHudProps {
  /** `[z_min, z_max]` decimal years from `meta.z_range`. */
  zRange: readonly [number, number]
  /** Macro time focus `zCurrent` (Phase 5.1.5), same axis as movie `z`. */
  cameraZ: number
  className?: string
}

/**
 * Passive Z-axis era strip (Design Spec §3.1): low-contrast ticks + current marker.
 * For Storybook use {@link TimelineHud}; in the app use {@link Timeline}.
 */
export function TimelineHud({ zRange, cameraZ, className }: TimelineHudProps) {
  const [zMinRaw, zMaxRaw] = zRange
  const zMin = Math.min(zMinRaw, zMaxRaw)
  const zMax = Math.max(zMinRaw, zMaxRaw)

  const ticks = useMemo(() => yearTickList(zMin, zMax), [zMin, zMax])
  const thumbT = zToTrackBottomFraction(cameraZ, zMin, zMax)
  const labelYear = Math.round(cameraZ)

  return (
    <div
      className={cn(
        'pointer-events-none fixed left-2 top-[10vh] z-30 flex h-[80vh] w-[4.5rem] select-none flex-col sm:left-4',
        className,
      )}
      role="img"
      aria-label={`Release-year axis from ${Math.round(zMin)} to ${Math.round(zMax)}, view focus near ${labelYear}`}
    >
      <div className="relative min-h-0 flex-1">
        <div
          className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 rounded-full bg-white/[0.12]"
          aria-hidden
        />
        {ticks.map((y) => {
          const f = zToTrackBottomFraction(y, zMin, zMax)
          return (
            <div
              key={y}
              className="absolute left-0 right-0 flex items-center justify-end pr-0.5"
              style={{ bottom: `${f * 100}%`, transform: 'translateY(50%)' }}
            >
              <span className="font-mono text-[0.62rem] tabular-nums tracking-tight text-white/[0.38]">
                {y}
              </span>
            </div>
          )
        })}
        <div
          className="absolute left-0 right-0 flex flex-col items-center gap-0.5"
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
  return <TimelineHud zRange={[zRange[0], zRange[1]]} cameraZ={cameraZ} />
}
