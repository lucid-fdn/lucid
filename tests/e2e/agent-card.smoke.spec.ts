import { expect, test } from '@playwright/test'
import { createAssistant, deleteAssistantBestEffort, getCsrfToken, getWorkspaceContext } from './helpers'

test.describe('Agent Card smoke', () => {
  test.describe.configure({ timeout: 8 * 60_000 })

  test('loads, edits, previews, applies, versions, exports, and renders prompt sections', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    const csrfToken = await getCsrfToken(page)
    const agentName = `E2E Agent Card ${Date.now()}`
    const updatedName = `${agentName} Updated`
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

      await page.getByTestId('agent-card-export').click()
      await expect(jsonEditor).toHaveValue(/"card_hash"/, { timeout: 60_000 })
    } finally {
      if (assistantId) {
        await deleteAssistantBestEffort(page, { assistantId, csrfToken, timeoutMs: 45_000 })
      }
    }
  })
})
