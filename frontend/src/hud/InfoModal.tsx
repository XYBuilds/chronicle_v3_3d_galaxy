import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useStrings } from '@/lib/strings'

export interface InfoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Section typography matches Drawer body blocks (Overview / Details / Cast). */
function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{body}</p>
    </section>
  )
}

/** 居中 Modal：占位文案收尾改 `lib/locales/*.json`；壳体较 `dialog` 默认（32rem×42rem）放大一档。 */
export function InfoModal({ open, onOpenChange }: InfoModalProps) {
  const s = useStrings()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="app-info-dialog"
        showCloseButton
        className="gap-0 p-0 w-[min(100vw-1.5rem,36rem)] max-h-[min(90dvh,48rem)]"
      >
        <DialogHeader className="relative z-20 shrink-0 gap-0 border-b border-border/70 bg-popover px-6 pb-5 pt-7 text-left shadow-[0_6px_18px_-10px_color-mix(in_oklch,var(--foreground)_10%,transparent)] sm:px-7">
          <DialogTitle className="pr-10 text-2xl font-bold leading-tight tracking-tight text-foreground">
            {s.info.modalTitle}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm font-medium leading-snug text-muted-foreground">
            {s.info.modalSubtitle}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 max-h-[min(78dvh,34rem)] flex-1">
          <div className="flex flex-col gap-7 px-6 py-5 sm:px-7 pb-6 motion-safe:scroll-smooth">
            <Section title={s.info.introHeading} body={s.info.introBody} />
            <Section title={s.info.dataHeading} body={s.info.dataBody} />
            <Section title={s.info.stackHeading} body={s.info.stackBody} />
            <Section title={s.info.linksHeading} body={s.info.linksBody} />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
