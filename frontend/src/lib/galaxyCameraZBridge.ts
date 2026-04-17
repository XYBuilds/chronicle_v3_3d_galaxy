/**
 * Bridges macro view `zCurrent` (decimal release-year focus from
 * {@link useGalaxyInteractionStore}) to React HUD without Zustand subscriptions
 * every frame — `useSyncExternalStore` subscribes here.
 */

let zCurrentBridge = 0
const listeners = new Set<() => void>()

/** Publish the current time-axis focus for Timeline / HUD (Phase 5.1.5). */
export function setGalaxyCameraZ(zCurrent: number): void {
  zCurrentBridge = zCurrent
  for (const l of listeners) l()
}

export function getGalaxyCameraZ(): number {
  return zCurrentBridge
}

export function subscribeGalaxyCameraZ(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}
