import { expect, test } from '@playwright/test'
import { createAssistant, deleteAssistantBestEffort, getCsrfToken, getWorkspaceContext } from './helpers'

async function runCommand(page: import('@playwright/test').Page, label: string) {
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'k',
      code: 'KeyK',
      metaKey: true,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }))
  })

  const search = page.getByPlaceholder('Type a command or search...')
  if (!await search.isVisible({ timeout: 2_500 }).catch(() => false)) {
    await page.locator('button').filter({ hasText: 'Commands' }).last().click({ timeout: 5_000 })
  }
  await expect(search).toBeVisible({ timeout: 10_000 })
  await search.fill(label)
  const commandItem = page.locator('[cmdk-item]').filter({ hasText: label }).first()
  await expect(commandItem).toHaveCount(1, { timeout: 10_000 })
  await commandItem.evaluate((node) => (node as HTMLElement).click())
  await page.keyboard.press('Escape')
}

test.describe('Agent Card smoke', () => {
  test.describe.configure({ timeout: 8 * 60_000 })

  test('loads, edits, previews, applies, versions, exports, and renders prompt sections', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    const csrfToken = await getCsrfToken(page)
    const agentName = `E2E Agent Card ${Date.now()}`
    const updatedName = `${agentName} Updated`
    const revertedFromName = updatedName
    const secondName = `${agentName} Second`
    let assistantId: string | null = null

    try {
      const created = await createAssistant(page, {
        orgId: workspace.org.id,
        projectId: workspace.project.id,
        name: agentName,
        csrfToken,
      })
      expect(created.status).toBe(201)
      assistantId = created.body.id as string

      await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/agents/${assistantId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 300_000,
      })

      await page.getByRole('button', { name: 'Config', exact: true }).first().click()
      await expect(page.getByRole('button', { name: 'Agent Card', exact: true }).first()).toBeVisible({ timeout: 90_000 })
      await page.getByRole('button', { name: 'Agent Card', exact: true }).first().click()
      await expect(page.getByTestId('agent-card-panel')).toBeVisible({ timeout: 90_000 })

      const jsonEditor = page.getByTestId('agent-card-json')
      const current = JSON.parse(await jsonEditor.inputValue()) as {
        profile: { name: string; bio: string[]; adjectives: string[]; topics: string[] }
        style: { all: string[] }
        guardrails: { never: string[] }
      }
      current.profile.name = updatedName
      current.profile.bio = ['E2E card-authored identity.']
      current.profile.adjectives = ['careful', 'direct']
      current.profile.topics = ['agent card smoke']
      current.style.all = ['Be concise and show exact next steps.']
      current.guardrails.never = ['Invent verification evidence.']
      await jsonEditor.fill(JSON.stringify(current, null, 2))

      await page.getByTestId('agent-card-preview-apply').click()
      await expect(page.getByTestId('agent-card-preview-diff')).toBeVisible({ timeout: 60_000 })
      await expect(page.getByText('Can apply')).toBeVisible({ timeout: 60_000 })
      await expect(page.getByText('yes')).toBeVisible({ timeout: 60_000 })
      await expect(page.getByTestId('agent-card-validation')).toBeVisible()

      const applyResponsePromise = page.waitForResponse((response) =>
        response.url().includes(`/api/assistants/${assistantId}/agent-card/import`) &&
        response.request().method() === 'POST' &&
        response.status() !== 200,
      )
      await page.getByTestId('agent-card-apply').click()
      expect((await applyResponsePromise).status()).toBe(201)
      await expect(page.getByTestId('agent-card-version-history')).toBeVisible({ timeout: 60_000 })

      let identityPayload: {
        documents?: Array<{ document_type: string; status: string; version: number; content: Record<string, unknown> }>
        identityPackage?: { compiledPromptSections?: string[] }
      } = {}
      await expect.poll(async () => {
        const identityResponse = await page.request.get(`/api/assistants/${assistantId}/identity`, { timeout: 120_000 })
        expect(identityResponse.status()).toBe(200)
        identityPayload = await identityResponse.json() as typeof identityPayload
        return Boolean(identityPayload.documents?.some((doc) => doc.document_type === 'SOUL' && doc.status === 'active'))
      }, { timeout: 60_000 }).toBe(true)
      const soul = identityPayload.documents?.find((doc) => doc.document_type === 'SOUL' && doc.status === 'active')
      expect(soul?.version).toBeGreaterThanOrEqual(1)
      expect(soul?.content.source).toBe('agent_card')
      const prompt = identityPayload.identityPackage?.compiledPromptSections?.join('\n') ?? ''
      expect(prompt).toContain('## SOUL')
      expect(prompt).not.toContain('"profile"')

      await runCommand(page, 'Preview Agent Card Runtime Prompt')
      await expect(page.getByTestId('agent-card-panel').getByText('Runtime Prompt')).toBeVisible({ timeout: 60_000 })
      await runCommand(page, 'Export Agent Card')
      await expect(jsonEditor).toHaveValue(/"card_hash"/, { timeout: 60_000 })

      const second = JSON.parse(await jsonEditor.inputValue()) as {
        profile: { name: string; bio: string[]; adjectives: string[]; topics: string[] }
        style: { all: string[] }
        guardrails: { never: string[] }
      }
      second.profile.name = secondName
      second.profile.bio = ['Second E2E card-authored identity.']
      await jsonEditor.fill(JSON.stringify(second, null, 2))

      const secondApplyResponsePromise = page.waitForResponse((response) =>
        response.url().includes(`/api/assistants/${assistantId}/agent-card/import`) &&
        response.request().method() === 'POST' &&
        response.status() !== 200,
      )
      await page.getByTestId('agent-card-apply').click()
      expect((await secondApplyResponsePromise).status()).toBe(201)
      await expect(page.getByTestId('agent-card-revert-SOUL-1')).toBeVisible({ timeout: 60_000 })

      const revertResponsePromise = page.waitForResponse((response) =>
        response.url().includes(`/api/assistants/${assistantId}/identity`) &&
        response.request().method() === 'POST',
      )
      await page.getByTestId('agent-card-revert-SOUL-1').click()
      expect((await revertResponsePromise).status()).toBe(201)
      await expect.poll(async () => {
        const identityResponse = await page.request.get(`/api/assistants/${assistantId}/identity`, { timeout: 120_000 })
        const latest = await identityResponse.json() as typeof identityPayload
        const activeSoul = latest.documents?.find((doc) => doc.document_type === 'SOUL' && doc.status === 'active')
        return {
          name: (activeSoul?.content.profile as { name?: string } | undefined)?.name,
          version: activeSoul?.version ?? 0,
        }
      }, { timeout: 60_000 }).toEqual({ name: revertedFromName, version: 3 })

      await page.getByTestId('agent-card-export').click()
      await expect(jsonEditor).toHaveValue(/"card_hash"/, { timeout: 60_000 })
    } finally {
      if (assistantId) {
        await deleteAssistantBestEffort(page, { assistantId, csrfToken, timeoutMs: 45_000 })
      }
    }
  })
})
