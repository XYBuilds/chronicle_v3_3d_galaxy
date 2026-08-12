import { dispatchExplorationIntent } from '@/lib/exploration'
import type { LocaleId } from '@/lib/locales'
import { useGalaxyInteractionStore } from '@/store/galaxyInteractionStore'
import { useLocaleStore } from '@/store/localeStore'
import { useSearchIndexStore } from '@/store/searchIndexStore'
import { subsampleMovieKika } from '@/storybook/fixtures/subsampleMovies'

const STORYBOOK_SEARCH_INDEX = {
  version: 'storybook-hud',
  people: {},
  genres: {},
} as const

export function stubFullscreenAvailable(): void {
  try {
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      get: () => true,
    })
  } catch {
    /* iframe / non-configurable */
  }
}

export function resetHudStoryStores(): void {
  stubFullscreenAvailable()
  useGalaxyInteractionStore.setState({
    hoveredMovieId: null,
    explorationContext: { kind: 'idle' },
    hoverAnchorCss: null,
    hoverPlanetRadiusCss: null,
    searchQuery: '',
    searchResults: [],
  })
  useSearchIndexStore.setState({
    status: 'ready',
    data: { ...STORYBOOK_SEARCH_INDEX },
    errorMessage: null,
  })
  if (useLocaleStore.getState().locale !== 'en') {
    useLocaleStore.getState().setLocale('en')
  }
}

export function seedFocusStory(movieId: number = subsampleMovieKika.id): void {
  dispatchExplorationIntent({
    type: 'focus/requested',
    movieId,
    policy: 'replace',
  })
}

export function seedHoverRingStory(anchor = { x: 420, y: 280 }, planetRadiusCss = 52): void {
  useGalaxyInteractionStore.setState({
    hoverAnchorCss: anchor,
    hoverPlanetRadiusCss: planetRadiusCss,
  })
}

export function applyHudLocale(locale: LocaleId): void {
  if (useLocaleStore.getState().locale !== locale) {
    useLocaleStore.getState().setLocale(locale)
  }
}
