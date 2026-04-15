import type { Meta, StoryObj } from '@storybook/react-vite'

import { TimelineHud } from './Timeline'
import { SUBSAMPLE_DECIMAL_Z_RANGE } from '@/storybook/fixtures/subsampleMovies'

const meta: Meta<typeof TimelineHud> = {
  title: 'Timeline',
  component: TimelineHud,
  decorators: [
    (Story) => (
      <div className="relative min-h-[560px] w-full min-w-[480px] bg-neutral-950">
        <Story />
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof TimelineHud>

const [zLo, zHi] = SUBSAMPLE_DECIMAL_Z_RANGE

export const Default: Story = {
  args: {
    zRange: [zLo, zHi],
    cameraZ: (zLo + zHi) / 2,
  },
}

/** Indicator sits on the oldest edge of the subsample-derived range. */
export const CameraAtMinZ: Story = {
  args: {
    zRange: [zLo, zHi],
    cameraZ: zLo,
  },
}

/** Indicator sits on the newest edge of the subsample-derived range. */
export const CameraAtMaxZ: Story = {
  args: {
    zRange: [zLo, zHi],
    cameraZ: zHi,
  },
}

/** Wider span than fixture movies alone — tick density stress. */
export const WideZSpan: Story = {
  args: {
    zRange: [1874, 2026],
    cameraZ: 1950,
  },
}
