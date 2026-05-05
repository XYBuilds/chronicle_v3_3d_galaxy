import type { Meta, StoryObj } from '@storybook/react-vite'

import { Loading } from './Loading'
import { STRINGS } from '@/lib/strings'

const meta: Meta<typeof Loading> = {
  title: 'Loading',
  component: Loading,
  decorators: [
    (Story) => (
      <div className="relative isolate min-h-[480px] w-full min-w-[360px] overflow-hidden bg-background">
        <Story />
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof Loading>

export const Default: Story = {
  args: {},
}

export const CustomLabel: Story = {
  args: {
    label: 'Fetching subsample rows from data/subsample/TMDB_all_movies_random20.csv',
  },
}

/** Galaxy gzip finished; fourth step = search index hydrate (matches App index-loading overlay). */
export const PhaseSearchIndexLoading: Story = {
  args: {
    mode: 'loading',
    label: 'Loading search index…',
    progress: null,
    gzipDone: true,
    indexStatus: 'loading',
  },
}

export const PhaseSearchIndexSkipped: Story = {
  args: {
    mode: 'loading',
    label: 'Loading search index…',
    progress: null,
    gzipDone: true,
    indexStatus: 'skipped',
  },
}

export const PhaseSearchIndexFailed: Story = {
  args: {
    mode: 'loading',
    label: 'Loading search index…',
    progress: null,
    gzipDone: true,
    indexStatus: 'error',
  },
}

/** Cover — fourth step complete (ready); spinner hidden, Start CTA (matches App await-start). */
export const CoverAwaitStart: Story = {
  args: {
    mode: 'await-start',
    label: STRINGS.cover.title,
    progress: null,
    gzipDone: true,
    indexStatus: 'ready',
    onStart: () => {},
  },
}

/** Cover — bundle without search index (fourth step skipped). */
export const CoverIndexSkipped: Story = {
  args: {
    mode: 'await-start',
    label: STRINGS.cover.title,
    progress: null,
    gzipDone: true,
    indexStatus: 'skipped',
    onStart: () => {},
  },
}

/** Cover — search index hydrate failed; user can still enter (search disabled at runtime). */
export const CoverIndexFailed: Story = {
  args: {
    mode: 'await-start',
    label: STRINGS.cover.title,
    progress: null,
    gzipDone: true,
    indexStatus: 'error',
    onStart: () => {},
  },
}
