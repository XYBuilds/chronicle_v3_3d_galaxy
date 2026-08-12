import type { Meta, StoryObj } from '@storybook/react-vite'

import { LoadFailurePage } from './LoadFailurePage'
import { STRINGS } from '@/lib/strings'
import { HudCanvas } from '@/storybook/hudStoryHarness'

const meta: Meta<typeof LoadFailurePage> = {
  title: 'Boot/LoadFailure',
  component: LoadFailurePage,
  decorators: [
    (Story) => (
      <HudCanvas>
        <Story />
      </HudCanvas>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof LoadFailurePage>

export const NetworkFailure: Story = {
  args: {
    errorMessage: STRINGS.galaxyData.requestFailed(
      'https://invalid.example/galaxy_data.json.gz',
      STRINGS.galaxyData.networkErrorHint,
      'Failed to fetch',
    ),
    onRetry: () => {},
  },
}

export const GzipFailure: Story = {
  args: {
    errorMessage:
      '[GalaxyData] Decompression failed: The provided data is not a valid gzip stream (truncated or corrupted).',
    onRetry: () => {},
  },
}

export const JsonParseFailure: Story = {
  args: {
    errorMessage: STRINGS.galaxyData.jsonParseFailed(
      `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`,
    ),
    onRetry: () => {},
  },
}
