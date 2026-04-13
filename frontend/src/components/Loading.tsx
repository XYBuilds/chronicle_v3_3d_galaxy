import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

export interface LoadingProps {
  className?: string
  /** Accessible label for the loading region */
  label?: string
}

/**
 * Full-screen centered loading overlay (shadcn Spinner).
 */
export function Loading({ className, label = 'Loading galaxy data' }: LoadingProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/80 text-foreground backdrop-blur-sm',
        className,
      )}
    >
      <Spinner className="size-10 text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}
