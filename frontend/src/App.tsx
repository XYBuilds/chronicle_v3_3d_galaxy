import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { MovieDetailDrawer } from '@/components/Drawer'
import { SearchBar } from '@/components/SearchBar'
import { useLocaleFromQuery } from '@/hooks/useLocaleFromQuery'
import { useThemeFromQuery } from '@/hooks/useThemeFromQuery'
import { useTimelineOrientationFromQuery } from '@/hooks/useTimelineOrientationFromQuery'
import { LoadFailurePage } from '@/components/LoadFailurePage'
import { Loading } from '@/components/Loading'
import { MovieTooltip } from '@/components/MovieTooltip'
import { Timeline } from '@/components/Timeline'
import { CoverBackdrop } from '@/hud/CoverBackdrop'
import { HoverRing } from '@/hud/HoverRing'
import { FocusExitButton } from '@/hud/FocusExitButton'
import { FocusLReference } from '@/hud/FocusLReference'
import { FullscreenButton } from '@/hud/FullscreenButton'
import { InfoButton } from '@/hud/InfoButton'
import { LanguageSwitch } from '@/hud/LanguageSwitch'
import { isGalaxyFullscreenAvailable, toggleGalaxyFullscreen } from '@/hud/fullscreenApi'
import { resolveTodayMovieId } from '@/data/loadToday'
import { clearSearch, useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { useCoverModeStore } from '@/store/coverModeStore'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'
import { useSearchIndexStore } from '@/store/searchIndexStore'
import { useStrings } from '@/lib/strings'
import { cn } from '@/lib/utils'
import { mountGalaxyScene } from '@/three/scene'

import './App.css'

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
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const animateZCurrentRef = useRef<((z: number, durationMs?: number) => void) | null>(null)
  const animateZCurrentTo = useCallback((z: number, durationMs?: number) => {
    animateZCurrentRef.current?.(z, durationMs)
  }, [])

  const indexHydrationTerminal =
    indexStatus === 'ready' || indexStatus === 'skipped' || indexStatus === 'error'

  useEffect(() => {
    void fetchGalaxyData()
  }, [fetchGalaxyData])

  /** P23.3 — today.json resolved + cover store seeded; scene may mount. */
  const [coverBootReady, setCoverBootReady] = useState(false)

  const coverMode = useCoverModeStore((s) => s.coverMode)
  const todayMovieId = useCoverModeStore((s) => s.todayMovieId)
  const todayMovie = useMemo(() => {
    if (!data || todayMovieId == null) return null
    return data.movies.find((m) => m.id === todayMovieId) ?? null
  }, [data, todayMovieId])

  /** P23.4 — keep cover shell mounted through opacity fade after exitCoverIntoFocus. */
  const [coverBrandMounted, setCoverBrandMounted] = useState(false)
  useLayoutEffect(() => {
    if (coverMode) setCoverBrandMounted(true)
  }, [coverMode])

  type AppLoadPhase =
    | 'galaxy-loading'
    | 'galaxy-error'
    | 'index-loading'
    | 'cover-loading-today'
    | 'started'

  const phase: AppLoadPhase = useMemo(() => {
    if (status === 'loading' || status === 'idle') return 'galaxy-loading'
    if (status === 'error') return 'galaxy-error'
    if (status === 'ready' && data !== null && !indexHydrationTerminal) return 'index-loading'
    if (status === 'ready' && data !== null && indexHydrationTerminal && !coverBootReady) {
      return 'cover-loading-today'
    }
    if (status === 'ready' && data !== null && indexHydrationTerminal && coverBootReady) return 'started'
    return 'galaxy-loading'
  }, [status, data, indexHydrationTerminal, coverBootReady])

  useEffect(() => {
    if (phase !== 'index-loading' || !data) return
    console.log('[App] search index hydrate in progress', {
      movies: data.movies.length,
      indexStatus,
    })
  }, [phase, data, indexStatus])

  /** P23.3 — resolve The Movie Today before mounting WebGL (deterministic id + fallback). */
  useEffect(() => {
    if (status !== 'ready' || !data || !indexHydrationTerminal || coverBootReady) return
    let cancelled = false
    void (async () => {
      const { movieId } = await resolveTodayMovieId(data.movies)
      if (cancelled) return
      console.log('[App] today resolved → cover + scene gate', { movieId })
      useCoverModeStore.getState().setCover(movieId)
      setCoverBootReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [status, data, indexHydrationTerminal, coverBootReady])

  useEffect(() => {
    if (phase !== 'started' || !data || !indexHydrationTerminal) return
    const el = canvasHostRef.current
    if (!el) return
    const mount = mountGalaxyScene(el, data.meta, data.movies)
    animateZCurrentRef.current = mount.controller.animateZCurrentTo
    return () => {
      animateZCurrentRef.current = null
      mount.dispose()
    }
  }, [phase, data, indexHydrationTerminal])

  useEffect(() => {
    if (status !== 'ready' || !data) return
    void useSearchIndexStore.getState().hydrateFromGalaxyMeta(data.meta)
  }, [status, data])

  /** Design Spec §4.6 — ESC 焦点栈；§P14.4 — F 全屏；§P14.5 — Cmd/Ctrl+K 聚焦搜索。 */
  useEffect(() => {
    const onKeyDownCapture = (e: KeyboardEvent) => {
      const cov = useCoverModeStore.getState()
      if (cov.coverMode && cov.todayMovieId !== null) {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          return
        }
        if (e.key === 'Enter' || e.key === ' ') {
          const ae = document.activeElement
          if (
            ae instanceof HTMLInputElement ||
            ae instanceof HTMLTextAreaElement ||
            (ae instanceof HTMLElement && ae.isContentEditable)
          ) {
            return
          }
          e.preventDefault()
          e.stopPropagation()
          cov.exitCoverIntoFocus()
          return
        }
      }

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
      if (ae instanceof HTMLElement && ae.closest('#app-info-dialog')) return

      if (ae instanceof HTMLInputElement && ae.hasAttribute('data-galaxy-search-input')) {
        ae.blur()
        e.preventDefault()
        e.stopPropagation()
        return
      }

      const { selectedMovieId, searchMode } = useGalaxyInteractionStore.getState()

      if (selectedMovieId !== null) {
        useGalaxyInteractionStore.setState({ selectedMovieId: null })
        console.log('[ESC] clear selectedMovieId (keep search select session if any)', {
          searchMode,
        })
        e.preventDefault()
        e.stopPropagation()
        return
      }

      if (searchMode !== 'idle') {
        clearSearch()
        console.log('[ESC] clearSearch (exit person/genre select)')
        e.preventDefault()
        e.stopPropagation()
      }
    }

    window.addEventListener('keydown', onKeyDownCapture, true)
    return () => window.removeEventListener('keydown', onKeyDownCapture, true)
  }, [])

  if (phase === 'galaxy-loading') {
    return (
      <Loading
        label={strings.loading.title}
        progress={loadProgress}
        gzipDone={false}
        indexStatus="pending"
      />
    )
  }

  if (phase === 'galaxy-error') {
    return (
      <LoadFailurePage errorMessage={errorMessage} onRetry={() => void fetchGalaxyData()} />
    )
  }

  if (phase === 'index-loading' && data !== null) {
    return (
      <Loading
        label={strings.searchBar.indexLoading}
        progress={null}
        gzipDone
        indexStatus="loading"
      />
    )
  }

  if (phase === 'cover-loading-today' && data !== null) {
    const coverIndexStatus =
      indexStatus === 'skipped' ? 'skipped' : indexStatus === 'error' ? 'error' : 'ready'
    return (
      <Loading
        label={strings.loading.title}
        progress={null}
        gzipDone
        indexStatus={coverIndexStatus}
      />
    )
  }

  if (phase !== 'started' || data === null) {
    console.warn('[App] unexpected branch before main scene', { phase, status, hasData: data !== null })
    return (
      <Loading
        label={strings.loading.title}
        progress={loadProgress}
        gzipDone={false}
        indexStatus="pending"
      />
    )
  }

  const hasSearchIndex = data.meta.has_search_index === true

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[color:var(--cosmos-universe-bg)] text-foreground">
      <div
        ref={canvasHostRef}
        className="fixed inset-0 h-dvh w-full bg-[color:var(--cosmos-universe-bg)]"
        aria-label="Galaxy WebGL canvas host"
      />
      {coverBrandMounted ? (
        <>
          <div
            key={`cover-shade-${todayMovieId ?? 0}`}
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[25] cosmos-cover-entry-page-shade"
          />
          <div
            className={cn(
              'pointer-events-none fixed inset-0 z-30 transition-opacity duration-300 ease-out',
              coverMode ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden
            onTransitionEnd={(ev) => {
              if (ev.propertyName !== 'opacity') return
              if (ev.target !== ev.currentTarget) return
              if (!useCoverModeStore.getState().coverMode) {
                setCoverBrandMounted(false)
              }
            }}
          >
            <CoverBackdrop
              key={todayMovieId ?? 0}
              todayFocusAriaLabel={strings.cover.todayFocusAriaLabel(todayMovie?.title ?? '')}
              showTodayFocusTrap={coverMode && todayMovieId !== null}
            />
          </div>
        </>
      ) : null}
      <HoverRing />
      <MovieTooltip />
      {!coverMode ? (
        <>
          <SearchBar hasSearchIndex={hasSearchIndex} movies={data.movies} animateZCurrentTo={animateZCurrentTo} />
          <div className="pointer-events-none fixed right-3 top-3 z-40 flex items-center gap-2 sm:right-4 sm:top-4">
            <InfoButton />
            <LanguageSwitch />
            <FullscreenButton />
          </div>
          <FocusLReference />
          <Timeline orientation={timelineOrientation} />
          <FocusExitButton />
          <MovieDetailDrawer />
        </>
      ) : null}
    </main>
  )
}

export default App
