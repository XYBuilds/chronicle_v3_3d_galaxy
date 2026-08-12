import type { Meta, StoryObj } from '@storybook/react-vite'

import { Loading } from './Loading'
import { HudCanvas } from '@/storybook/hudStoryHarness'

const meta: Meta<typeof Loading> = {
  title: 'Boot/Loading',
  component: Loading,
  decorators: [
    (Story) => (
      <HudCanvas>
        <Story />
      </HudCanvas>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof Loading>

export const Default: Story = {
  args: {},
}

export const SearchIndexLoading: Story = {
  args: {
    label: 'Loading search index…',
    progress: null,
    gzipDone: true,
    indexStatus: 'loading',
  },
}

export const SearchIndexFailed: Story = {
  args: {
    label: 'Loading search index…',
    progress: null,
    gzipDone: true,
    indexStatus: 'error',
  },
}
