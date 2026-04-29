import { expect, test } from '@playwright/test'

test('opens explorer and toggles the sample layer', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /open explorer/i }).click()

  await expect(page).toHaveURL(/#\/explorer$/)
  await expect(page.getByTestId('map-canvas')).toBeVisible()

  const layerToggle = page.getByRole('checkbox', {
    name: /show sample places/i,
  })
  await expect(layerToggle).toBeChecked()

  await layerToggle.uncheck()
  await expect(layerToggle).not.toBeChecked()
})
