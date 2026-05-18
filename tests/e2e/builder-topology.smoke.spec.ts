import { expect, test } from '@playwright/test'

import { getWorkspaceContext } from './helpers'

async function sendBuilderPrompt(page: import('@playwright/test').Page, value: string) {
  const field = page.getByPlaceholder('Refine the setup, add tools, change tone, or ask for a team...')
  const sendButton = page.getByRole('button', { name: 'Send message' })
  const waitForChatResponse = () => page.waitForResponse((response) =>
    response.url().includes('/blueprints/chat') &&
    response.request().method() === 'POST',
  { timeout: 15_000 }).catch(() => null)

  const typePrompt = async () => {
    await expect.poll(async () => {
      await field.click()
      await field.fill('')
      await field.fill(value)
      await page.waitForTimeout(250)
      return await field.inputValue().catch(() => '')
    }, { timeout: 90_000, intervals: [500, 1000, 1500, 2000] }).toBe(value)
    await expect(sendButton).toBeEnabled({ timeout: 30_000 })
  }

  await expect(field).toBeVisible({ timeout: 90_000 })
  await expect(field).toBeEnabled({ timeout: 90_000 })
  await typePrompt()

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const responsePromise = waitForChatResponse()
    await sendButton.click()
    const response = await responsePromise
    if (response?.ok()) return
    if (response) {
      if (response.status() === 429 && attempt < 4) {
        const retryAfter = Number.parseInt(response.headers()['retry-after'] ?? '', 10)
        await page.waitForTimeout(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1))
        await typePrompt()
        continue
      }
      const body = await response.text().catch(() => '<unavailable>')
      throw new Error(`Builder chat failed with ${response.status()} ${response.statusText()}: ${body.slice(0, 2000)}`)
    }
    await page.waitForTimeout(750 * (attempt + 1))
    await typePrompt()
  }
  throw new Error('Builder chat request was not sent after 5 attempts.')
}

async function openBuilder(page: import('@playwright/test').Page, workspaceSlug: string, suffix = 'start=describe') {
  await page.goto(`/${workspaceSlug}/new?${suffix}`, {
    waitUntil: 'domcontentloaded',
    timeout: 300_000,
  })
}

test.describe('Builder topology smoke', () => {
  test.describe.configure({ timeout: 10 * 60_000 })

  test('daily assistant stays a single agent without topology clarification', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    await openBuilder(page, workspace.org.slug)

    await sendBuilderPrompt(page, 'daily assistant')

    await expect(page.getByText(/I drafted a single agent/i)).toBeVisible({ timeout: 180_000 })
    await expect(page.getByText(/Personal Assistant|Daily Assistant/i).first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'Team of agents' })).toHaveCount(0)
  })

  test('content team prompt creates a team structure', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    await openBuilder(page, workspace.org.slug)

    await sendBuilderPrompt(page, 'create a content team with research writing editing and publishing')

    await expect(page.getByText(/I drafted a team|template-based team|Agents & roles/i).first()).toBeVisible({
      timeout: 180_000,
    })
    await expect(page.getByText(/Agents & roles/i).first()).toBeVisible({ timeout: 90_000 })
  })

  test('ambiguous growth prompt asks one topology clarification', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    await openBuilder(page, workspace.org.slug)

    await sendBuilderPrompt(page, 'build something to run growth')

    await expect(page.getByText(/one agent or a team|one quick choice|single agent or become a team/i).first()).toBeVisible({
      timeout: 180_000,
    })
    await expect(page.getByRole('button', { name: /One agent|Single agent/i }).first()).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByRole('button', { name: /Team|Team of agents/i }).first()).toBeVisible({
      timeout: 60_000,
    })
  })

  test('Authority Engine template opens as team template with required inputs', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    await openBuilder(page, workspace.org.slug, 'template=content-machine')

    await expect(page.getByText(/Authority Engine/i).first()).toBeVisible({ timeout: 180_000 })
    await expect(page.getByText(/template-based team|Agents & roles|Brand Name/i).first()).toBeVisible({
      timeout: 90_000,
    })
    await expect(page.getByText(/Brand Name|Primary Topic or Keyword|Target Reader|Brand Voice/i).first()).toBeVisible({
      timeout: 90_000,
    })
  })
})
