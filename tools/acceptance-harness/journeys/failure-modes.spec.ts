import { expect, test } from '@playwright/test'

import { waitForGalaxyStarted } from './helpers'

test.describe('failure modes', () => {
  test('galaxy data failure shows Retry and recovers when the resource returns', async ({ page }) => {
    let failOnce = true
    await page.route('**/galaxy_data.json.gz*', async (route) => {
      if (failOnce) {
        failOnce = false
        await route.abort('failed')
        return
      }
      await route.continue()
    })

    await page.goto('/')
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: /retry|try again|reload/i }).first().click()
    await waitForGalaxyStarted(page)
  })

  test('search-index failure keeps the scene available', async ({ page }) => {
    await page.route('**/galaxy_search_index.json.gz*', async (route) => {
      await route.abort('failed')
    })
    await page.goto('/')
    await waitForGalaxyStarted(page)
    await expect(page.getByLabel('Galaxy WebGL canvas host')).toBeVisible()
    await expect(page.getByRole('search')).toBeVisible()
  })
})
