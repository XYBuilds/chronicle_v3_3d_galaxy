import type { Movie } from '@/types/galaxy'

/**
 * P13.2 — O(n) spherical neighborhood in world (UMAP XY + decimal-year Z).
 * Called on focus enter / pivot change / `focusNeighborRadius` change (not per RAF frame).
 */
export function computeFocusNeighborIds(
  movies: Movie[],
  pivot: { x: number; y: number; z: number },
  radius: number,
): number[] {
  console.assert(radius >= 0, '[FocusNeighbor] radius must be non-negative')
  const r2 = radius * radius
  const out: number[] = []
  for (const m of movies) {
    const dx = m.x - pivot.x
    const dy = m.y - pivot.y
    const dz = m.z - pivot.z
    if (dx * dx + dy * dy + dz * dz <= r2) out.push(m.id)
  }
  console.log('[FocusNeighbor] computeFocusNeighborIds | n=', movies.length, '| out=', out.length, '| R=', radius)
  return out
}
