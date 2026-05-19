import type { Meta, StoryObj } from '@storybook/react-vite'

import { HdrProofLab } from './HdrProofLab'

const meta = {
  title: 'Dev/HDR proof lab (P29.3)',
  component: HdrProofLab,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Minimal HDR proof: WebGPU canvas with SDR reference (linear 1.0) vs HDR candidate (linear 4.0). ' +
          'Requires WebGPU + HDR display + OS HDR for meaningful visual separation. Production uses `window.__hdrProbe`.',
      },
    },
  },
} satisfies Meta<typeof HdrProofLab>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
