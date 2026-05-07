import { useCallback, useId, useState } from 'react'

import { useStrings } from '@/lib/strings'
import { cn } from '@/lib/utils'

export interface LoadFailurePageProps {
  errorMessage: string | null
  onRetry: () => void
}

/**
 * Full-screen galaxy data load failure (network / gzip / JSON parse).
 * Matches {@link Loading} overlay styling; raw error is behind a disclosure.
 */
export function LoadFailurePage({ errorMessage, onRetry }: LoadFailurePageProps) {
  const str = useStrings()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detailsId = useId()
  const toggleDetails = useCallback(() => {
    setDetailsOpen((o) => !o)
  }, [])

  const onReload = useCallback(() => {
    window.location.reload()
  }, [])

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'fixed inset-0 z-50 flex min-h-0 flex-col bg-background/80 text-foreground backdrop-blur-sm',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <h1 className="text-lg font-medium">{str.error.title}</h1>

        <div className="flex w-full max-w-lg flex-col items-stretch gap-2">
          <button
            type="button"
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--ui-edge-color-strong]"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={toggleDetails}
          >
            {detailsOpen ? str.error.hideErrorDetails : str.error.showErrorDetails}
          </button>
          {detailsOpen ? (
            <div
              id={detailsId}
              role="region"
              aria-label={str.error.detailsRegionLabel}
              className="rounded-md border border-border bg-muted/20 p-3 text-left text-sm text-muted-foreground"
            >
              <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                {errorMessage?.trim() ? errorMessage : str.error.noErrorText}
              </pre>
              <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed">
                {str.error.localDevHintBeforeCode}
                <code className="rounded bg-muted px-1 py-0.5">frontend/public/data/galaxy_data.json</code>
                {str.error.localDevBetweenCodes}
                <code className="rounded bg-muted px-1 py-0.5">galaxy_data.json.gz</code>
                {str.error.localDevHintAfterCode}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--ui-edge-color-strong]"
            onClick={() => void onRetry()}
          >
            {str.error.retry}
          </button>
          <button
            type="button"
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--ui-edge-color-strong]"
            onClick={onReload}
          >
            {str.error.reloadPage}
          </button>
        </div>
      </div>
    </div>
  )
}
