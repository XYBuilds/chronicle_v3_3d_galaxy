/**
 * P14.6 — Drawer **Details** grid: four groups, column order, and “no data” rules (Design Spec §P14.6).
 * Returns a flat list of fields in visual order for `grid-cols-2` (left-to-right, then wrap).
 */

import type { Movie } from '@/types/galaxy'
import { STRINGS } from '@/lib/strings'

export type DrawerDetailFieldId =
  | 'runtime'
  | 'language'
  | 'director'
  | 'producers'
  | 'writers'
  | 'directorOfPhotography'
  | 'musicComposer'
  | 'budget'
  | 'revenue'

export interface DrawerDetailField {
  id: DrawerDetailFieldId
  /** Display string (including formatted money or {@link STRINGS.drawer.details.missingValue}). */
  value: string
}

/** Present only when the pipeline has a positive USD amount (P14.6: 0 / null / missing = no). */
export function formatUsdPresent(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function hasNameList(arr: readonly string[] | null | undefined): boolean {
  if (arr == null) return false
  return arr.some((s) => s.trim().length > 0)
}

function joinNames(arr: readonly string[]): string {
  return arr.map((s) => s.trim()).filter(Boolean).join(', ')
}

/**
 * Ordered fields for the Details section. Group 1 always contributes two cells; group 4 appears only
 * when at least one of budget/revenue is a positive finite USD amount.
 */
export function buildDrawerDetailsFields(movie: Movie): DrawerDetailField[] {
  const slash = STRINGS.drawer.details.missingValue
  const out: DrawerDetailField[] = []

  // Group 1 — always
  const rt = movie.runtime
  out.push({
    id: 'runtime',
    value: rt == null ? slash : STRINGS.drawer.details.runtimeMinutes(rt),
  })
  const lang = movie.original_language?.trim() ?? ''
  out.push({
    id: 'language',
    value: lang.length > 0 ? lang.toUpperCase() : slash,
  })

  // Group 2 — skip empty columns
  if (hasNameList(movie.director)) {
    out.push({ id: 'director', value: joinNames(movie.director) })
  }
  if (hasNameList(movie.producers)) {
    out.push({ id: 'producers', value: joinNames(movie.producers) })
  }
  if (hasNameList(movie.writers)) {
    out.push({ id: 'writers', value: joinNames(movie.writers) })
  }

  // Group 3
  if (hasNameList(movie.director_of_photography)) {
    out.push({ id: 'directorOfPhotography', value: joinNames(movie.director_of_photography) })
  }
  if (hasNameList(movie.music_composer)) {
    out.push({ id: 'musicComposer', value: joinNames(movie.music_composer) })
  }

  // Group 4 — hide whole group when both are “no”
  const budgetStr = formatUsdPresent(movie.budget)
  const revenueStr = formatUsdPresent(movie.revenue)
  if (budgetStr != null || revenueStr != null) {
    out.push({ id: 'budget', value: budgetStr ?? slash })
    out.push({ id: 'revenue', value: revenueStr ?? slash })
  }

  assert(out[0]?.id === 'runtime' && out[1]?.id === 'language', '[drawerDetailsLayout] group 1 order')
  return out
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}
