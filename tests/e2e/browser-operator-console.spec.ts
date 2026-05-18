import { expect, test } from '@playwright/test'

import { getWorkspaceContext } from './helpers'

async function openBrowserOperatorTab(
  page: import('@playwright/test').Page,
  name: string,
  visibleInPanel: import('@playwright/test').Locator,
) {
  const tab = page.getByRole('tab', { name })
  await expect(tab).toBeVisible({ timeout: 90_000 })

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await tab.click()
    if (await visibleInPanel.isVisible({ timeout: 3_000 }).catch(() => false)) return
    await page.waitForTimeout(750 * (attempt + 1))
  }

  await expect(visibleInPanel).toBeVisible({ timeout: 30_000 })
}

test.describe('Mission Control Browser Operator', () => {
  test.describe.configure({ timeout: 4 * 60_000 })

  test('loads the focused Browser Operator cockpit for an authenticated operator', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)

    await page.goto(`/${workspace.org.slug}/mission-control/browser`, {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    })

    await expect(page.getByRole('heading', { name: 'Browser Operator' })).toBeVisible({ timeout: 90_000 })
    await expect(page.getByRole('tab', { name: 'Sessions' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Accounts' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Procedures' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Playbooks' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Trust Shield' })).toBeVisible()

    await openBrowserOperatorTab(
      page,
      'Accounts',
      page.getByRole('heading', { name: 'Authenticated browser readiness' }),
    )
    await expect(page.getByRole('heading', { name: 'Authenticated browser readiness' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Merchant accounts' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Standing purchase policies' })).toBeVisible()

    const stamp = Date.now()
    const merchantName = `E2E Groceries ${stamp}`
    const merchantKey = `e2e_groceries_${stamp}`
    const policyName = `E2E Weekly Grocery Policy ${stamp}`

    await page.getByPlaceholder('Merchant name, e.g. Instacart').fill(merchantName)
    await page.getByPlaceholder('Key, e.g. instacart').fill(merchantKey)
    await page.getByRole('button', { name: 'Add' }).first().click()
    const merchantRow = page.getByTestId(`browser-account-${merchantKey}`)
    const readinessCard = page.getByTestId(`browser-account-readiness-${merchantKey}`)
    await expect(merchantRow.getByText(merchantName)).toBeVisible({ timeout: 90_000 })
    await expect(readinessCard.getByText(merchantName)).toBeVisible({ timeout: 90_000 })
    await readinessCard.getByRole('button', { name: 'Test' }).click()
    await expect(page.getByText('Account health refreshed')).toBeVisible({ timeout: 90_000 })
    await openBrowserOperatorTab(page, 'Alerts', page.getByRole('heading', { name: 'Operator alerts' }))
    await expect(page.getByText(`${merchantName} needs secure login`)).toBeVisible({ timeout: 90_000 })
    await openBrowserOperatorTab(
      page,
      'Accounts',
      page.getByRole('heading', { name: 'Authenticated browser readiness' }),
    )
    await merchantRow.getByRole('button', { name: 'Connect' }).click()
    await expect(page.getByText('Secure takeover ready')).toBeVisible({ timeout: 90_000 })
    await expect(merchantRow.getByText('Latest takeover: Provider Ready')).toBeVisible({ timeout: 90_000 })
    await merchantRow.getByRole('link', { name: 'Review' }).click()
    await expect(page.getByRole('heading', { name: 'Secure merchant takeover' })).toBeVisible({ timeout: 90_000 })
    const completeResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/browser-operator/connect-sessions/') &&
        response.url().endsWith('/complete') &&
        response.request().method() === 'POST',
      { timeout: 90_000 },
    )
    await page.getByRole('button', { name: 'Mark connected' }).click()
    await expect((await completeResponse).status()).toBe(200)
    await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 90_000 })
    await page.goto(`/${workspace.org.slug}/mission-control/browser`, {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    })
    await openBrowserOperatorTab(page, 'Alerts', page.getByRole('heading', { name: 'Operator alerts' }))
    await expect(page.getByText(`${merchantName} needs secure login`)).toHaveCount(0, { timeout: 90_000 })
    await openBrowserOperatorTab(
      page,
      'Accounts',
      page.getByRole('heading', { name: 'Authenticated browser readiness' }),
    )

    await page.getByPlaceholder('Policy name, e.g. Weekly groceries').fill(policyName)
    await page.getByPlaceholder('Max $').fill('42.50')
    await page.getByPlaceholder('Allowed domains, comma-separated').fill('example.com')
    await page.getByPlaceholder('Allowed categories, comma-separated').fill('food, household_basics')
    await page.getByRole('button', { name: 'Add' }).last().click()
    const policyRow = page.locator('[data-testid^="browser-policy-"]').filter({ hasText: policyName }).first()
    await expect(policyRow).toBeVisible({ timeout: 90_000 })
    await expect(policyRow.getByText('$42.50')).toBeVisible()

    await openBrowserOperatorTab(page, 'Trust Shield', page.getByRole('heading', { name: 'Browser Trust Shield' }))
    await expect(page.getByRole('heading', { name: 'Browser Trust Shield' })).toBeVisible()
  })
})
