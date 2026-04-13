import { useEffect } from 'react'

import { Loading } from '@/components/Loading'
import { useGalaxyDataStore } from '@/store/galaxyDataStore'

import './App.css'

function App() {
  const status = useGalaxyDataStore((s) => s.status)
  const data = useGalaxyDataStore((s) => s.data)
  const errorMessage = useGalaxyDataStore((s) => s.errorMessage)
  const fetchGalaxyData = useGalaxyDataStore((s) => s.fetchGalaxyData)

  useEffect(() => {
    void fetchGalaxyData()
  }, [fetchGalaxyData])

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
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-xl font-semibold tracking-tight">TMDB Galaxy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Loaded {data?.movies.length ?? 0} movies (version {data?.meta.version ?? '—'}). Three.js scene
          arrives in Phase 3.4.
        </p>
      </div>
    </main>
  )
}

export default App
