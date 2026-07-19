import type { Meta, StoryObj } from '@storybook/react-vite'

import { Loading } from './Loading'

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
    label: 'Loading search index…',
    progress: null,
    gzipDone: true,
    indexStatus: 'loading',
  },
}

export const PhaseSearchIndexSkipped: Story = {
  args: {
    label: 'Loading search index…',
    progress: null,
    gzipDone: true,
    indexStatus: 'skipped',
  },
}

export const PhaseSearchIndexFailed: Story = {
  args: {
    label: 'Loading search index…',
    progress: null,
    gzipDone: true,
    indexStatus: 'error',
  },
}
