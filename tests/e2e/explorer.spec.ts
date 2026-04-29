import { expect, test } from '@playwright/test'

test('opens explorer and toggles the trail layers', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /open explorer/i }).click()

  await expect(page).toHaveURL(/#\/explorer$/)
  await expect(page.getByTestId('map-canvas')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: /prince george hikes/i }),
  ).toBeVisible()

  const layerToggle = page.getByRole('checkbox', { name: /trail routes/i })
  await expect(layerToggle).toBeChecked()

  await layerToggle.uncheck()
  await expect(layerToggle).not.toBeChecked()

  await expect(page.getByText(/118 trails/i)).toBeVisible()

  await expect(
    page.getByRole('button', { name: /all trails 118/i }),
  ).toBeVisible()
  await page.getByRole('button', { name: /waterfalls 38/i }).click()
  await expect(page.getByText(/38 trails/i)).toBeVisible()

  await page.getByRole('button', { name: /all trails 118/i }).click()
  await expect(page.getByText(/118 trails/i)).toBeVisible()
})
