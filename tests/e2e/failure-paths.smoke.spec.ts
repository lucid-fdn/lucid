import { expect, test } from '@playwright/test'

import {
  createAssistant,
  createIsolatedWorkspaceContext,
  createOfflineRuntimeFixture,
  deleteAssistantBestEffort,
  deleteRuntime,
  getCsrfToken,
  updateAssistant,
} from './helpers'

test.describe('Failure-path smoke', () => {
  test.describe.configure({ timeout: 8 * 60_000 })

  test('isolated workspace surfaces show empty-state failures cleanly', async ({ page }) => {
    const workspace = await createIsolatedWorkspaceContext(page)

    await page.goto(`/${workspace.org.slug}/mission-control/integrations`, {
      waitUntil: 'domcontentloaded',
      timeout: 300_000,
    })
    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible({ timeout: 60_000 })
    await expect(
      page
        .getByText('No integrations configured', { exact: true })
        .or(page.getByText('No channels connected.', { exact: true })),
    ).toBeVisible({ timeout: 60_000 })
    await expect(
      page
        .getByText('Connect a channel or install a plugin to monitor health here.', { exact: true })
        .or(page.getByText('No plugins installed for this workspace.', { exact: true })),
    ).toBeVisible({ timeout: 60_000 })

    await page.goto(`/${workspace.org.slug}/mission-control/system`, {
      waitUntil: 'domcontentloaded',
      timeout: 300_000,
    })
    await expect(page.getByRole('heading', { name: 'System Health' })).toBeVisible({ timeout: 60_000 })
    await expect(
      page
        .getByText('No dedicated runtimes', { exact: true })
        .or(page.getByText('Dedicated runtimes unavailable', { exact: true })),
    ).toBeVisible({ timeout: 60_000 })
  })

  test('paused agents and channel-empty agents surface explicit browser warnings', async ({ page }) => {
    const workspace = await createIsolatedWorkspaceContext(page)
    const csrfToken = await getCsrfToken(page)
    const agentName = `E2E Paused Agent ${Date.now()}`

    let assistantId: string | null = null

    try {
      const created = await createAssistant(page, {
        orgId: workspace.org.id,
        name: agentName,
        csrfToken,
      })

      expect(created.status).toBe(201)
      assistantId = created.body.id as string

      await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/agents/${assistantId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 300_000,
      })

      await page.getByRole('button', { name: 'Activity', exact: true }).first().click()
      await expect(page.getByText('No channels connected', { exact: true })).toBeVisible({ timeout: 60_000 })

      const paused = await updateAssistant(page, {
        assistantId,
        csrfToken,
        patch: { is_active: false },
      })
      expect(paused.status).toBe(200)

      await page.reload({ waitUntil: 'domcontentloaded', timeout: 300_000 })
      await expect(page.getByText('Standby — connected but not responding', { exact: true })).toBeVisible({
        timeout: 30_000,
      })
    } finally {
      if (assistantId) {
        await deleteAssistantBestEffort(page, { assistantId, csrfToken, timeoutMs: 45_000 })
      }
    }
  })

  test('offline runtimes render explicit unavailable state in runtime detail', async ({ page }) => {
    const workspace = await createIsolatedWorkspaceContext(page)
    let runtimeId: string | null = null

    try {
      const fixture = await createOfflineRuntimeFixture(page, {
        orgId: workspace.org.id,
      })
      runtimeId = fixture.runtimeId

      await page.goto(`/${workspace.org.slug}/mission-control/system/runtimes/${runtimeId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 300_000,
      })

      await expect(page.getByText(/Runtime is offline/i).first()).toBeVisible({ timeout: 60_000 })
    } finally {
      if (runtimeId) {
        await deleteRuntime(page, { runtimeId, orgId: workspace.org.id })
      }
    }
  })
})
