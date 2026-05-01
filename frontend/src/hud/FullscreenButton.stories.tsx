import type { Meta, StoryObj } from '@storybook/react-vite'

import { FullscreenButton } from './FullscreenButton'

const meta: Meta<typeof FullscreenButton> = {
  title: 'HUD/FullscreenButton',
  component: FullscreenButton,
  decorators: [
    (Story) => (
      <div className="relative min-h-[120px] w-full bg-black">
        <Story />
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof FullscreenButton>

/** Renders only when the preview document exposes fullscreen (standard or WebKit). */
export const Default: Story = {}
