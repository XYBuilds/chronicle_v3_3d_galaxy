import type { Meta, StoryObj } from '@storybook/react-vite'

import { Loading } from './Loading'

const meta: Meta<typeof Loading> = {
  title: 'Loading',
  component: Loading,
  decorators: [
    (Story) => (
      <div className="relative isolate min-h-[480px] w-full min-w-[360px] overflow-hidden bg-background">
        <Story />
      </div>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof Loading>

export const Default: Story = {
  args: {},
}

export const CustomLabel: Story = {
  args: {
    label: 'Fetching subsample rows from data/subsample/tmdb2025_random20.csv',
  },
}
