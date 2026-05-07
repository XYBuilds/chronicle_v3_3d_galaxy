import type { Meta, StoryObj } from '@storybook/react-vite'

import { LoadFailurePage } from './LoadFailurePage'
import { STRINGS } from '@/lib/strings'

const meta: Meta<typeof LoadFailurePage> = {
  title: 'LoadFailurePage',
  component: LoadFailurePage,
  decorators: [
    (Story) => (
      <div className="relative isolate min-h-[520px] w-full min-w-[360px] overflow-hidden bg-background">
        <Story />
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof LoadFailurePage>

/** Typical fetch failure (offline / bad host). */
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

/** Body is not gzip when gzip bytes were expected (e.g. HTML error page). */
export const GzipFailure: Story = {
  args: {
    errorMessage:
      '[GalaxyData] Decompression failed: The provided data is not a valid gzip stream (truncated or corrupted).',
    onRetry: () => {},
  },
}

/** JSON parse after successful download/decompress. */
export const JsonParseFailure: Story = {
  args: {
    errorMessage: STRINGS.galaxyData.jsonParseFailed(
      `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`,
    ),
    onRetry: () => {},
  },
}

/** Long multiline stack / upstream error blob — verify scroll + collapse default. */
export const LongStackTrace: Story = {
  args: {
    errorMessage: [
      '[GalaxyData] Request failed for https://cdn.example/galaxy_data.json.gz: upstream reset',
      '',
      'AggregateError: All promises were rejected',
      '    at settle (node:internal/promises:xxx)',
      '    at internalConnectMultiple (node:net:xxx)',
      '    at afterConnectMultiple (node:net:xxx)',
      '    ... 42 more lines omitted for fixture ...',
      'Caused by: Error: ECONNRESET',
      '    at TLSWrap.onStreamRead (node:internal/stream_base_commons:xxx)',
    ].join('\n'),
    onRetry: () => {},
  },
}
