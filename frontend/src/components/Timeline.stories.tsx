import { useCallback, useState } from 'react'
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

/** Default app orientation: bottom-centered horizontal axis. */
export const Default: Story = {
  args: {
    zRange: [zLo, zHi],
    cameraZ: (zLo + zHi) / 2,
    orientation: 'horizontal',
  },
}

/** Left rail variant; `?timeline=vertical` in the app. */
export const Vertical: Story = {
  args: {
    zRange: [zLo, zHi],
    cameraZ: (zLo + zHi) / 2,
    orientation: 'vertical',
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

function InteractiveHudHarness() {
  const [z, setZ] = useState((zLo + zHi) / 2)
  const onZCurrentChange = useCallback((next: number) => setZ(next), [])
  return <TimelineHud zRange={[zLo, zHi]} cameraZ={z} onZCurrentChange={onZCurrentChange} />
}

/** Drag the track or click ticks (default horizontal axis). */
export const Interactive: Story = {
  render: () => <InteractiveHudHarness />,
}

function InteractiveVerticalHarness() {
  const [z, setZ] = useState((zLo + zHi) / 2)
  const onZCurrentChange = useCallback((next: number) => setZ(next), [])
  return (
    <TimelineHud
      orientation="vertical"
      zRange={[zLo, zHi]}
      cameraZ={z}
      onZCurrentChange={onZCurrentChange}
    />
  )
}

/** Vertical rail drag/click (matches `?timeline=vertical`). */
export const InteractiveVertical: Story = {
  render: () => <InteractiveVerticalHarness />,
}
