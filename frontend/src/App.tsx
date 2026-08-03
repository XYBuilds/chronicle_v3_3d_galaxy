import { useCallback, useEffect, useRef, useState } from 'react'

import { executeAppEscape } from '@/appEscapeAdapter'
import { MovieDetailDrawer } from '@/components/Drawer'
import { LoadFailurePage } from '@/components/LoadFailurePage'
import { Loading } from '@/components/Loading'
import { MovieTooltip } from '@/components/MovieTooltip'
import { SearchBar } from '@/components/SearchBar'
import { Timeline } from '@/components/Timeline'
import { useLocaleFromQuery } from '@/hooks/useLocaleFromQuery'
import { useThemeFromQuery } from '@/hooks/useThemeFromQuery'
import { useTimelineOrientationFromQuery } from '@/hooks/useTimelineOrientationFromQuery'
import { FeedbackButton } from '@/hud/FeedbackButton'
import { FocusExitButton } from '@/hud/FocusExitButton'
import { isGalaxyFullscreenAvailable, toggleGalaxyFullscreen } from '@/hud/fullscreenApi'
import { FullscreenButton } from '@/hud/FullscreenButton'
import { HoverRing } from '@/hud/HoverRing'
import { InfoButton } from '@/hud/InfoButton'
import { LanguageSwitch } from '@/hud/LanguageSwitch'
import { SupportButton } from '@/hud/SupportButton'
import { TmdbAttribution } from '@/hud/TmdbAttribution'
import { useRouteController } from '@/lib/useRouteController'
import { getGalaxyAssetsManifest } from '@/lib/galaxyAssetUrls'
import {
  dispatchExplorationIntent,
  readExplorationContext,
} from '@/lib/exploration'
import { loadFocusEmissionProfile, type ResolvedFocusEmissionProfile } from '@/lib/focusEmissionProfileLoader'
import { useStrings } from '@/lib/strings'
import { clearSearchDraft } from '@/store/galaxyInteractionStore'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'
import { useSearchIndexStore } from '@/store/searchIndexStore'
import { mountGalaxyScene } from '@/three/scene'

import './App.css'

const APP_ESCAPE_DEPENDENCIES = {
  readContext: readExplorationContext,
  dispatchIntent: dispatchExplorationIntent,
  clearSearchDraft,
}

function App() {
  useThemeFromQuery()
  useLocaleFromQuery()
  const strings = useStrings()
  const timelineOrientation = useTimelineOrientationFromQuery()
  const status = useGalaxyDataStore((s) => s.status)
  const data = useGalaxyDataStore((s) => s.data)
  const errorMessage = useGalaxyDataStore((s) => s.errorMessage)
  const loadProgress = useGalaxyDataStore((s) => s.loadProgress)
  const fetchGalaxyData = useGalaxyDataStore((s) => s.fetchGalaxyData)
  const indexStatus = useSearchIndexStore((s) => s.status)
  const [focusEmissionProfile, setFocusEmissionProfile] = useState<ResolvedFocusEmissionProfile | null>(null)
  const [focusEmissionProfileVersion, setFocusEmissionProfileVersion] = useState<string | null>(null)
  const [focusEmissionError, setFocusEmissionError] = useState<string | null>(null)
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const animateZCurrentRef = useRef<((z: number, durationMs?: number) => void) | null>(null)
  const animateZCurrentTo = useCallback((z: number, durationMs?: number) => {
    animateZCurrentRef.current?.(z, durationMs)
  }, [])

  const indexHydrationTerminal =
    indexStatus === 'ready' || indexStatus === 'skipped' || indexStatus === 'error'
  const routeReady = status === 'ready' && data !== null && indexHydrationTerminal && focusEmissionProfile !== null && focusEmissionProfileVersion === data.meta.version

  useEffect(() => {
    void fetchGalaxyData()
  }, [fetchGalaxyData])

  useEffect(() => {
    if (status !== 'ready' || data === null) return
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      try {
        const manifest = await getGalaxyAssetsManifest()
        const resolved = await loadFocusEmissionProfile({
          manifest: manifest ?? { galaxy_data_gzip_url: '', data_version: data.meta.version },
          // A bundled dev run is an intentional compatibility fixture. Production must have a pointer.
          allowLegacyFallback: import.meta.env.DEV,
        })
        if (!cancelled) {
          setFocusEmissionProfile(resolved)
          setFocusEmissionProfileVersion(data.meta.version)
          setFocusEmissionError(null)
        }
      } catch (error) {
        if (!cancelled) setFocusEmissionError(error instanceof Error ? error.message : String(error))
      }
    })()
    return () => { cancelled = true }
  }, [status, data])

  useEffect(() => {
    document.getElementById('tmdb-attribution-static')?.remove()
  }, [])

  useRouteController({
    routeReady,
    movies: data?.movies ?? null,
  })

  type AppLoadPhase = 'galaxy-loading' | 'galaxy-error' | 'index-loading' | 'profile-loading' | 'profile-error' | 'started'
  let phase: AppLoadPhase
  if (status === 'loading' || status === 'idle') {
    phase = 'galaxy-loading'
  } else if (status === 'error') {
    phase = 'galaxy-error'
  } else if (focusEmissionError !== null) {
    phase = 'profile-error'
  } else if (status === 'ready' && data !== null && !indexHydrationTerminal) {
    phase = 'index-loading'
  } else if (focusEmissionProfile === null || focusEmissionProfileVersion !== data?.meta.version) {
    phase = 'profile-loading'
  } else {
    phase = 'started'
  }

  useEffect(() => {
    if (phase !== 'index-loading' || !data) return
    console.log('[App] search index hydrate in progress', {
      movies: data.movies.length,
      indexStatus,
    })
  }, [phase, data, indexStatus])

  useEffect(() => {
    if (!routeReady || !data) return
    const el = canvasHostRef.current
    if (!el) return
    const mount = mountGalaxyScene(el, data.meta, data.movies, focusEmissionProfile.lut)
    animateZCurrentRef.current = mount.controller.animateZCurrentTo
    return () => {
      animateZCurrentRef.current = null
      mount.dispose()
    }
  }, [routeReady, data, focusEmissionProfile])

  useEffect(() => {
    if (status !== 'ready' || !data) return
    void useSearchIndexStore.getState().hydrateFromGalaxyMeta(data.meta)
  }, [status, data])

  useEffect(() => {
    const onKeyDownCapture = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const searchInput = document.querySelector<HTMLInputElement>('input[data-galaxy-search-input]')
        if (!searchInput || searchInput.disabled) return

        const ae = document.activeElement
        const inOtherEditable =
          (ae instanceof HTMLInputElement ||
            ae instanceof HTMLTextAreaElement ||
            (ae instanceof HTMLElement && ae.isContentEditable)) &&
          !(ae instanceof HTMLInputElement && ae.hasAttribute('data-galaxy-search-input'))
        if (inOtherEditable) return

        e.preventDefault()
        e.stopPropagation()
        searchInput.focus()
        searchInput.select()
        return
      }

      if (e.key === 'f' || e.key === 'F') {
        const ae = document.activeElement
        if (
          ae instanceof HTMLInputElement ||
          ae instanceof HTMLTextAreaElement ||
          (ae instanceof HTMLElement && ae.isContentEditable)
        ) {
          return
        }
        if (!isGalaxyFullscreenAvailable()) return
        e.preventDefault()
        e.stopPropagation()
        void toggleGalaxyFullscreen().catch(() => {
          /* policy / gesture */
        })
        return
      }

      if (e.key !== 'Escape') return

      const ae = document.activeElement
      const searchInput =
        ae instanceof HTMLInputElement && ae.hasAttribute('data-galaxy-search-input')
          ? ae
          : null
      const infoDialogActive =
        ae instanceof HTMLElement && ae.closest('#app-info-dialog') !== null

      executeAppEscape({
        event: e,
        infoDialogActive,
        searchInput,
        dependencies: APP_ESCAPE_DEPENDENCIES,
      })
      return
    }

    window.addEventListener('keydown', onKeyDownCapture, true)
    return () => window.removeEventListener('keydown', onKeyDownCapture, true)
  }, [])

  if (phase === 'galaxy-loading') {
    return <Loading label={strings.loading.title} progress={loadProgress} gzipDone={false} indexStatus="pending" />
  }

  if (phase === 'galaxy-error') {
    return <LoadFailurePage errorMessage={errorMessage} onRetry={() => void fetchGalaxyData()} />
  }

  if (phase === 'profile-error') {
    return <LoadFailurePage errorMessage={focusEmissionError ?? 'Focus emission profile failed to load'} onRetry={() => void fetchGalaxyData()} />
  }

  if (phase === 'index-loading' && data !== null) {
    return <Loading label={strings.searchBar.indexLoading} progress={null} gzipDone indexStatus="loading" />
  }

  if (phase === 'profile-loading') {
    return <Loading label={strings.loading.title} progress={null} gzipDone indexStatus="pending" />
  }

  if (phase !== 'started' || data === null) {
    console.warn('[App] unexpected branch before main scene', { phase, status, hasData: data !== null })
    return <Loading label={strings.loading.title} progress={loadProgress} gzipDone={false} indexStatus="pending" />
  }

  const hasSearchIndex = data.meta.has_search_index === true

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[color:var(--cosmos-universe-bg)] text-foreground">
      <div
        ref={canvasHostRef}
        className="fixed inset-0 h-dvh w-full bg-[color:var(--cosmos-universe-bg)]"
        aria-label="Galaxy WebGL canvas host"
      />
      <HoverRing />
      <MovieTooltip />
      <TmdbAttribution className="pointer-events-none fixed z-[var(--z-hud-attribution)] bottom-[max(var(--hud-inset-sm),env(safe-area-inset-bottom,0px))] right-[max(var(--hud-inset-sm),env(safe-area-inset-right,0px))] sm:bottom-[max(var(--hud-inset-md),env(safe-area-inset-bottom,0px))] sm:right-[max(var(--hud-inset-md),env(safe-area-inset-right,0px))] [&_a]:pointer-events-auto" />
      <div
        dir="ltr"
        className="pointer-events-none fixed z-[var(--z-hud-top-tools)] flex items-center gap-[var(--hud-gap-stack)] right-[max(var(--hud-inset-sm),env(safe-area-inset-right,0px))] top-[max(var(--hud-inset-sm),env(safe-area-inset-top,0px))] sm:right-[max(var(--hud-inset-md),env(safe-area-inset-right,0px))] sm:top-[max(var(--hud-inset-md),env(safe-area-inset-top,0px))]"
      >
        <FeedbackButton />
        <SupportButton />
        <InfoButton />
        <LanguageSwitch />
        <FullscreenButton />
      </div>
      <SearchBar hasSearchIndex={hasSearchIndex} movies={data.movies} animateZCurrentTo={animateZCurrentTo} />
      <Timeline orientation={timelineOrientation} />
      <FocusExitButton />
      <MovieDetailDrawer animateZCurrentTo={animateZCurrentTo} hasSearchIndex={hasSearchIndex} />
    </main>
  )
}

export default App
