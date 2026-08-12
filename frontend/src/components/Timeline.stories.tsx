import { useCallback, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'

import { TimelineHud } from './Timeline'
import { SUBSAMPLE_DECIMAL_Z_RANGE } from '@/storybook/fixtures/subsampleMovies'
import { HudCanvas } from '@/storybook/hudStoryHarness'

const meta: Meta<typeof TimelineHud> = {
  title: 'Timeline',
  component: TimelineHud,
  decorators: [
    (Story) => (
      <HudCanvas>
        <Story />
      </HudCanvas>
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
    orientation: 'vertical',
  },
}

export const Horizontal: Story = {
  args: {
    zRange: [zLo, zHi],
    cameraZ: (zLo + zHi) / 2,
    orientation: 'horizontal',
  },
}

export const CameraAtMinZ: Story = {
  args: {
    zRange: [zLo, zHi],
    cameraZ: zLo,
    orientation: 'vertical',
  },
}

export const CameraAtMaxZ: Story = {
  args: {
    zRange: [zLo, zHi],
    cameraZ: zHi,
    orientation: 'vertical',
  },
}

export const WideZSpan: Story = {
  args: {
    zRange: [1874, 2026],
    cameraZ: 1950,
    orientation: 'vertical',
  },
}

function InteractiveHudHarness() {
  const [z, setZ] = useState((zLo + zHi) / 2)
  const onZCurrentChange = useCallback((next: number) => setZ(next), [])
  return (
    <TimelineHud
      orientation="horizontal"
      zRange={[zLo, zHi]}
      cameraZ={z}
      onZCurrentChange={onZCurrentChange}
    />
  )
}

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

export const InteractiveVertical: Story = {
  render: () => <InteractiveVerticalHarness />,
}
