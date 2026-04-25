import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  INFO_DATA_BODY,
  INFO_DATA_HEADING,
  INFO_INTRO_BODY,
  INFO_INTRO_HEADING,
  INFO_LINKS_BODY,
  INFO_LINKS_HEADING,
  INFO_MODAL_TITLE,
  INFO_STACK_BODY,
  INFO_STACK_HEADING,
} from '@/hud/infoCopy'

export interface InfoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="space-y-2 rounded-lg border border-border/60 bg-card/35 p-3 shadow-sm">
      <h3 className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{body}</p>
    </section>
  )
}

/** 居中 Modal：占位文案，收尾阶段只改 `infoCopy.ts`。 */
export function InfoModal({ open, onOpenChange }: InfoModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="app-info-dialog" showCloseButton className="gap-0 p-0">
        <DialogHeader className="shrink-0">
          <DialogTitle>{INFO_MODAL_TITLE}</DialogTitle>
          <DialogDescription className="text-left">
            占位面板：文案与链接将在项目收尾阶段统一补全。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 max-h-[min(70dvh,28rem)] flex-1">
          <div className="flex flex-col gap-4 p-4 pb-5 motion-safe:scroll-smooth">
            <Section title={INFO_INTRO_HEADING} body={INFO_INTRO_BODY} />
            <Section title={INFO_DATA_HEADING} body={INFO_DATA_BODY} />
            <Section title={INFO_STACK_HEADING} body={INFO_STACK_BODY} />
            <Section title={INFO_LINKS_HEADING} body={INFO_LINKS_BODY} />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
