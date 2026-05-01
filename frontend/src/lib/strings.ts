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
} as const
