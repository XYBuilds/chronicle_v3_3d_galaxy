import { useEffect, useRef } from 'react'

import { MovieDetailDrawer } from '@/components/Drawer'
import { SearchBar } from '@/components/SearchBar'
import { useThemeFromQuery } from '@/hooks/useThemeFromQuery'
import { Loading } from '@/components/Loading'
import { MovieTooltip } from '@/components/MovieTooltip'
import { Timeline } from '@/components/Timeline'
import { HoverRing } from '@/hud/HoverRing'
import { FocusLReference } from '@/hud/FocusLReference'
import { InfoButton } from '@/hud/InfoButton'
import { clearSearch, useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'
import { useSearchIndexStore } from '@/store/searchIndexStore'
import { mountGalaxyScene } from '@/three/scene'

import './App.css'

function App() {
  useThemeFromQuery()
  const status = useGalaxyDataStore((s) => s.status)
  const data = useGalaxyDataStore((s) => s.data)
  const errorMessage = useGalaxyDataStore((s) => s.errorMessage)
  const loadProgress = useGalaxyDataStore((s) => s.loadProgress)
  const fetchGalaxyData = useGalaxyDataStore((s) => s.fetchGalaxyData)
  const canvasHostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void fetchGalaxyData()
  }, [fetchGalaxyData])

  useEffect(() => {
    if (status !== 'ready' || !data) return
    const el = canvasHostRef.current
    if (!el) return
    const mount = mountGalaxyScene(el, data.meta, data.movies)
    return () => mount.dispose()
  }, [status, data])

  useEffect(() => {
    if (status !== 'ready' || !data) return
    void useSearchIndexStore.getState().hydrateFromGalaxyMeta(data.meta)
  }, [status, data])

  /** Design Spec §4.6 — ESC 焦点栈（capture）：blur 搜索框 → 取消 focus → 退出 select；INFO Modal 内不交叠。 */
  useEffect(() => {
    const onKeyDownCapture = (e: KeyboardEvent) => {
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

  if (status === 'loading' || status === 'idle') {
    return <Loading progress={loadProgress} />
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <h1 className="text-lg font-medium">Could not load galaxy data</h1>
        <p className="max-w-lg text-sm text-muted-foreground whitespace-pre-wrap">{errorMessage}</p>
        <p className="text-xs text-muted-foreground">
          本地开发：运行 Python 管线生成{' '}
          <code className="rounded bg-muted px-1 py-0.5">frontend/public/data/galaxy_data.json</code>
          （gitignore）；导出脚本会同步写入{' '}
          <code className="rounded bg-muted px-1 py-0.5">galaxy_data.json.gz</code>
          供前端加载。
        </p>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          onClick={() => void fetchGalaxyData()}
        >
          重试
        </button>
      </div>
    )
  }

  if (data === null) {
    return <Loading progress={loadProgress} />
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
      <FocusLReference />
      <Timeline />
      <MovieDetailDrawer />
    </main>
  )
}

export default App
