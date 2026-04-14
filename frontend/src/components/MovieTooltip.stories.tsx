import type { Meta, StoryObj } from '@storybook/react-vite'

import { MovieTooltipHud } from './MovieTooltip'
import { TooltipProvider } from '@/components/ui/tooltip'

const meta: Meta<typeof MovieTooltipHud> = {
  title: 'HUD/MovieTooltip',
  component: MovieTooltipHud,
  decorators: [
    (Story) => (
      <TooltipProvider delay={0}>
        <div className="relative h-[480px] w-full min-w-[640px] bg-neutral-950">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof MovieTooltipHud>

export const Default: Story = {
  args: {
    open: true,
    anchor: { x: 320, y: 240 },
    title: 'Inception',
    primaryGenreLabel: 'Science Fiction',
  },
}

export const LongTitle: Story = {
  args: {
    open: true,
    anchor: { x: 320, y: 240 },
    title:
      'Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb — extended director commentary edition',
    primaryGenreLabel: 'Comedy',
  },
}

export const NoPrimaryGenre: Story = {
  args: {
    open: true,
    anchor: { x: 80, y: 400 },
    title: 'Untitled',
    primaryGenreLabel: null,
  },
}

export const CornerAnchor: Story = {
  args: {
    open: true,
    anchor: { x: 620, y: 40 },
    title: 'Edge placement',
    primaryGenreLabel: 'Thriller',
  },
}
