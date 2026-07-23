/**
 * HUD copy: `./locales/*.json` (see {@link LOCALE_IDS}).
 * Runtime locale via {@link useStrings}; non-React paths use {@link getStrings}.
 */

import type { LocaleId } from './locales'
import { LOCALES, LOCALE_IDS } from './locales'
import { useLocaleStore } from '@/store/localeStore'

/** Replace `{{key}}` segments in order; values must be strings (coerce numbers at call sites if needed). */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
}

export function buildStrings(localeId: LocaleId) {
  const raw = LOCALES[localeId]
  return {
    loading: raw.loading,
    galaxyData: {
      downloadProgress: (downloadedMb: string, totalMb: string) =>
        interpolate(raw.galaxyData.downloadProgress, { downloadedMb, totalMb }),
      downloadProgressPartial: (downloadedMb: string) =>
        interpolate(raw.galaxyData.downloadProgressPartial, { downloadedMb }),
      decompressingGzip: raw.galaxyData.decompressingGzip,
      parsingJson: raw.galaxyData.parsingJson,
      preparingDownload: raw.galaxyData.preparingDownload,
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
    searchBar: {
      ...raw.searchBar,
      idSuggestionAriaLabel: (title: string, tmdbId: number | string) =>
        interpolate(raw.searchBar.idSuggestionAriaLabel, { title, tmdbId: String(tmdbId) }),
    },
    hud: raw.hud,
    attribution: raw.attribution,
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
      poster: raw.drawer.poster,
      sheetDescription: (title: string, releaseDate: string) =>
        interpolate(raw.drawer.sheetDescription, { title, releaseDate }),
      sheetDescriptionEmpty: raw.drawer.sheetDescriptionEmpty,
      votesLine: (count: string) => interpolate(raw.drawer.votesLine, { count }),
      personSearchNameAriaLabel: (name: string) =>
        interpolate(raw.drawer.personSearchNameAriaLabel, { name }),
      sections: raw.drawer.sections,
      share: {
        label: raw.drawer.share.label,
        linkCopied: raw.drawer.share.linkCopied,
        title: (title: string) => interpolate(raw.drawer.share.title, { title }),
        text: (title: string, releaseYear: string) =>
          interpolate(raw.drawer.share.text, { title, releaseYear }),
        ariaCopyLink: raw.drawer.share.ariaCopyLink,
        ariaX: raw.drawer.share.ariaX,
        ariaFacebook: raw.drawer.share.ariaFacebook,
        ariaTelegram: raw.drawer.share.ariaTelegram,
        ariaReddit: raw.drawer.share.ariaReddit,
        ariaDiscord: raw.drawer.share.ariaDiscord,
        ariaEmail: raw.drawer.share.ariaEmail,
      },
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
    }
  }
}

export type LocaleStrings = ReturnType<typeof buildStrings>

const STRINGS_BY_LOCALE = Object.fromEntries(
  LOCALE_IDS.map((id) => [id, buildStrings(id)]),
) as Record<LocaleId, LocaleStrings>

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
