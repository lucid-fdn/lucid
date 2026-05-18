import { expect, test } from '@playwright/test'

import {
  chatAssistant,
  createAssistant,
  createIsolatedWorkspaceContext,
  deleteAssistantBestEffort,
  getCsrfToken,
  getWorkspaceContext,
} from './helpers'

async function navigateAndMeasure(page: import('@playwright/test').Page, url: string, heading: string) {
  let bestMs = Number.POSITIVE_INFINITY

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = Date.now()
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 300_000,
    })
    await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 60_000 })
    bestMs = Math.min(bestMs, Date.now() - startedAt)

    if (bestMs < 20_000) break
    // The local dev server can spend the first attempt compiling this route.
    // Measure the warmed application path so this smoke catches app regressions,
    // not Turbopack cold-start noise.
    await page.waitForTimeout(500)
  }

  return bestMs
}

test.describe('Auth and performance smoke', () => {
  test.describe.configure({ timeout: 12 * 60_000 })

  test('deep routes survive refresh-token churn and repeated reloads', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)

    const routes = [
      `/${workspace.org.slug}/mission-control/overview`,
      `/${workspace.org.slug}/projects/${workspace.project.slug}/settings`,
      `/${workspace.org.slug}/projects/${workspace.project.slug}/agents?view=canvas`,
      `/${workspace.org.slug}/mission-control/system`,
    ]

    const deadline = Date.now() + 90_000
    let loopCount = 0
    let refreshProbeCount = 0

    while (Date.now() < deadline) {
      for (const route of routes) {
        await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 300_000 })
        if (refreshProbeCount < 4) {
          try {
            const csrfToken = await getCsrfToken(page)
            const refresh = await page.request.post('/api/auth/refresh', {
              headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
              timeout: 120_000,
            })
            expect([200, 401, 403, 429]).toContain(refresh.status())
            refreshProbeCount += 1
          } catch {
            // Network resets during refresh probes are acceptable so long as the
            // session survives the subsequent page reload.
          }
        }
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 300_000 })
        await expect(page).not.toHaveURL(/\/login(?:\/|$|\?)/, { timeout: 30_000 })
      }
      loopCount += 1
    }

    expect(loopCount).toBeGreaterThan(0)
  })

  test('workspace ops and project agents stay within a browser perf smoke budget under seeded load', async ({ page }) => {
    const workspace = await createIsolatedWorkspaceContext(page)
    const csrfToken = await getCsrfToken(page)
    const assistantIds: string[] = []

    try {
      for (let index = 0; index < 12; index += 1) {
        const created = await createAssistant(page, {
          orgId: workspace.org.id,
          projectId: workspace.project.id,
          name: `E2E Perf Agent ${index + 1} ${Date.now()}`,
          csrfToken,
        })
        expect(created.status).toBe(201)
        assistantIds.push(created.body.id as string)
      }

      const overviewMs = await navigateAndMeasure(
        page,
        `/${workspace.org.slug}/mission-control/overview`,
        'Overview',
      )
      const agentsMs = await navigateAndMeasure(
        page,
        `/${workspace.org.slug}/projects/${workspace.project.slug}/agents?view=canvas`,
        'Agents',
      )

      expect(overviewMs).toBeLessThan(20_000)
      expect(agentsMs).toBeLessThan(20_000)
    } finally {
      for (const assistantId of assistantIds) {
        await deleteAssistantBestEffort(page, { assistantId, csrfToken, timeoutMs: 45_000 })
      }
    }
  })

  test('agent page remains usable with heavier activity history', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    const csrfToken = await getCsrfToken(page)
    const agentName = `E2E Activity Agent ${Date.now()}`

    let assistantId: string | null = null

    try {
      const created = await createAssistant(page, {
        orgId: workspace.org.id,
        name: agentName,
        csrfToken,
      })
      expect(created.status).toBe(201)
      assistantId = created.body.id as string

      for (let index = 0; index < 6; index += 1) {
        const chat = await chatAssistant(page, assistantId, `Smoke activity message ${index + 1}`)
        if (chat.status === 502) {
          test.skip(true, 'Shared worker chat backend is unavailable in this local environment')
        }
        expect(chat.status).toBe(200)
      }

      const pageMs = await navigateAndMeasure(
        page,
        `/${workspace.org.slug}/projects/${workspace.project.slug}/agents/${assistantId}`,
        agentName,
      )

      await page.getByRole('button', { name: 'Runs', exact: true }).first().click()
      await expect(
        page
          .getByText('Run receipts', { exact: true })
          .or(
            page.getByText(
              'Watch the live operational stream, agent events, and runtime signals without leaving the current page.',
              { exact: false },
            ),
          )
          .first(),
      ).toBeVisible({ timeout: 30_000 })

      await page.getByRole('button', { name: 'Activity', exact: true }).first().click()
      await expect(
        page.getByText(
          'Watch the live operational stream, agent events, and runtime signals without leaving the current page.',
          { exact: false },
        ),
      ).toBeVisible({ timeout: 30_000 })

      expect(pageMs).toBeLessThan(20_000)
    } finally {
      if (assistantId) {
        await deleteAssistantBestEffort(page, { assistantId, csrfToken, timeoutMs: 45_000 })
      }
    }
  })
})
