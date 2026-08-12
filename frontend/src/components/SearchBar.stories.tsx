import type { Meta, StoryObj } from '@storybook/react-vite'
import { userEvent, within } from 'storybook/test'

import { SearchBar } from './SearchBar'
import { SUBSAMPLE_HUD_MOVIES } from '@/storybook/fixtures/subsampleMovies'
import { HudCanvas } from '@/storybook/hudStoryHarness'

const meta: Meta<typeof SearchBar> = {
  title: 'Chrome/SearchBar',
  component: SearchBar,
  args: {
    hasSearchIndex: true,
    movies: SUBSAMPLE_HUD_MOVIES,
  },
  decorators: [
    (Story) => (
      <HudCanvas>
        <Story />
      </HudCanvas>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof SearchBar>

export const Idle: Story = {}

export const MovieSuggestions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('combobox')
    await userEvent.click(box)
    await userEvent.type(box, 'Kika')
  },
}
