import { expect, test } from '@playwright/test'

import { openMovieFocus, waitForGalaxyStarted } from './helpers'

test.describe('person and genre select', () => {
  test('person select from Drawer nests focus and layered ESC exits', async ({ page }) => {
    await openMovieFocus(page, 550)
    const personButton = page.getByRole('button', { name: /Search films featuring/i }).first()
    await expect(personButton).toBeVisible({ timeout: 60_000 })
    await personButton.click()
    await expect(page.getByRole('search')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(page.getByLabel('Back to cosmos')).toHaveCount(0)
  })

  test('genre multi-select and clear', async ({ page }) => {
    await page.goto('/')
    await waitForGalaxyStarted(page)
    const search = page.getByRole('search')
    await search.getByRole('button', { name: /^Genres$/i }).click()
    await expect(search.getByText(/Click genre/i)).toBeVisible()
    const genreChip = search.locator('button').filter({ hasText: /Drama|Comedy|Action/i }).first()
    await expect(genreChip).toBeVisible({ timeout: 30_000 })
    await genreChip.click()
    await search.getByRole('button', { name: /^Clear search$/i }).click()
    await expect(search.getByText(/Click genre/i)).toBeVisible()
  })
})
