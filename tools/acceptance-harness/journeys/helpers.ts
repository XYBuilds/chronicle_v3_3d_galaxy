import { expect, type Page } from '@playwright/test'

/** Shared Chronicle app journey helpers. Distinct from Planet Export browser tests. */

export async function waitForGalaxyStarted(page: Page): Promise<void> {
  await page.getByRole('search').waitFor({ state: 'visible', timeout: 180_000 })
  await expect(page.getByLabel('Galaxy WebGL canvas host')).toBeVisible()
}

export async function openMovieFocus(page: Page, movieId: number): Promise<void> {
  await page.goto(`/movie/${movieId}`, { waitUntil: 'domcontentloaded' })
  await waitForGalaxyStarted(page)
  await expect(page.getByLabel('Back to cosmos')).toBeVisible({ timeout: 90_000 })
}

export async function expectHomeIdle(page: Page): Promise<void> {
  await waitForGalaxyStarted(page)
  await expect(page).toHaveURL(/\/(?:\?.*)?$/)
  await expect(page.getByLabel('Back to cosmos')).toHaveCount(0)
}

export function searchBox(page: Page) {
  return page.getByRole('search').getByRole('combobox')
}
