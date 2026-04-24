import type { GalaxyGzipProgress } from '@/data/loadGalaxyGzip'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

export interface LoadingProps {
  className?: string
  /** Accessible label for the loading region */
  label?: string
  /** Gzip fetch / gunzip / parse progress from the data store */
  progress?: GalaxyGzipProgress | null
}

function phaseDone(progress: GalaxyGzipProgress | null | undefined, phase: GalaxyGzipProgress['phase']): boolean {
  if (!progress) return false
  const order: GalaxyGzipProgress['phase'][] = ['download', 'decompress', 'parse']
  return order.indexOf(progress.phase) > order.indexOf(phase)
}

function phaseActive(progress: GalaxyGzipProgress | null | undefined, phase: GalaxyGzipProgress['phase']): boolean {
  return progress?.phase === phase
}

/**
 * Full-screen centered loading overlay (shadcn Spinner) with optional gzip load progress.
 */
export function Loading({ className, label = 'Loading galaxy data', progress }: LoadingProps) {
  const downloadRatio =
    progress?.phase === 'download' && progress.totalBytes !== null && progress.totalBytes > 0
      ? Math.min(1, progress.downloadedBytes / progress.totalBytes)
      : progress && phaseDone(progress, 'download')
        ? 1
        : 0

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/80 px-6 text-foreground backdrop-blur-sm',
        className,
      )}
    >
      <Spinner className="size-10 text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{label}</p>

      {progress ? (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <ol className="flex justify-between gap-2 text-xs text-muted-foreground">
            <li
              className={cn(
                'flex-1 text-center',
                phaseActive(progress, 'download') && 'font-medium text-foreground',
                phaseDone(progress, 'download') && 'text-primary',
              )}
            >
              下载
            </li>
            <li
              className={cn(
                'flex-1 text-center',
                phaseActive(progress, 'decompress') && 'font-medium text-foreground',
                phaseDone(progress, 'decompress') && 'text-primary',
              )}
            >
              解压
            </li>
            <li
              className={cn(
                'flex-1 text-center',
                phaseActive(progress, 'parse') && 'font-medium text-foreground',
              )}
            >
              解析
            </li>
          </ol>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
              style={{ width: `${Math.round(downloadRatio * 100)}%` }}
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">{progress.message}</p>
        </div>
      ) : null}
    </div>
  )
}
