import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  INFO_DATA_BODY,
  INFO_DATA_HEADING,
  INFO_INTRO_BODY,
  INFO_INTRO_HEADING,
  INFO_LINKS_BODY,
  INFO_LINKS_HEADING,
  INFO_SHEET_TITLE,
  INFO_STACK_BODY,
  INFO_STACK_HEADING,
} from '@/hud/infoCopy'

const SHEET_EASE = 'cubic-bezier(0.215, 0.61, 0.355, 1)'

export interface InfoSheetProps {
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

/**
 * 应用级 INFO 侧栏：与电影详情 Drawer（右侧）错开为左侧滑入，降低同侧堆叠与手势冲突。
 */
export function InfoSheet({ open, onOpenChange }: InfoSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        id="app-info-sheet"
        side="left"
        showCloseButton
        className={cn(
          'w-full gap-0 border-r border-border bg-popover p-0 sm:max-w-md',
          'transition-[transform,opacity] duration-[280ms] ease-[var(--info-sheet-ease)] data-ending-style:duration-[380ms]',
        )}
        style={{ ['--info-sheet-ease' as string]: SHEET_EASE }}
      >
        <SheetHeader className="gap-1 border-b border-border/80 bg-muted/20 p-4 text-left">
          <SheetTitle className="pr-10 text-lg font-semibold tracking-tight">{INFO_SHEET_TITLE}</SheetTitle>
          <SheetDescription className="text-left text-sm text-muted-foreground">
            占位面板：文案与链接将在项目收尾阶段统一补全。
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100dvh-5.5rem)]">
          <div className="flex flex-col gap-4 p-4 motion-safe:scroll-smooth">
            <Section title={INFO_INTRO_HEADING} body={INFO_INTRO_BODY} />
            <Section title={INFO_DATA_HEADING} body={INFO_DATA_BODY} />
            <Section title={INFO_STACK_HEADING} body={INFO_STACK_BODY} />
            <Section title={INFO_LINKS_HEADING} body={INFO_LINKS_BODY} />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
