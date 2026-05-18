import { expect, test } from '@playwright/test'

import { getWorkspaceContext } from './helpers'

test.describe('Mission Control smoke', () => {
  test.describe.configure({ timeout: 12 * 60_000 })

  test('workspace mission control pages load with canonical framing', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)

    const cases = [
      {
        path: `/${workspace.org.slug}/mission-control`,
        expectedUrl: `/${workspace.org.slug}/mission-control/overview`,
        title: 'Overview',
        bodyText: 'Ready Work',
      },
      {
        path: `/${workspace.org.slug}/mission-control/overview`,
        expectedUrl: `/${workspace.org.slug}/mission-control/overview`,
        title: 'Overview',
        bodyText: 'Ready Work',
      },
      {
        path: `/${workspace.org.slug}/mission-control/replay`,
        expectedUrl: `/${workspace.org.slug}/mission-control/replay`,
        title: 'Replay',
        bodyText: 'Inspect conversation history, failures, and outcomes.',
      },
      {
        path: `/${workspace.org.slug}/mission-control/activity`,
        expectedUrl: `/${workspace.org.slug}/mission-control/activity`,
        title: 'Activity',
        bodyText: 'Chronological workspace activity across projects, agents, and runtimes.',
      },
      {
        path: `/${workspace.org.slug}/mission-control/system`,
        expectedUrl: `/${workspace.org.slug}/mission-control/system`,
        title: 'System Health',
        bodyText: 'Inspect runtime health, ingest pressure, errors, and remediation.',
      },
      {
        path: `/${workspace.org.slug}/mission-control/economics`,
        expectedUrl: `/${workspace.org.slug}/mission-control/economics`,
        title: 'Spend',
        bodyText: 'Track workspace spend, concentration, and savings opportunities.',
      },
      {
        path: `/${workspace.org.slug}/mission-control/integrations`,
        expectedUrl: `/${workspace.org.slug}/mission-control/integrations`,
        title: 'Integrations',
        bodyText: 'Monitor connected channels, plugins, and managed packs.',
      },
      {
        path: `/${workspace.org.slug}/mission-control/conversations`,
        expectedUrl: `/${workspace.org.slug}/mission-control/conversations`,
        title: 'Conversations',
        bodyText: 'Review messaging volume, themes, and quality signals.',
      },
      {
        path: `/${workspace.org.slug}/mission-control/work`,
        expectedUrl: `/${workspace.org.slug}/mission-control/work`,
        title: 'Work',
        bodyText: 'Review approvals, tickets, and handoffs that need a person.',
      },
    ]

    for (const current of cases) {
      await gotoWithRetry(page, current.path)
      await expect(page).toHaveURL(
        new RegExp(`${current.expectedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
        { timeout: 30_000 },
      )
      await expect(page.getByRole('heading', { name: current.title, exact: true })).toBeVisible({ timeout: 60_000 })
      await expect(page.getByText(current.bodyText, { exact: false }).first()).toBeVisible({ timeout: 60_000 })
    }
  })
})

async function gotoWithRetry(page: import('@playwright/test').Page, path: string) {
  let lastError: unknown

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(path, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      })
      return
    } catch (error) {
      lastError = error
      await page.waitForTimeout(1000 * (attempt + 1))
    }
  }

  throw lastError
}
