import { expect, test } from '@playwright/test'

import {
  chatAssistant,
  createAssistant,
  deleteAssistantBestEffort,
  getCsrfToken,
  getWorkspaceContext,
} from './helpers'

test.describe('Agent management smoke', () => {
  test.describe.configure({ timeout: 8 * 60_000 })

  test('project settings and canonical agent management surfaces load end to end', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    const csrfToken = await getCsrfToken(page)
    const agentName = `E2E Managed Agent ${Date.now()}`

    let assistantId: string | null = null

    try {
      await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/settings`, {
        waitUntil: 'domcontentloaded',
        timeout: 300_000,
      })

      await expect(page.getByText('Project Settings', { exact: true }).first()).toBeVisible({ timeout: 60_000 })
      await expect(page.getByText('Runtime Posture', { exact: true }).first()).toBeVisible()
      await expect(page.getByText('Project Policy', { exact: true }).first()).toBeVisible()
      await expect(page.getByText('Preferred runtime', { exact: true })).toBeVisible()
      await expect(page.getByText('Approval policy', { exact: true })).toBeVisible()
      await expect(page.getByText('Mutation policy', { exact: true })).toBeVisible()
      await expect(page.getByText('Creation default', { exact: true })).toBeVisible()

      const created = await createAssistant(page, {
        orgId: workspace.org.id,
        name: agentName,
        csrfToken,
      })

      expect(created.status).toBe(201)
      assistantId = created.body.id as string

      const chat = await chatAssistant(page, assistantId, 'Reply with a short acknowledgement for smoke testing.')
      expect(chat.status).toBe(200)

      await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/agents/${assistantId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 300_000,
      })

      await expect(page.getByRole('button', { name: 'Overview', exact: true }).first()).toBeVisible({ timeout: 60_000 })
      await expect(page.getByRole('button', { name: 'Config', exact: true }).first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Runs', exact: true }).first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Activity', exact: true }).first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Model & Settings', exact: true }).first()).toBeVisible({
        timeout: 30_000,
      })
      await expect(page.getByRole('button', { name: 'Health', exact: true }).first()).toBeVisible({
        timeout: 30_000,
      })

      await page.getByRole('button', { name: 'Runs', exact: true }).first().click()
      await expect(
        page
          .getByText('Run receipts', { exact: true })
          .or(
            page.getByText(
              'Watch the live operational stream, agent events, and runtime signals without leaving the current page.',
              { exact: false },
            ),
          ),
      ).toBeVisible({ timeout: 30_000 })

      await page.getByRole('button', { name: 'Activity', exact: true }).first().click()
      await expect(page.getByText('Watch the live operational stream, agent events, and runtime signals without leaving the current page.', { exact: false })).toBeVisible({ timeout: 30_000 })
    } finally {
      if (assistantId) {
        await deleteAssistantBestEffort(page, { assistantId, csrfToken, timeoutMs: 45_000 })
      }
    }
  })

  test('channel setup drawers and Telegram voice controls render across supported non-Discord flows', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    const csrfToken = await getCsrfToken(page)
    const agentName = `E2E Channel Agent ${Date.now()}`

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

      await page.getByRole('button', { name: 'Model & Settings', exact: true }).first().click()
      const settingsDialog = page.getByRole('dialog', { name: 'Model & Settings' })
      await expect(settingsDialog).toBeVisible({ timeout: 30_000 })
      await expect(settingsDialog.getByText('Telegram voice replies', { exact: true })).toBeVisible()
      await expect(settingsDialog.getByText('Telegram voice', { exact: true })).toBeVisible()
      await expect(settingsDialog.getByText('Voice style preset', { exact: true })).toBeVisible()
      await expect(settingsDialog.getByRole('button', { name: 'Preview', exact: true })).toBeVisible()
      await expect(settingsDialog.getByRole('button', { name: 'Warm', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(settingsDialog).toHaveCount(0)

      await page.getByRole('button', { name: 'Channels', exact: true }).first().click()
      const channelsDialog = page.getByRole('dialog', { name: 'Channels' })
      await expect(channelsDialog).toBeVisible({ timeout: 30_000 })
      await expect(channelsDialog.getByRole('button', { name: /Add channel/i })).toBeVisible()
      await channelsDialog.getByRole('button', { name: /Add channel/i }).click()

      await expect(channelsDialog.getByText('Connect a channel', { exact: true })).toBeVisible()
      await expect(channelsDialog.getByRole('button', { name: /Telegram/i })).toBeVisible()
      await expect(channelsDialog.getByRole('button', { name: /WhatsApp/i })).toBeVisible()
      await expect(channelsDialog.getByRole('button', { name: /Slack/i })).toBeVisible()
      await expect(channelsDialog.getByRole('button', { name: /Microsoft Teams/i })).toBeVisible()

      await channelsDialog.getByRole('button', { name: /Telegram/i }).click()
      await expect(channelsDialog.getByRole('button', { name: /Connect Telegram/i })).toBeVisible()
      await channelsDialog.getByRole('button', { name: /Use my own bot token instead/i }).click()
      await expect(channelsDialog.getByText('Bot token', { exact: true })).toBeVisible()
      await expect(channelsDialog.getByPlaceholder('123456789:ABCdef...')).toBeVisible()
      await channelsDialog.getByRole('button', { name: /Change channel/i }).click()

      await channelsDialog.getByRole('button', { name: /Slack/i }).click()
      await expect(channelsDialog.getByRole('button', { name: /Use my own bot token instead/i })).toBeVisible()
      await channelsDialog.getByRole('button', { name: /Use my own bot token instead/i }).click()
      await expect(channelsDialog.getByText('Bot token', { exact: true })).toBeVisible()
      await expect(channelsDialog.getByText('App token', { exact: true })).toBeVisible()
      await expect(channelsDialog.getByPlaceholder('xoxb-...')).toBeVisible()
      await expect(channelsDialog.getByPlaceholder('xapp-...')).toBeVisible()
      await channelsDialog.getByRole('button', { name: /Change channel/i }).click()

      await channelsDialog.getByRole('button', { name: /WhatsApp/i }).click()
      await expect(channelsDialog.getByRole('button', { name: /Connect WhatsApp/i })).toBeVisible()
      await channelsDialog.getByRole('button', { name: /Use my own bot token instead/i }).click()
      await expect(channelsDialog.getByText('Phone number ID', { exact: true })).toBeVisible()
      await expect(channelsDialog.getByText('Verify token', { exact: true })).toBeVisible()
      await expect(channelsDialog.getByPlaceholder('EAAG...')).toBeVisible()
      await expect(channelsDialog.getByPlaceholder('lucid-wa-verify-token')).toBeVisible()
      await channelsDialog.getByRole('button', { name: /Change channel/i }).click()

      await channelsDialog.getByRole('button', { name: /Microsoft Teams/i }).click()
      await expect(channelsDialog.getByRole('button', { name: /Use my own bot token instead/i })).toBeVisible()
      await channelsDialog.getByRole('button', { name: /Use my own bot token instead/i }).click()
      await expect(channelsDialog.getByText('App ID', { exact: true })).toBeVisible()
      await expect(channelsDialog.getByText('App password', { exact: true })).toBeVisible()
      await expect(channelsDialog.getByText('Tenant ID', { exact: true })).toBeVisible()
      await expect(channelsDialog.getByPlaceholder('common')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(channelsDialog).toHaveCount(0)
    } finally {
      if (assistantId) {
        await deleteAssistantBestEffort(page, { assistantId, csrfToken, timeoutMs: 45_000 })
      }
    }
  })
})
