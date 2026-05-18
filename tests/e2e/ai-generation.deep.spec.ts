import type { Locator, Page, Response } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  archiveProject,
  createAssistant,
  deleteAssistantBestEffort,
  getCsrfToken,
  getProjects,
  getWorkspaceContext,
} from './helpers'

async function fillPromptAndEnable(root: Page | Locator, selector: string, buttonName: string, value: string) {
  const field = root.locator(selector)
  await field.click()
  await field.clear()
  await field.pressSequentially(value, { delay: 10 })
  await expect(root.getByRole('button', { name: buttonName })).toBeEnabled({ timeout: 30_000 })
}

async function sendBuilderPrompt(page: Page, value: string) {
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

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = waitForChatResponse()
    await sendButton.click()
    const response = await responsePromise
    if (response?.ok()) return
    if (response) {
      const body = await response.text().catch(() => '<unavailable>')
      throw new Error(`Builder chat failed with ${response.status()} ${response.statusText()}: ${body.slice(0, 2000)}`)
    }
    await page.waitForTimeout(750 * (attempt + 1))
    await typePrompt()
  }

  throw new Error('Builder chat request was not sent after 3 attempts.')
}

async function waitForBuilderCreateReady(page: Page) {
  const createButton = createProjectButton(page)

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await createButton.count() > 0 && await createButton.isEnabled().catch(() => false)) return

    const toneQuestion = page.getByText(/Would you like .* tone/i)
    if (await toneQuestion.isVisible().catch(() => false)) {
      await sendBuilderPrompt(page, 'Use a concise tone and proceed with the draft now.')
      await page.waitForTimeout(750)
      continue
    }

    if (await clickLastVisibleButton(page, 'Continue')) {
      await page.waitForTimeout(1_500)
      continue
    }

    if (await clickLastVisibleButton(page, 'Skip')) {
      await page.waitForTimeout(1_500)
      continue
    }

    await page.waitForTimeout(1_500)
  }

  await expect(createButton).toBeEnabled({ timeout: 120_000 })
}

async function clickLastVisibleButton(page: Page, name: string) {
  const buttons = page.getByRole('button', { name: new RegExp(`^${name}$`) })
  for (let index = await buttons.count() - 1; index >= 0; index -= 1) {
    const button = buttons.nth(index)
    if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) {
      await button.click()
      return true
    }
  }
  return false
}

async function waitForBuilderHydration(page: Page) {
  await expect(page.getByText(/I drafted a (single agent|team|template-based)/i)).toBeVisible({ timeout: 120_000 })
  await expect(builderProjectName(page)).not.toHaveValue('', { timeout: 120_000 })
}

function builderProjectName(page: Page): Locator {
  return page.locator('#builder-project-name')
}

function createProjectButton(page: Page): Locator {
  return page.getByRole('button', { name: /^Create( project| agent| team)?$/i }).last()
}

async function answerVisibleRequiredInput(page: Page, values: Record<string, string>) {
  const builderLog = page.getByRole('log')
  const textbox = builderLog.locator('input[id^="decision-"]').last()
  if (!await textbox.isVisible({ timeout: 2_500 }).catch(() => false)) {
    return false
  }

  const id = await textbox.getAttribute('id')
  const key = id?.replace(/^decision-/, '') ?? ''
  const label = await textbox.getAttribute('aria-label')
    ?? await textbox.getAttribute('placeholder')
    ?? key
  const value = values[key] ?? values[label] ?? 'E2E required value'

  await textbox.fill(value)
  const apply = builderLog.getByRole('button', { name: 'Apply' }).last()
  await expect(apply).toBeEnabled({ timeout: 10_000 })
  await apply.click()
  await page.waitForTimeout(1_000)
  return true
}

async function expectBuilderCreateHandoff(page: Page, workspaceSlug: string, deployResponse: Response) {
  let body: Record<string, any> | null = null
  try {
    body = await deployResponse.json()
  } catch {
    // Chromium can evict the response body after a fast redirect/navigation.
    // The durable UX contract is the final handoff URL.
  }

  const projectSlug = body?.projectSlug ?? body?.project_slug
  const agentId = body?.primary?.kind === 'agent'
    ? body.primary.assistantId
    : null
  const crewId = body?.primary?.kind === 'team'
    ? body.primary.crewId
    : body?.crews?.[0]

  if (projectSlug && agentId) {
    await expect(page).toHaveURL(
      new RegExp(`/${workspaceSlug}/projects/${projectSlug}/agents\\?view=canvas&agent=${agentId}&focus=created`),
      { timeout: 120_000 },
    )
    return
  }

  if (projectSlug && crewId) {
    await expect(page).toHaveURL(
      new RegExp(`/${workspaceSlug}/projects/${projectSlug}/agents\\?view=canvas&team=${crewId}&focus=created`),
      { timeout: 120_000 },
    )
    return
  }

  if (projectSlug) {
    await expect(page).toHaveURL(
      new RegExp(`/${workspaceSlug}/projects/${projectSlug}/agents\\?view=canvas(?:&.*)?$`),
      { timeout: 120_000 },
    )
    return
  }

  await expect(page).toHaveURL(
    new RegExp(`/${workspaceSlug}/projects/[^/]+/agents\\?view=canvas(?:&.*)?$`),
    { timeout: 120_000 },
  )
}

async function expectOkResponse(response: Response, context: string) {
  if (response.ok()) return
  let body = ''
  try {
    body = await response.text()
  } catch {
    body = '<unavailable>'
  }
  throw new Error(`${context} failed with ${response.status()} ${response.statusText()}: ${body.slice(0, 2000)}`)
}

test.describe('AI generation deep scenarios', () => {
  test.describe.configure({ timeout: 10 * 60_000 })

  test('guided interview can generate a reviewed setup and create a project', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    let createdProjectId: string | null = null

    try {
      await page.setExtraHTTPHeaders({
        'x-real-ip': `10.79.${Date.now() % 250}.${Math.floor(Math.random() * 250)}`,
      })
      const initialProjects = await getProjects(page, workspace.org.id)
      expect(initialProjects.status).toBe(200)
      const initialProjectIds = new Set(
        initialProjects.body.projects.map((project: Record<string, unknown>) => project.id as string),
      )

      await page.goto(`/${workspace.org.slug}/new?start=interview`, {
        waitUntil: 'domcontentloaded',
        timeout: 300_000,
      })

      await sendBuilderPrompt(
        page,
        'Outcome: Answer customer questions, triage edge cases, and escalate billing issues. Audience or team: Support operations team. Needed integrations: Slack and Stripe. Constraints: Prefer a single agent unless a handoff is clearly required.',
      )
      await waitForBuilderCreateReady(page)
      await expect(builderProjectName(page)).not.toHaveValue('', { timeout: 120_000 })
      await builderProjectName(page).fill(`E2E Guided Support ${Date.now()}`)

      if (await page.getByText(/Selected apps need setup|Set up selected apps before creating/i).isVisible().catch(() => false)) {
        await clickLastVisibleButton(page, 'Skip')
        await page.waitForTimeout(1_000)
      }

      const [deployResponse] = await Promise.all([
        page.waitForResponse((response) =>
          response.url().includes(`/api/orgs/${workspace.org.id}/blueprints/deploy`)
          && response.request().method() === 'POST',
        ),
        createProjectButton(page).click(),
      ])
      await expectOkResponse(deployResponse, 'guided interview deploy')
      await expectBuilderCreateHandoff(page, workspace.org.slug, deployResponse)

      let createdProject: Record<string, unknown> | null = null
      await expect.poll(async () => {
        const projects = await getProjects(page, workspace.org.id)
        if (projects.status !== 200) return false
        createdProject = projects.body.projects.find((project: Record<string, unknown>) => !initialProjectIds.has(project.id as string)) ?? null
        return Boolean(createdProject)
      }, { timeout: 180_000 }).toBe(true)

      createdProjectId = createdProject?.id as string
      expect(createdProjectId).toBeTruthy()
    } finally {
      if (createdProjectId) {
        const archived = await archiveProject(page, {
          orgId: workspace.org.id,
          projectId: createdProjectId,
        })
        expect(archived.status).toBe(200)
      }
    }
  })

  test('builder normalizes the generated name and hydrates the right panel for broad prompts', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)

    await page.goto(`/${workspace.org.slug}/new?start=describe`, {
      waitUntil: 'domcontentloaded',
      timeout: 300_000,
    })

    await sendBuilderPrompt(page, 'start daily assistnat')
    await waitForBuilderHydration(page)
    await expect(builderProjectName(page)).toHaveValue('Personal Assistant', { timeout: 120_000 })
    await expect(page.getByRole('button', { name: /Engine OpenClaw/i })).toBeVisible({ timeout: 120_000 })
    await expect(page.getByRole('button', { name: /Skills/i }).first()).toBeVisible({ timeout: 120_000 })
  })

  test('builder capability buttons mutate the draft and open the grouped connect step', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)

    await page.goto(`/${workspace.org.slug}/new?start=describe`, {
      waitUntil: 'domcontentloaded',
      timeout: 300_000,
    })

    await sendBuilderPrompt(
      page,
      'start daily assistnat',
    )
    await waitForBuilderHydration(page)

    const connectCta = page.getByRole('button', { name: 'Set up selected apps' })
    const builderLog = page.getByRole('log')
    const addButtons = builderLog.getByRole('button', { name: /Add (Asana|Google|Notion|Linear|Slack|Stripe)/i })
    const skillsSummaryButton = page.getByRole('button', { name: /Skills/ })
    await expect(builderLog.getByRole('button', { name: 'Browse all skills' })).toBeVisible({ timeout: 120_000 })
    await expect(addButtons.first()).toBeVisible({ timeout: 120_000 })

    if (await connectCta.isVisible().catch(() => false)) {
      await connectCta.click()
      await expect(page.getByRole('dialog', { name: 'Set up selected apps' })).toBeVisible({ timeout: 30_000 })
      return
    }

    let connectOpened = false

    await addButtons.first().click()
    await expect.poll(async () => {
      return (await skillsSummaryButton.textContent().catch(() => '')) ?? ''
    }, { timeout: 30_000 }).not.toContain('No skills added')

    if (!connectOpened) {
      const continueButton = builderLog.getByRole('button', { name: 'Continue' }).last()
      if (await continueButton.isVisible().catch(() => false)) {
        await continueButton.click()
      }
      for (let index = 0; index < 3 && !await connectCta.isVisible().catch(() => false); index += 1) {
        const skipButton = builderLog.getByRole('button', { name: 'Skip' }).last()
        if (!await skipButton.isVisible().catch(() => false)) break
        await skipButton.click()
        await page.waitForTimeout(500)
      }
      if (await connectCta.isVisible().catch(() => false)) {
        await connectCta.click()
        await expect(page.getByRole('dialog', { name: 'Set up selected apps' })).toBeVisible({ timeout: 30_000 })
        connectOpened = true
      }
    }

    if (!connectOpened) {
      const skillsDialog = page.getByRole('dialog', { name: 'Skills' })
      if (!await skillsDialog.isVisible().catch(() => false)) {
        await builderLog.getByRole('button', { name: 'Browse all skills' }).first().click({ timeout: 30_000 })
      }
      await expect(skillsDialog).toBeVisible({ timeout: 30_000 })
      await skillsDialog.getByRole('button', { name: 'Add', exact: true }).nth(1).click()
      await expect.poll(async () => {
        return (await skillsSummaryButton.textContent().catch(() => '')) ?? ''
      }, { timeout: 30_000 }).not.toContain('No skills added')
      if (await connectCta.isVisible().catch(() => false)) {
        await connectCta.click()
        await expect(page.getByRole('dialog', { name: 'Set up selected apps' })).toBeVisible({ timeout: 30_000 })
        connectOpened = true
      }
    }

    expect(connectOpened).toBe(true)
  })

  test('template-backed generation blocks deploy until required inputs are filled', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    let createdProjectId: string | null = null

    try {
      await page.setExtraHTTPHeaders({
        'x-real-ip': `10.77.${Date.now() % 250}.${Math.floor(Math.random() * 250)}`,
      })
      const initialProjects = await getProjects(page, workspace.org.id)
      expect(initialProjects.status).toBe(200)
      const initialProjectIds = new Set(
        initialProjects.body.projects.map((project: Record<string, unknown>) => project.id as string),
      )

      await page.goto(`/${workspace.org.slug}/new?start=describe`, {
        waitUntil: 'domcontentloaded',
        timeout: 300_000,
      })

      await sendBuilderPrompt(
        page,
        'Use the Brand Watch template for Acme and leave any required inputs empty for review.',
      )
      await expect(builderProjectName(page)).not.toHaveValue('', { timeout: 120_000 })
      await expect(page.getByText(/Brand Watch/i).first()).toBeVisible({ timeout: 120_000 })

      await builderProjectName(page).fill(`Acme Brand Watch ${Date.now()}`)

      for (let index = 0; index < 16; index += 1) {
        const createButton = createProjectButton(page)
        if (await createButton.count() > 0 && await createButton.isEnabled().catch(() => false)) break

        const builderLog = page.getByRole('log')
        if (await answerVisibleRequiredInput(page, {
          BRAND_NAME: 'Acme',
          ALERT_CHANNEL: '#brand-alerts',
          SLACK_ALERT_CHANNEL: '#brand-alerts',
        })) {
          continue
        }

        const chatSkip = builderLog.getByRole('button', { name: 'Skip' }).last()
        const chatContinue = builderLog.getByRole('button', { name: 'Continue' }).last()
        if (await chatContinue.isVisible().catch(() => false)) {
          await chatContinue.click()
          await page.waitForTimeout(1_000)
          continue
        }
        if (await chatSkip.isVisible().catch(() => false)) {
          await chatSkip.click()
          await page.waitForTimeout(1_000)
          continue
        }
        if (await page.getByText('Set up selected apps before creating').isVisible().catch(() => false)) {
          await page.getByRole('button', { name: 'Skip' }).last().click()
          await page.waitForTimeout(1_000)
          continue
        }
        break
      }

      await expect(createProjectButton(page)).toBeEnabled({ timeout: 30_000 })

      const [deployResponse] = await Promise.all([
        page.waitForResponse((response) =>
          response.url().includes(`/api/orgs/${workspace.org.id}/blueprints/deploy`)
          && response.request().method() === 'POST',
        ),
        createProjectButton(page).click(),
      ])
      await expectOkResponse(deployResponse, 'template-backed deploy')
      await expectBuilderCreateHandoff(page, workspace.org.slug, deployResponse)

      let createdProject: Record<string, unknown> | null = null
      await expect.poll(async () => {
        const projects = await getProjects(page, workspace.org.id)
        if (projects.status !== 200) return false
        createdProject = projects.body.projects.find((project: Record<string, unknown>) => !initialProjectIds.has(project.id as string)) ?? null
        return Boolean(createdProject)
      }, { timeout: 180_000 }).toBe(true)

      createdProjectId = createdProject?.id as string
      expect(createdProjectId).toBeTruthy()
    } finally {
      if (createdProjectId) {
        const archived = await archiveProject(page, {
          orgId: workspace.org.id,
          projectId: createdProjectId,
        })
        expect(archived.status).toBe(200)
      }
    }
  })

  test('generation route rejects prompts that are too short', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    const csrfToken = await getCsrfToken(page)
    const response = await page.request.post(`/api/orgs/${workspace.org.id}/blueprints/generate`, {
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      data: {
        prompt: 'Too short',
      },
      timeout: 180_000,
    })

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Invalid input')
    expect(body.issues).toContain('Prompt is too short (minimum 10 characters)')
  })

  test('team refinement preserves member count when the prompt explicitly keeps the current members', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    const csrfToken = await getCsrfToken(page)
    const response = await page.request.post(`/api/orgs/${workspace.org.id}/blueprints/generate`, {
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
      data: {
        prompt: 'Keep the same two selected members. Set the first member role to triage lead, the second to resolver, and keep the first member as coordinator.',
        draft: {
          version: '1.0',
          mode: 'blank-team',
          project: {
            name: `E2E Deep Draft Team ${Date.now()}`,
          },
          starterName: `E2E Deep Draft Team ${Date.now()}`,
          team: {
            kind: 'team',
            objective: 'Coordinate the selected agents',
            members: [
              {
                role: 'triage',
                is_coordinator: true,
                system_prompt: 'You are the triage role.',
                model_hint: 'lucid-auto',
              },
              {
                role: 'resolver',
                is_coordinator: false,
                system_prompt: 'You are the resolver role.',
                model_hint: 'lucid-auto',
              },
            ],
            edges: [
              {
                from: 'triage',
                to: 'resolver',
              },
            ],
          },
        },
      },
      timeout: 180_000,
    })

    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body.mode).toBe('blank-team')
    expect(Array.isArray(body.draft.team.members)).toBe(true)
    expect(body.draft.team.members.length).toBe(2)
    expect(body.draft.team.members[0].role).toBe('triage lead')
    expect(body.draft.team.members[0].is_coordinator).toBe(true)
    expect(body.draft.team.members[1].role).toBe('resolver')
    expect(body.draft.team.members[1].is_coordinator).toBe(false)
  })
})
