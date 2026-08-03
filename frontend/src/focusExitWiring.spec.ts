import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  exitFocus: vi.fn(),
  movies: [{ id: 101 }],
  selectedMovieId: 101 as number | null,
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useCallback: (callback: unknown) => callback,
    useEffect: vi.fn((effect: () => void | (() => void)) => {
      harness.effects.push(effect)
    }),
    useMemo: (factory: () => unknown) => factory(),
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => [
      typeof initial === 'function' ? (initial as () => unknown)() : initial,
      vi.fn(),
    ],
  }
})

vi.mock('@/lib/exploration', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/exploration')>()
  return { ...actual, exitFocus: harness.exitFocus }
})

vi.mock('@/lib/strings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/strings')>()
  return { ...actual, useStrings: () => actual.STRINGS }
})

vi.mock('@/store/galaxyDataStore', () => ({
  useGalaxyDataStore: (selector: (state: unknown) => unknown) =>
    selector({ data: { movies: harness.movies } }),
}))

vi.mock('@/store/galaxyInteractionStore', () => ({
  useGalaxyInteractionStore: (selector: (state: unknown) => unknown) =>
    selector({ selectedMovieId: harness.selectedMovieId }),
}))

import { MovieDetailDrawer } from '@/components/Drawer'
import { FocusExitButton } from '@/hud/FocusExitButton'

type ElementWithProps<Props> = { props: Props }

describe('focus exit UI wiring', () => {
  beforeEach(() => {
    harness.effects.length = 0
    harness.exitFocus.mockClear()
    harness.movies = [{ id: 101 }]
    harness.selectedMovieId = 101
  })

  it('routes the focus exit button click through the shared semantic exit once', () => {
    const view = FocusExitButton() as unknown as ElementWithProps<{
      children: ElementWithProps<{ onClick: () => void }>
    }>

    view.props.children.props.onClick()

    expect(harness.exitFocus).toHaveBeenCalledOnce()
  })

  it('routes drawer close through the shared semantic exit once', () => {
    const view = MovieDetailDrawer({}) as unknown as ElementWithProps<{
      onOpenChange: (open: boolean) => void
    }>

    view.props.onOpenChange(false)

    expect(harness.exitFocus).toHaveBeenCalledOnce()
  })

  it('routes the missing-movie defensive effect through the same exit', () => {
    harness.movies = [{ id: 202 }]
    MovieDetailDrawer({})

    harness.effects[0]?.()

    expect(harness.exitFocus).toHaveBeenCalledOnce()
  })
})
