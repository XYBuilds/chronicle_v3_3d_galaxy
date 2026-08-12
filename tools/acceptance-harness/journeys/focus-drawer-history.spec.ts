import { expect, test } from '@playwright/test'

import { openMovieFocus, waitForGalaxyStarted } from './helpers'

const MOVIE_ID = 550

test.describe('focus drawer and history', () => {
  test('shareable deep link opens focus; Back/Forward traverse movie and home', async ({ page }) => {
    await page.goto('/')
    await waitForGalaxyStarted(page)

    await page.goto(`/movie/${MOVIE_ID}`)
    await waitForGalaxyStarted(page)
    await expect(page.getByLabel('Back to cosmos')).toBeVisible({ timeout: 90_000 })
    await expect(page).toHaveURL(new RegExp(`/movie/${MOVIE_ID}`))

    await page.goBack()
    await waitForGalaxyStarted(page)
    await expect(page.getByLabel('Back to cosmos')).toHaveCount(0)
    await expect(page).toHaveURL(/\/(?:\?.*)?$/)

    await page.goForward()
    await waitForGalaxyStarted(page)
    await expect(page.getByLabel('Back to cosmos')).toBeVisible({ timeout: 90_000 })
    await expect(page).toHaveURL(new RegExp(`/movie/${MOVIE_ID}`))
  })

  test('FocusExit from a shareable deep link returns to idle', async ({ page }) => {
    await openMovieFocus(page, MOVIE_ID)
    await page.getByLabel('Back to cosmos').click()
    await expect(page.getByLabel('Back to cosmos')).toHaveCount(0)
    await expect(page.getByRole('search')).toBeVisible()
  })
})
