/**
 * HUD copy: English in `./locales/en.json`, Chinese in `./locales/zh.json`.
 * Runtime locale via {@link useStrings}; non-React paths use {@link getStrings}.
 */

import type { LocaleId } from './locales'
import { LOCALES } from './locales'
import { useLocaleStore } from '@/store/localeStore'

/** Replace `{{key}}` segments in order; values must be strings (coerce numbers at call sites if needed). */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
}

export function buildStrings(localeId: LocaleId) {
  const raw = LOCALES[localeId]
  return {
    loading: raw.loading,
    cover: raw.cover,
    galaxyData: {
      downloadProgress: (downloadedMb: string, totalMb: string) =>
        interpolate(raw.galaxyData.downloadProgress, { downloadedMb, totalMb }),
      downloadProgressPartial: (downloadedMb: string) =>
        interpolate(raw.galaxyData.downloadProgressPartial, { downloadedMb }),
      decompressingGzip: raw.galaxyData.decompressingGzip,
      parsingJson: raw.galaxyData.parsingJson,
      gzipUnsupported: raw.galaxyData.gzipUnsupported,
      networkErrorHint: raw.galaxyData.networkErrorHint,
      requestFailed: (url: string, hint: string, detail: string) =>
        interpolate(raw.galaxyData.requestFailed, { url, hint, detail }),
      httpNotOk: (status: number, statusText: string, url: string, deployHintPath: string) =>
        interpolate(raw.galaxyData.httpNotOk, {
          status: String(status),
          statusText,
          url,
          deployHintPath,
        }),
      emptyResponseBody: raw.galaxyData.emptyResponseBody,
      jsonParseFailed: (detail: string) => interpolate(raw.galaxyData.jsonParseFailed, { detail }),
    },
    error: raw.error,
    searchBar: raw.searchBar,
    hud: raw.hud,
    timeline: {
      ...raw.timeline,
      axisDescription: (minYear: number, maxYear: number, focusYear: number) =>
        interpolate(raw.timeline.axisDescription, {
          minYear: String(minYear),
          maxYear: String(maxYear),
          focusYear: String(focusYear),
        }),
    },
    info: raw.info,
    scene: raw.scene,
    drawer: {
      fallbackTitle: raw.drawer.fallbackTitle,
      posterAlt: (title: string) => interpolate(raw.drawer.posterAlt, { title }),
      posterPlaceholder: raw.drawer.posterPlaceholder,
      sheetDescription: (title: string, releaseDate: string) =>
        interpolate(raw.drawer.sheetDescription, { title, releaseDate }),
      sheetDescriptionEmpty: raw.drawer.sheetDescriptionEmpty,
      votesLine: (count: string) => interpolate(raw.drawer.votesLine, { count }),
      sections: raw.drawer.sections,
      details: {
        missingValue: raw.drawer.details.missingValue,
        runtime: raw.drawer.details.runtime,
        runtimeMinutes: (minutes: number | string) =>
          interpolate(raw.drawer.details.runtimeMinutes, { minutes: String(minutes) }),
        language: raw.drawer.details.language,
        director: raw.drawer.details.director,
        writers: raw.drawer.details.writers,
        directorOfPhotography: raw.drawer.details.directorOfPhotography,
        producers: raw.drawer.details.producers,
        composer: raw.drawer.details.composer,
        budget: raw.drawer.details.budget,
        revenue: raw.drawer.details.revenue,
      },
      links: raw.drawer.links,
    },
    focusLReference: {
      ariaLabel: (rating: string, filmTitle: string) =>
        interpolate(raw.focusLReference.ariaLabel, { rating, filmTitle }),
    },
    focusVoteReference: {
      tierLabels: raw.focusVoteReference.tierLabels,
    },
  }
}

export type LocaleStrings = ReturnType<typeof buildStrings>

const STRINGS_BY_LOCALE: Record<LocaleId, LocaleStrings> = {
  en: buildStrings('en'),
  zh: buildStrings('zh'),
}

export function useStrings(): LocaleStrings {
  const locale = useLocaleStore((s) => s.locale)
  return STRINGS_BY_LOCALE[locale]
}

/** Non-React contexts (load errors, Three.js init, layout helpers). Snapshot of current locale. */
export function getStrings(): LocaleStrings {
  return STRINGS_BY_LOCALE[useLocaleStore.getState().locale]
}

/**
 * Static English bundle for Storybook and legacy imports.
 * @deprecated Prefer {@link useStrings} in components; {@link getStrings} outside React.
 */
export const STRINGS: LocaleStrings = STRINGS_BY_LOCALE.en
