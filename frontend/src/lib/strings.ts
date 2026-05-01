/**
 * HUD copy: English strings live in `./locales/en.json` ({{placeholder}} templates where needed).
 * Other locales can mirror this file; `STRINGS` keeps the same runtime shape as before.
 */

import en from './locales/en.json'

/** Replace `{{key}}` segments in order; values must be strings (coerce numbers at call sites if needed). */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
}

export const STRINGS = {
  loading: en.loading,
  galaxyData: {
    downloadProgress: (downloadedMb: string, totalMb: string) =>
      interpolate(en.galaxyData.downloadProgress, { downloadedMb, totalMb }),
    downloadProgressPartial: (downloadedMb: string) =>
      interpolate(en.galaxyData.downloadProgressPartial, { downloadedMb }),
    decompressingGzip: en.galaxyData.decompressingGzip,
    parsingJson: en.galaxyData.parsingJson,
    gzipUnsupported: en.galaxyData.gzipUnsupported,
    networkErrorHint: en.galaxyData.networkErrorHint,
    requestFailed: (url: string, hint: string, detail: string) =>
      interpolate(en.galaxyData.requestFailed, { url, hint, detail }),
    httpNotOk: (status: number, statusText: string, url: string, deployHintPath: string) =>
      interpolate(en.galaxyData.httpNotOk, {
        status: String(status),
        statusText,
        url,
        deployHintPath,
      }),
    emptyResponseBody: en.galaxyData.emptyResponseBody,
    jsonParseFailed: (detail: string) => interpolate(en.galaxyData.jsonParseFailed, { detail }),
  },
  error: en.error,
  searchBar: en.searchBar,
  hud: en.hud,
  timeline: en.timeline,
  info: en.info,
  scene: en.scene,
  drawer: {
    fallbackTitle: en.drawer.fallbackTitle,
    posterAlt: (title: string) => interpolate(en.drawer.posterAlt, { title }),
    posterPlaceholder: en.drawer.posterPlaceholder,
    sheetDescription: (title: string, releaseDate: string) =>
      interpolate(en.drawer.sheetDescription, { title, releaseDate }),
    sheetDescriptionEmpty: en.drawer.sheetDescriptionEmpty,
    votesLine: (count: string) => interpolate(en.drawer.votesLine, { count }),
    sections: en.drawer.sections,
    details: {
      missingValue: en.drawer.details.missingValue,
      runtime: en.drawer.details.runtime,
      runtimeMinutes: (minutes: number | string) =>
        interpolate(en.drawer.details.runtimeMinutes, { minutes: String(minutes) }),
      language: en.drawer.details.language,
      director: en.drawer.details.director,
      writers: en.drawer.details.writers,
      directorOfPhotography: en.drawer.details.directorOfPhotography,
      producers: en.drawer.details.producers,
      composer: en.drawer.details.composer,
      budget: en.drawer.details.budget,
      revenue: en.drawer.details.revenue,
    },
    links: en.drawer.links,
  },
  focusLReference: {
    ratingLine: (rating: string) => interpolate(en.focusLReference.ratingLine, { rating }),
    ariaLabel: (ratingLine: string, filmTitle: string) =>
      interpolate(en.focusLReference.ariaLabel, { ratingLine, filmTitle }),
  },
  focusVoteReference: {
    tierLabels: en.focusVoteReference.tierLabels,
  },
} as const
