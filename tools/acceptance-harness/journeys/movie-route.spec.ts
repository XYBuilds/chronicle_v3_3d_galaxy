import { expect, test } from '@playwright/test'

import { expectHomeIdle, openMovieFocus, waitForGalaxyStarted } from './helpers'

test.describe('movie routes', () => {
  test('valid /movie/:id refresh/share stays focused', async ({ page }) => {
    await openMovieFocus(page, 550)
    await page.reload()
    await waitForGalaxyStarted(page)
    await expect(page.getByLabel('Back to cosmos')).toBeVisible({ timeout: 60_000 })
    await expect(page).toHaveURL(/\/movie\/550/)
  })

  test('ordinary invalid path returns to home idle', async ({ page }) => {
    await page.goto('/not-a-real-route')
    await expectHomeIdle(page)
  })

  test('retired /today follows ordinary invalid-path handling', async ({ page }) => {
    await page.goto('/today')
    await expectHomeIdle(page)
  })

  test('retired /share/today follows ordinary invalid-path handling', async ({ page }) => {
    await page.goto('/share/today')
    await expectHomeIdle(page)
  })

  test('invalid movie id returns to home idle', async ({ page }) => {
    await page.goto('/movie/999999999')
    await expectHomeIdle(page)
  })
})
