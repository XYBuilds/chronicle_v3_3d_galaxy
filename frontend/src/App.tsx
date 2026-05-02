import { useEffect, useMemo, useRef, useState } from 'react'

import { MovieDetailDrawer } from '@/components/Drawer'
import { SearchBar } from '@/components/SearchBar'
import { useThemeFromQuery } from '@/hooks/useThemeFromQuery'
import { useTimelineOrientationFromQuery } from '@/hooks/useTimelineOrientationFromQuery'
import { Loading } from '@/components/Loading'
import { MovieTooltip } from '@/components/MovieTooltip'
import { Timeline } from '@/components/Timeline'
import { HoverRing } from '@/hud/HoverRing'
import { FocusLReference } from '@/hud/FocusLReference'
import { FullscreenButton } from '@/hud/FullscreenButton'
import { InfoButton } from '@/hud/InfoButton'
import { isGalaxyFullscreenAvailable, toggleGalaxyFullscreen } from '@/hud/fullscreenApi'
import { clearSearch, useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'
import { useSearchIndexStore } from '@/store/searchIndexStore'
import { STRINGS } from '@/lib/strings'
import { mountGalaxyScene } from '@/three/scene'

import './App.css'

function App() {
  useThemeFromQuery()
  const timelineOrientation = useTimelineOrientationFromQuery()
  const status = useGalaxyDataStore((s) => s.status)
  const data = useGalaxyDataStore((s) => s.data)
  const errorMessage = useGalaxyDataStore((s) => s.errorMessage)
  const loadProgress = useGalaxyDataStore((s) => s.loadProgress)
  const fetchGalaxyData = useGalaxyDataStore((s) => s.fetchGalaxyData)
  const indexStatus = useSearchIndexStore((s) => s.status)
  const canvasHostRef = useRef<HTMLDivElement>(null)

  const indexHydrationTerminal =
    indexStatus === 'ready' || indexStatus === 'skipped' || indexStatus === 'error'

  const [started, setStarted] = useState(false)

  type AppLoadPhase = 'galaxy-loading' | 'galaxy-error' | 'index-loading' | 'await-start' | 'started'

  const phase: AppLoadPhase = useMemo(() => {
    if (status === 'loading' || status === 'idle') return 'galaxy-loading'
    if (status === 'error') return 'galaxy-error'
    if (status === 'ready' && data !== null && !indexHydrationTerminal) return 'index-loading'
    if (status === 'ready' && data !== null && indexHydrationTerminal && !started) return 'await-start'
    if (status === 'ready' && data !== null && indexHydrationTerminal && started) return 'started'
    return 'galaxy-loading'
  }, [status, data, indexHydrationTerminal, started])

  useEffect(() => {
    if (phase !== 'index-loading' || !data) return
    console.log('[App] search index hydrate in progress', {
      movies: data.movies.length,
      indexStatus,
    })
  }, [phase, data, indexStatus])

  useEffect(() => {
    void fetchGalaxyData()
  }, [fetchGalaxyData])

  useEffect(() => {
    if (!started || status !== 'ready' || !data || !indexHydrationTerminal) return
    const el = canvasHostRef.current
    if (!el) return
    const mount = mountGalaxyScene(el, data.meta, data.movies)
    return () => mount.dispose()
  }, [started, status, data, indexHydrationTerminal])

  useEffect(() => {
    if (status !== 'ready' || !data) return
    void useSearchIndexStore.getState().hydrateFromGalaxyMeta(data.meta)
  }, [status, data])

  /** Design Spec §4.6 — ESC 焦点栈；§P14.4 — F 全屏；§P14.5 — Cmd/Ctrl+K 聚焦搜索。 */
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
        mode="loading"
        label={STRINGS.loading.title}
        progress={loadProgress}
        gzipDone={false}
        indexStatus="pending"
      />
    )
  }

  if (phase === 'galaxy-error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <h1 className="text-lg font-medium">{STRINGS.error.title}</h1>
        <p className="max-w-lg text-sm text-muted-foreground whitespace-pre-wrap">{errorMessage}</p>
        <p className="text-xs text-muted-foreground">
          {STRINGS.error.localDevHintBeforeCode}
          <code className="rounded bg-muted px-1 py-0.5">frontend/public/data/galaxy_data.json</code>
          {STRINGS.error.localDevBetweenCodes}
          <code className="rounded bg-muted px-1 py-0.5">galaxy_data.json.gz</code>
          {STRINGS.error.localDevHintAfterCode}
        </p>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          onClick={() => void fetchGalaxyData()}
        >
          {STRINGS.error.retry}
        </button>
      </div>
    )
  }

  if (phase === 'index-loading' && data !== null) {
    return (
      <Loading
        mode="loading"
        label={STRINGS.searchBar.indexLoading}
        progress={null}
        gzipDone
        indexStatus="loading"
      />
    )
  }

  if (phase === 'await-start' && data !== null) {
    const coverIndexStatus =
      indexStatus === 'skipped' ? 'skipped' : indexStatus === 'error' ? 'error' : 'ready'
    return (
      <Loading
        mode="await-start"
        label={STRINGS.cover.title}
        progress={null}
        gzipDone
        indexStatus={coverIndexStatus}
        onStart={() => {
          setStarted(true)
          console.log('[App] Cover Start — mounting WebGL scene')
        }}
      />
    )
  }

  if (phase !== 'started' || data === null) {
    console.warn('[App] unexpected branch before main scene', { phase, status, hasData: data !== null })
    return (
      <Loading
        mode="loading"
        label={STRINGS.loading.title}
        progress={loadProgress}
        gzipDone={false}
        indexStatus="pending"
      />
    )
  }

  const hasSearchIndex = data.meta.has_search_index === true

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-foreground">
      <div
        ref={canvasHostRef}
        className="fixed inset-0 h-dvh w-full bg-black"
        aria-label="Galaxy WebGL canvas host"
      />
      <SearchBar hasSearchIndex={hasSearchIndex} movies={data.movies} />
      <HoverRing />
      <MovieTooltip />
      <InfoButton />
      <FullscreenButton />
      <FocusLReference />
      <Timeline orientation={timelineOrientation} />
      <MovieDetailDrawer />
    </main>
  )
}

export default App
