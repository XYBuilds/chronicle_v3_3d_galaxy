import type { Meta, StoryObj } from '@storybook/react-vite'

import { InstancedMeshBench } from './InstancedMeshBench'

const meta = {
  title: 'Dev/Instanced mesh bench (P8.0)',
  component: InstancedMeshBench,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'GPU stress for **P8.4 dual InstancedMesh** gate: 60k×`IcosahedronGeometry(1,0)` + 60k×`IcosahedronGeometry(1,1)`, same transforms, `MeshBasicMaterial` only. Open Performance panel, record ~5s idle; compare desktop vs integrated GPU. Idle transparent + active opaque approximates future material split; final idle alpha cost is validated again in P8.5.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="box-border w-full bg-neutral-950 p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InstancedMeshBench>

export default meta

type Story = StoryObj<typeof InstancedMeshBench>

export const DualMeshWorstCase: Story = {}
