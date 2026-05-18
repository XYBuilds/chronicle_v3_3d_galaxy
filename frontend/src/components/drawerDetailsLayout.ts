/**
 * P14.6 — Drawer **Details**: stacked groups, each in its own `grid-cols-2` (forced line breaks).
 * Order: Runtime+Language → Budget+Revenue (when any) → Director/Producers/Writers → DOP/Music Composer.
 */

import type { Movie } from '@/types/galaxy'
import { getStrings } from '@/lib/strings'

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
  /** Display string (including formatted money or missing-value slash from strings). */
  value: string
  /** P27.3 — trimmed names for index-backed person links (director / crew lists only). */
  rawNames?: readonly string[]
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

function trimmedNameList(arr: readonly string[] | null | undefined): string[] {
  if (arr == null) return []
  return arr.map((s) => s.trim()).filter(Boolean)
}

export function buildDrawerDetailsGroups(movie: Movie): DrawerDetailsGroups {
  const str = getStrings()
  const slash = str.drawer.details.missingValue

  const rt = movie.runtime
  const lang = movie.original_language?.trim() ?? ''
  const group1: readonly [DrawerDetailField, DrawerDetailField] = [
    {
      id: 'runtime',
      value: rt == null ? slash : str.drawer.details.runtimeMinutes(rt),
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
  const directors = trimmedNameList(movie.director)
  if (directors.length > 0) {
    group3.push({ id: 'director', value: directors.join(', '), rawNames: directors })
  }
  const producers = trimmedNameList(movie.producers)
  if (producers.length > 0) {
    group3.push({ id: 'producers', value: producers.join(', '), rawNames: producers })
  }
  const writers = trimmedNameList(movie.writers)
  if (writers.length > 0) {
    group3.push({ id: 'writers', value: writers.join(', '), rawNames: writers })
  }

  const group4: DrawerDetailField[] = []
  const dops = trimmedNameList(movie.director_of_photography)
  if (dops.length > 0) {
    group4.push({ id: 'directorOfPhotography', value: dops.join(', '), rawNames: dops })
  }
  const composers = trimmedNameList(movie.music_composer)
  if (composers.length > 0) {
    group4.push({ id: 'musicComposer', value: composers.join(', '), rawNames: composers })
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
