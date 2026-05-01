/**
 * P14.6 — Drawer **Details**: stacked groups, each in its own `grid-cols-2` (forced line breaks).
 * Order: Runtime+Language → Budget+Revenue (when any) → Director/Producers/Writers → DOP/Music Composer.
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

/** Four stacked groups for the Details section (see module docstring for order). */
export interface DrawerDetailsGroups {
  /** Runtime + Language — always exactly two fields. */
  group1: readonly [DrawerDetailField, DrawerDetailField]
  /** Budget + Revenue — 0 or 2 fields (hidden when both amounts are unusable, including 0). */
  group2: DrawerDetailField[]
  /** Director, Producers, Writers — omit empty columns. */
  group3: DrawerDetailField[]
  /** Director of Photography, Music Composer — omit empty columns. */
  group4: DrawerDetailField[]
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

export function buildDrawerDetailsGroups(movie: Movie): DrawerDetailsGroups {
  const slash = STRINGS.drawer.details.missingValue

  const rt = movie.runtime
  const lang = movie.original_language?.trim() ?? ''
  const group1: readonly [DrawerDetailField, DrawerDetailField] = [
    {
      id: 'runtime',
      value: rt == null ? slash : STRINGS.drawer.details.runtimeMinutes(rt),
    },
    {
      id: 'language',
      value: lang.length > 0 ? lang.toUpperCase() : slash,
    },
  ]

  const budgetStr = formatUsdPresent(movie.budget)
  const revenueStr = formatUsdPresent(movie.revenue)
  const group2: DrawerDetailField[] = []
  if (budgetStr != null || revenueStr != null) {
    group2.push({ id: 'budget', value: budgetStr ?? slash })
    group2.push({ id: 'revenue', value: revenueStr ?? slash })
  }

  const group3: DrawerDetailField[] = []
  if (hasNameList(movie.director)) {
    group3.push({ id: 'director', value: joinNames(movie.director) })
  }
  if (hasNameList(movie.producers)) {
    group3.push({ id: 'producers', value: joinNames(movie.producers) })
  }
  if (hasNameList(movie.writers)) {
    group3.push({ id: 'writers', value: joinNames(movie.writers) })
  }

  const group4: DrawerDetailField[] = []
  if (hasNameList(movie.director_of_photography)) {
    group4.push({ id: 'directorOfPhotography', value: joinNames(movie.director_of_photography) })
  }
  if (hasNameList(movie.music_composer)) {
    group4.push({ id: 'musicComposer', value: joinNames(movie.music_composer) })
  }

  assert(group1[0]?.id === 'runtime' && group1[1]?.id === 'language', '[drawerDetailsLayout] group 1 order')
  return { group1, group2, group3, group4 }
}

/** Flattened field order (e.g. tests); UI should prefer {@link buildDrawerDetailsGroups} for layout. */
export function buildDrawerDetailsFields(movie: Movie): DrawerDetailField[] {
  const g = buildDrawerDetailsGroups(movie)
  return [...g.group1, ...g.group2, ...g.group3, ...g.group4]
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}
