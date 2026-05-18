import { expect, test, type Page } from '@playwright/test'

import {
  createAssistant,
  deleteAssistantBestEffort,
  getCsrfToken,
  getWorkspaceContext,
} from './helpers'

async function gotoAndAssert(page: Page, url: string, assertion: () => Promise<void>) {
  let lastError: unknown

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300_000 })

    try {
      await assertion()
      return
    } catch (error) {
      lastError = error
      await page.waitForTimeout(1000 * (attempt + 1))
    }
  }

  throw lastError
}

test.describe('Operating context brain flow', () => {
  test.describe.configure({ timeout: 8 * 60_000 })

  test('Workspace Brain, Project Brain, Team Context, and Agent Operating Context load for an authenticated operator', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    const csrfToken = await getCsrfToken(page)
    const agentName = `E2E Brain Agent ${Date.now()}`
    const createdAgent = await createAssistant(page, {
      orgId: workspace.org.id,
      projectId: workspace.project.id,
      name: agentName,
      csrfToken,
    })
    expect(createdAgent.status).toBe(201)

    const assistantId = createdAgent.body.id as string
    let crewId: string | null = null

    try {
      const crewResponse = await page.request.post('/api/crews', {
        headers: {
          'Content-Type': 'application/json',
        },
        data: {
          org_id: workspace.org.id,
          project_id: workspace.project.id,
          name: `E2E Brain Team ${Date.now()}`,
          objective: 'Exercise inherited operating state in the authenticated e2e flow.',
          members: [{
            assistant_id: assistantId,
            role: 'Context sentinel',
            is_coordinator: true,
          }],
        },
        timeout: 120_000,
      })
      expect(crewResponse.status()).toBe(201)
      const crewPayload = await crewResponse.json() as { crew?: { id?: string } }
      crewId = crewPayload.crew?.id ?? null
      expect(crewId).toBeTruthy()

      await page.request.post(`/api/workspaces/${workspace.org.id}/context`, {
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        data: {
          scope_type: 'workspace',
          scope_id: workspace.org.id,
          record_type: 'policy',
          title: 'E2E workspace policy',
          body: '{"tool_budget":"normal"}',
          confidence: 1,
          metadata: { policy: { tool_budget: 'normal' } },
        },
      })

      await gotoAndAssert(page, `/${workspace.org.slug}/dashboard`, async () => {
        await expect(page.getByRole('heading', { name: 'Workspace Brain' })).toBeVisible({ timeout: 90_000 })
      })
      await expect(page.getByRole('link', { name: /Generate Daily Intel/i })).toBeVisible()

      await gotoAndAssert(page, `/${workspace.org.slug}/projects/${workspace.project.slug}/settings`, async () => {
        await expect(page.getByText('Project Brain', { exact: true })).toBeVisible({ timeout: 90_000 })
      })
      await expect(page.getByText('Inherited policy preview', { exact: true })).toBeVisible({ timeout: 90_000 })

      await gotoAndAssert(page, `/${workspace.org.slug}/projects/${workspace.project.slug}/teams/${crewId}`, async () => {
        await expect(page.getByText('Team Context', { exact: true })).toBeVisible({ timeout: 90_000 })
      })
      await expect(page.getByRole('button', { name: /Generate Daily Intel/i })).toBeVisible()

      await gotoAndAssert(page, `/${workspace.org.slug}/projects/${workspace.project.slug}/agents/${assistantId}`, async () => {
        const operatingContextNav = page.getByRole('button', { name: 'Operating Context' })
        await expect(operatingContextNav).toBeVisible({ timeout: 90_000 })
        await operatingContextNav.click()
      })
      await expect(page.getByRole('button', { name: 'Context', exact: true })).toBeVisible({ timeout: 90_000 })
      await expect(page.getByRole('button', { name: 'Heartbeat', exact: true })).toBeVisible({ timeout: 90_000 })
    } finally {
      if (crewId) {
        await page.request.delete(`/api/crews/${crewId}?org_id=${workspace.org.id}&project_id=${workspace.project.id}`, {
          timeout: 120_000,
        }).catch(() => null)
      }
      await deleteAssistantBestEffort(page, { assistantId, csrfToken })
    }
  })
})
