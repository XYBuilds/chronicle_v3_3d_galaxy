import type { Meta, StoryObj } from '@storybook/react-vite'
import { userEvent, within } from 'storybook/test'

import { SearchBar } from '@/components/SearchBar'
import type { LocaleId } from '@/lib/locales'
import { SUBSAMPLE_HUD_MOVIES } from '@/storybook/fixtures/subsampleMovies'
import { HudAttributionFooter, HudCanvas, HudTopToolsCluster } from '@/storybook/hudStoryHarness'

function TopToolsScene() {
  return (
    <>
      <HudTopToolsCluster />
      <SearchBar hasSearchIndex movies={SUBSAMPLE_HUD_MOVIES} />
      <HudAttributionFooter />
    </>
  )
}

const meta: Meta<typeof TopToolsScene> = {
  title: 'Chrome/TopTools',
  component: TopToolsScene,
  decorators: [
    (Story, context) => (
      <HudCanvas locale={(context.parameters.hudLocale as LocaleId | undefined) ?? 'en'}>
        <Story />
      </HudCanvas>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof TopToolsScene>

export const Default: Story = {}

export const InfoDialog: Story = {
  play: async ({ canvasElement }) => {
    const ui = within(canvasElement.ownerDocument.body)
    await userEvent.click(ui.getByRole('button', { name: 'Open info panel' }))
    await ui.findByRole('dialog')
  },
}

export const LanguageMenu: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Choose interface language' }))
    await canvas.findByRole('menu')
  },
}

export const RTL: Story = {
  parameters: { hudLocale: 'ar' },
}
