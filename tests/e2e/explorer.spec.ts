import { expect, test } from '@playwright/test'

test('opens explorer and toggles the trail layers', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /trail explorer/i }).click()

  await expect(page).toHaveURL(/#\/explorer$/)
  await expect(page.getByTestId('map-canvas')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: /prince george hikes/i }),
  ).toBeVisible()

  const layerToggle = page.getByRole('checkbox', { name: /trail routes/i })
  await expect(layerToggle).toBeChecked()

  await layerToggle.uncheck()
  await expect(layerToggle).not.toBeChecked()

  const resultHeading = page.getByRole('heading', { name: /\d+ trails/i })
  await expect(resultHeading).toBeVisible()
  const initialTrailCount = await resultHeading.textContent()

  await expect(page.getByRole('button', { name: /filters/i })).toBeVisible()
  await page.getByRole('button', { name: /filters/i }).click()
  await expect(
    page.getByRole('button', { name: /all trails \d+/i }),
  ).toBeVisible()

  await page.getByRole('button', { name: /waterfalls 38/i }).click()
  await expect(page.getByText(/38 trails/i)).toBeVisible()

  await page.getByRole('button', { name: /filters/i }).click()
  await page.getByRole('button', { name: /all trails \d+/i }).click()
  await expect(resultHeading).toHaveText(initialTrailCount ?? '')
})

test('opens fish stats map and filters species', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /fish stats/i }).click()

  await expect(page).toHaveURL(/#\/fish$/)
  await expect(page.getByTestId('map-canvas')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: /bc stocking overview/i }),
  ).toBeVisible()
  await expect(page.getByText(/4,940,000/)).toBeVisible()
  await expect(page.getByText(/fishing advisor/i)).toBeVisible()
  await expect(page.getByText(/best today/i)).toBeVisible()

  await page.getByRole('button', { name: /filters/i }).click()
  await expect(page.getByTestId('fish-filter-panel')).toBeVisible()
  await page.getByRole('button', { name: 'Kokanee', exact: true }).click()
  await expect(page.getByText(/1,449,887/)).toBeVisible()
  await expect(page.getByText(/best fish-per-lake signal/i)).toBeVisible()

  await page.getByRole('button', { name: '2024' }).click()
  await page.getByRole('button', { name: 'All species', exact: true }).click()
  await page.getByRole('button', { name: /^regions/i }).click()
  await page.getByRole('button', { name: /lower mainland/i }).click()
  await expect(page.getByPlaceholder(/search waterbody or town/i)).toBeVisible()

  await page
    .getByPlaceholder(/search waterbody or town/i)
    .fill('south alouette')
  await expect(page.getByText(/south alouette r/i)).toBeVisible()

  await page.getByRole('button', { name: /rivers \/ creeks/i }).click()
  await expect(page.getByText(/river \/ creek/i).first()).toBeVisible()

  await page.getByRole('button', { name: /focus selected region/i }).click()
  await expect(page.getByText(/mapped 32 of 48 lower mainland/i)).toBeVisible()

  await page.getByRole('button', { name: '2025' }).click()
  await page.getByRole('button', { name: /^all$/i }).click()
  await page.getByRole('button', { name: /^1\. cariboo/i }).click()
  await page.getByRole('button', { name: /focus selected region/i }).click()
  await expect(page.getByText(/mapped 75 of 106 cariboo/i)).toBeVisible()

  await page.getByPlaceholder(/search waterbody or town/i).fill('dragon')
  await page
    .getByTestId('fish-waterbody-results')
    .getByRole('button', { name: /dragon/i })
    .click()
  const mapCard = page.getByTestId('selected-waterbody-map-card')
  await expect(mapCard).toBeVisible()
  await expect(mapCard.getByText(/selected lake \/ river/i)).toBeVisible()
  await expect(page.getByText(/region species mix/i)).not.toBeVisible()
  await expect(mapCard.getByRole('heading', { name: /dragon/i })).toBeVisible()
  await expect(mapCard.getByText(/fishing score/i)).toBeVisible()
  await expect(mapCard.getByText(/why:/i)).toBeVisible()
  await expect(mapCard.getByText('Rainbow Trout 37,500 · 100%')).toBeVisible()
  await expect(mapCard.getByText('Official: Dragon Lake')).toBeVisible()
  await expect(mapCard.getByText('BLACKWATER R, HORSEFLY R')).toBeVisible()
  await expect(mapCard.getByText('Yearling')).toBeVisible()
  await expect(mapCard.getByText('Diploid')).toBeVisible()
  await expect(
    mapCard.getByRole('link', { name: /official record/i }),
  ).toBeVisible()

  await mapCard.getByRole('button', { name: /back to region data/i }).click()
  await expect(mapCard).not.toBeVisible()
  await expect(page.getByText(/region species mix/i)).toBeVisible()

  await page.getByRole('button', { name: 'Kokanee', exact: true }).click()
  await expect(page.getByText(/selected lake \/ river/i)).not.toBeVisible()
})
