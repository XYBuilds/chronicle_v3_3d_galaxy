import type { Meta, StoryObj } from '@storybook/react-vite'

import { FocusExitButton } from './FocusExitButton'
import { HudCanvas } from '@/storybook/hudStoryHarness'
import { seedFocusStory } from '@/storybook/hudStoryState'

const meta: Meta<typeof FocusExitButton> = {
  title: 'Chrome/FocusExit',
  component: FocusExitButton,
  decorators: [
    (Story) => (
      <HudCanvas prepare={seedFocusStory}>
        <Story />
      </HudCanvas>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof FocusExitButton>

export const Visible: Story = {}
