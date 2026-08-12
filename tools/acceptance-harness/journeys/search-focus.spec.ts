import { expect, test } from '@playwright/test'

import { searchBox, waitForGalaxyStarted } from './helpers'

test.describe('search focus replacement', () => {
  test('movie-title and TMDB-ID tabs can replace focus', async ({ page }) => {
    await page.goto('/')
    await waitForGalaxyStarted(page)

    const search = page.getByRole('search')
    await search.getByRole('button', { name: /^Titles$/i }).click()
    await searchBox(page).fill('Fight Club')
    const titleOption = page.getByRole('option').first()
    await expect(titleOption).toBeVisible({ timeout: 30_000 })
    await titleOption.click()
    await expect(page.getByLabel('Back to cosmos')).toBeVisible({ timeout: 60_000 })

    await search.getByRole('button', { name: /^ID$/i }).click()
    await searchBox(page).fill('278')
    const idOption = page.getByRole('option').first()
    await expect(idOption).toBeVisible({ timeout: 30_000 })
    await idOption.click()
    await expect(page.getByLabel('Back to cosmos')).toBeVisible({ timeout: 60_000 })
    await expect(page).toHaveURL(/\/movie\/278/)
  })
})
