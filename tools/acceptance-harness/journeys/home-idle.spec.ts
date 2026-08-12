import { test } from '@playwright/test'

import { expectHomeIdle } from './helpers'

test.describe('home hydration', () => {
  test('hydrates to galaxy idle with search HUD and canvas host', async ({ page }) => {
    await page.goto('/')
    await expectHomeIdle(page)
  })
})
