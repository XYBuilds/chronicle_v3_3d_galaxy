import { useEffect, useRef } from 'react'

import { Loading } from '@/components/Loading'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'
import { mountGalaxyScene } from '@/three/scene'

import './App.css'

function App() {
  const status = useGalaxyDataStore((s) => s.status)
  const data = useGalaxyDataStore((s) => s.data)
  const errorMessage = useGalaxyDataStore((s) => s.errorMessage)
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

  if (status === 'loading' || status === 'idle') {
    return <Loading />
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <h1 className="text-lg font-medium">Could not load galaxy data</h1>
        <p className="max-w-lg text-sm text-muted-foreground whitespace-pre-wrap">{errorMessage}</p>
        <p className="text-xs text-muted-foreground">
          Run the Python pipeline to produce{' '}
          <code className="rounded bg-muted px-1 py-0.5">frontend/public/data/galaxy_data.json</code>
        </p>
      </div>
    )
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-foreground">
      <div
        ref={canvasHostRef}
        className="fixed inset-0 h-dvh w-full bg-black"
        aria-label="Galaxy WebGL canvas host"
      />
    </main>
  )
}

export default App
