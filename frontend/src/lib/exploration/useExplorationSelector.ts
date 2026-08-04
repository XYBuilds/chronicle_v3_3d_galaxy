import { useSyncExternalStore } from 'react'

import { readExplorationContext, subscribeExplorationContext } from './storeAdapter'
import type { ExplorationContext } from './types'

export function useExplorationSelector<Selection>(
  selector: (context: ExplorationContext) => Selection,
): Selection {
  const context = useSyncExternalStore(
    subscribeExplorationContext,
    readExplorationContext,
    readExplorationContext,
  )
  return selector(context)
}