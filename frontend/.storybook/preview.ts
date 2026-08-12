import type { Preview } from '@storybook/react-vite'

import '../src/index.css'

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    options: {
      storySort: {
        order: ['Boot', 'Chrome', 'Hover', 'Drawer', 'Timeline', 'Visual Gate'],
      },
    },
    viewport: {
      options: {
        'hud-mobile': {
          name: 'hud-mobile',
          styles: { width: '390px', height: '844px' },
          type: 'mobile',
        },
        'hud-desktop': {
          name: 'hud-desktop',
          styles: { width: '1280px', height: '800px' },
          type: 'desktop',
        },
        'lab-desktop': {
          name: 'lab-desktop',
          styles: { width: '100%', height: '100%' },
          type: 'desktop',
        },
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // Harness `test:storybook-a11y` is the blocking scan; Storybook UI stays advisory.
      test: 'todo',
    },
  },
  initialGlobals: {
    viewport: { value: 'hud-desktop', isRotated: false },
  },
}

export default preview
