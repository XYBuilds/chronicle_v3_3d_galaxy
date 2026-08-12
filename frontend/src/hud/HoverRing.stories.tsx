import type { Meta, StoryObj } from '@storybook/react-vite'

import { HoverRing } from './HoverRing'
import { HudCanvas } from '@/storybook/hudStoryHarness'
import { seedHoverRingStory } from '@/storybook/hudStoryState'

const meta: Meta<typeof HoverRing> = {
  title: 'Hover/HoverRing',
  component: HoverRing,
  decorators: [
    (Story) => (
      <HudCanvas prepare={seedHoverRingStory}>
        <Story />
      </HudCanvas>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof HoverRing>

export const Default: Story = {}
