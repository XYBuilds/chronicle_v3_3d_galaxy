/**
 * Bridges Three.js camera world Z (decimal release year) to React HUD without
 * Zustand updates every frame (useSyncExternalStore subscribes here).
 */

let cameraZ = 0
const listeners = new Set<() => void>()

export function setGalaxyCameraZ(z: number): void {
  cameraZ = z
  for (const l of listeners) l()
}

export function getGalaxyCameraZ(): number {
  return cameraZ
}

export function subscribeGalaxyCameraZ(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}
