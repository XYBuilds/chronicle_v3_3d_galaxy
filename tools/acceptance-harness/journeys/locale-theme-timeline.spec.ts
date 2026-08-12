import { expect, test } from '@playwright/test'

import { waitForGalaxyStarted } from './helpers'

test.describe('locale theme timeline matrix', () => {
  test('English/Arabic RTL, light/dark, and Timeline orientations render HUD', async ({ page }) => {
    await page.goto('/?lang=en&theme=dark&timeline=vertical')
    await waitForGalaxyStarted(page)
    await expect(page.locator('html')).toHaveAttribute('lang', /en/i)

    await page.goto('/?lang=ar&theme=light&timeline=horizontal')
    await waitForGalaxyStarted(page)
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.getByRole('search')).toBeVisible()
  })
})
