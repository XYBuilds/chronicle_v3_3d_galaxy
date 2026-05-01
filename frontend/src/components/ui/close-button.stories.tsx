import type { Meta, StoryObj } from '@storybook/react-vite'

import { CloseButton } from './close-button'

const meta: Meta<typeof CloseButton> = {
  title: 'UI/CloseButton',
  component: CloseButton,
  decorators: [
    (Story) => (
      <div className="flex items-center justify-center gap-6 bg-background p-8">
        <Story />
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof CloseButton>

export const Default: Story = {
  args: { variant: 'default' },
}

export const GhostSm: Story = {
  args: { variant: 'ghostSm' },
}

export const GhostLg: Story = {
  args: { variant: 'ghostLg' },
}

export const Secondary: Story = {
  args: { variant: 'secondary' },
}
