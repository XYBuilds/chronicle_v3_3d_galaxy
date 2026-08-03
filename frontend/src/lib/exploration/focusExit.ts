import { dispatchExplorationIntent } from './storeAdapter'

/** Shared semantic exit for every UI path that leaves a movie focus. */
export function exitFocus(): void {
  dispatchExplorationIntent({ type: 'focus/exited' })
}
