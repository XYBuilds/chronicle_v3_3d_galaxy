import type { Meta, StoryObj } from '@storybook/react-vite'

import { TmdbAttribution } from './TmdbAttribution'
import { HudAttributionFooter, HudCanvas } from '@/storybook/hudStoryHarness'

const meta: Meta<typeof TmdbAttribution> = {
  title: 'Chrome/Attribution',
  component: TmdbAttribution,
  decorators: [
    (Story) => (
      <HudCanvas>
        <Story />
      </HudCanvas>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof TmdbAttribution>

export const Footer: Story = {
  render: () => <HudAttributionFooter />,
}
