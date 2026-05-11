import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useStrings } from '@/lib/strings'
import { cn } from '@/lib/utils'

const HTTPS_URL_RE = /(https:\/\/[^\s]+)/g
/** Markdown-style links in trusted locale copy: `[label](https://…)` */
const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g

const linkAnchorClass =
  'font-medium text-primary underline-offset-2 hover:underline break-all'

/** Autolink bare `https://…` spans inside locale copy (trusted HUD strings). */
function linkify(text: string): ReactNode {
  const parts = text.split(HTTPS_URL_RE)
  return parts.map((part, i) => {
    if (part.startsWith('https://')) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={linkAnchorClass}>
          {part}
        </a>
      )
    }
    return part
  })
}

/** `[label](url)` then autolink remaining `https://…` in each text span. */
function renderParagraph(para: string): ReactNode {
  const nodes: ReactNode[] = []
  let last = 0
  const re = new RegExp(MD_LINK_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(para)) !== null) {
    if (m.index > last) {
      nodes.push(linkify(para.slice(last, m.index)))
    }
    nodes.push(
      <a key={`md-${m.index}`} href={m[2]} target="_blank" rel="noopener noreferrer" className={linkAnchorClass}>
        {m[1]}
      </a>,
    )
    last = m.index + m[0].length
  }
  if (last < para.length) {
    nodes.push(linkify(para.slice(last)))
  }
  return nodes.length > 0 ? nodes : linkify(para)
}

/** Same flex scroll pattern as {@link MovieDetailDrawerHud} body (`Drawer.tsx`): flex-1 + min-h-0 + overflow-y-auto. */
const infoModalBodyScrollClass =
  'min-h-0 flex-1 overflow-y-auto overflow-x-hidden motion-safe:scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'

export interface InfoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Split on blank lines; `[label](url)` + bare `https://…` inside each paragraph. */
function Section({ title, body }: { title: string; body: string }) {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  return (
    <section className="space-y-3">
      <h3 className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="space-y-2.5 text-sm leading-relaxed text-foreground/90">
        {paragraphs.map((para, i) => (
          <p key={i}>{renderParagraph(para)}</p>
        ))}
      </div>
    </section>
  )
}

/** 居中 Modal：文案在 `lib/locales/*.json`；壳体较 `dialog` 默认（32rem×42rem）放大一档。 */
export function InfoModal({ open, onOpenChange }: InfoModalProps) {
  const s = useStrings()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="app-info-dialog"
        showCloseButton
        className="min-h-0 gap-0 p-0 w-[min(100vw-1.5rem,36rem)] max-h-[min(90dvh,48rem)]"
      >
        <DialogHeader className="relative z-20 shrink-0 gap-0 border-b border-border/70 bg-popover px-6 pb-5 pt-7 text-left shadow-[0_6px_18px_-10px_color-mix(in_oklch,var(--foreground)_10%,transparent)] sm:px-7">
          <DialogTitle className="pr-10 text-2xl font-bold leading-tight tracking-tight text-foreground">
            {s.info.modalTitle}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm font-medium leading-snug text-muted-foreground">
            {s.info.modalSubtitle}
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            'flex flex-col gap-7 px-6 py-5 sm:px-7 pb-6 motion-safe:scroll-smooth',
            infoModalBodyScrollClass,
          )}
        >
          {s.info.sections.map((block, i) => (
            <Section key={`${block.heading}-${i}`} title={block.heading} body={block.body} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
