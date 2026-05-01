import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { X } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'

import { STRINGS } from '@/lib/strings'
import { cn } from '@/lib/utils'

const closeBtnVariants = cva(
  'inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ui-edge-color-strong)]',
  {
    variants: {
      variant: {
        default:
          'h-8 w-8 border border-[color:var(--ui-edge-color)] [border-width:var(--ui-edge-stroke-width)] hover:border-[color:var(--ui-edge-color-strong)] hover:bg-foreground/5',
        ghostSm: 'h-5 w-5 text-muted-foreground hover:text-foreground',
        ghostLg: 'h-9 w-9 text-muted-foreground hover:text-foreground',
        /** Matches `buttonVariants({ variant: 'secondary' })` for icon-sized control */
        secondary:
          'h-9 w-9 rounded-lg bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface CloseButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof closeBtnVariants> {
  /** Required for a11y; defaults to STRINGS.hud.close */
  label?: string
}

export const CloseButton = forwardRef<HTMLButtonElement, CloseButtonProps>(function CloseButton(
  { variant, label, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label ?? STRINGS.hud.close}
      className={cn(closeBtnVariants({ variant }), className)}
      {...rest}
    >
      <X className="size-3.5" aria-hidden />
    </button>
  )
})
