import { expect, test } from '@playwright/test'
import {
  createAssistant,
  deleteAssistantBestEffort,
  getCanvasTopology,
  getCsrfToken,
  getWorkspaceContext,
  waitForCondition,
} from './helpers'

test.describe('Project shell smoke', () => {
  test('project agents page opens the side panel for a created agent', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)

    await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/agents`, {
      waitUntil: 'domcontentloaded',
    })

    const csrfToken = await getCsrfToken(page)
    const agentName = `E2E Canvas Agent ${Date.now()}`
    const created = await createAssistant(page, {
      orgId: workspace.org.id,
      name: agentName,
      csrfToken,
    })
    expect(created.status).toBe(201)

    const assistantId = created.body.id as string

    try {
      await waitForCondition(
        () => getCanvasTopology(page, workspace.org.id),
        (result) => result.status === 200
          && result.body.agents.some((item: Record<string, unknown>) => item.id === assistantId),
        { timeoutMs: 60_000, intervalMs: 5_000 },
      )

      await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/agents?view=list`, {
        waitUntil: 'domcontentloaded',
      })

      const agentLink = page.getByRole('link', { name: new RegExp(agentName) })
      await expect(agentLink).toBeVisible({ timeout: 60_000 })
      await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/agents/${assistantId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 300_000,
      })

      const mainRegion = page.getByRole('main')
      await expect(page).toHaveURL(new RegExp(`/agents/${assistantId}$`), { timeout: 30_000 })
      await expect(mainRegion.getByText(agentName, { exact: true }).first()).toBeVisible({ timeout: 60_000 })
      await expect(mainRegion.getByRole('button', { name: 'Chat' })).toBeVisible()
      await expect(mainRegion.getByRole('button', { name: 'Activity' }).first()).toBeVisible()
      await expect(mainRegion.getByRole('button', { name: /Runtime/ })).toBeVisible()
    } finally {
      await deleteAssistantBestEffort(page, { assistantId, csrfToken })
    }
  })

  test('canonical project team page loads in the browser', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/teams`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(new RegExp(`/${workspace.org.slug}/projects/${workspace.project.slug}/teams$`))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(
      page.getByText('Coordinate agents into repeatable multi-agent groups inside this project.'),
    ).toBeVisible({ timeout: 90_000 })
  })
})
