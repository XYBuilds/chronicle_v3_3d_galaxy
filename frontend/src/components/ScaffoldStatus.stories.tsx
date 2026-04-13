import type { Meta, StoryObj } from '@storybook/react-vite'
import { ScaffoldStatus } from './ScaffoldStatus'

const meta: Meta<typeof ScaffoldStatus> = {
  title: 'Scaffold/Status',
  component: ScaffoldStatus,
}

export default meta

type Story = StoryObj<typeof ScaffoldStatus>

export const Default: Story = {}
