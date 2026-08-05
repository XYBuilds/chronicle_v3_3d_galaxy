import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'

import { assertValidExplorationContext, decideExploration } from './decision'
import type {
  ExplorationContext,
  ExplorationIntent,
  SelectSession,
} from './types'

const LOG_SAMPLE_LIMIT = 3

function sessionOf(context: ExplorationContext): SelectSession | null {
  if (context.kind === 'select') return context.session
  if (context.kind === 'focus') return context.parent ?? null
  return null
}

function logDispatch(current: ExplorationContext, next: ExplorationContext): void {
  const session = sessionOf(next)
  console.log('[Exploration] dispatch', {
    fromKind: current.kind,
    toKind: next.kind,
    collectionLength: session?.movieIds.length ?? 0,
    collectionSample: session?.movieIds.slice(0, LOG_SAMPLE_LIMIT) ?? [],
  })
}

export type ExplorationContextListener = (
  context: ExplorationContext,
  previousContext: ExplorationContext,
) => void

export function subscribeExplorationContext(
  listener: ExplorationContextListener,
): () => void {
  return useGalaxyInteractionStore.subscribe((state, previousState) => {
    const context = state.explorationContext
    const previousContext = previousState.explorationContext
    if (context === previousContext) return
    assertValidExplorationContext(previousContext)
    assertValidExplorationContext(context)
    listener(context, previousContext)
  })
}

export function readExplorationContext(): ExplorationContext {
  const context = useGalaxyInteractionStore.getState().explorationContext
  assertValidExplorationContext(context)
  return context
}

export function dispatchExplorationIntent(intent: ExplorationIntent): ExplorationContext {
  const current = readExplorationContext()
  const next = decideExploration(current, intent)
  if (next !== current) {
    useGalaxyInteractionStore.setState({ explorationContext: next })
  }
  logDispatch(current, next)
  return next
}