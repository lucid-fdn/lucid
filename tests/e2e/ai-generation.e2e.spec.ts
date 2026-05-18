import { expect, test } from '@playwright/test'

import {
  archiveProject,
  createAssistant,
  createTeamWithMembers,
  deleteAssistantBestEffort,
  deleteTeam,
  getCsrfToken,
  getProjects,
  getWorkspaceContext,
} from './helpers'

async function sendBuilderPrompt(page: import('@playwright/test').Page, value: string) {
  const field = page.getByPlaceholder('Refine the setup, add tools, change tone, or ask for a team...')
  await expect(field).toBeVisible({ timeout: 60_000 })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await field.click()
    await field.fill('')
    await field.pressSequentially(value, { delay: 10 })
    if (await field.evaluate((node) => (node as HTMLTextAreaElement).value).catch(() => '') === value) break
    await page.waitForTimeout(500)
  }
  await expect(field).toHaveValue(value, { timeout: 15_000 })
  await field.press('Enter')
}

async function waitForBuilderCreateReady(page: import('@playwright/test').Page) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const createButtons = createProjectButtons(page)
    const createButton = createButtons.last()
    if (
      await createButtons.count() > 0
      && await createButton.isVisible().catch(() => false)
      && await createButton.isEnabled().catch(() => false)
    ) return

    const toneQuestion = page.getByText(/Would you like .* tone/i)
    if (await toneQuestion.isVisible().catch(() => false)) {
      await sendBuilderPrompt(page, 'Use a concise tone and proceed with the draft now.')
      await page.waitForTimeout(750)
      continue
    }

    if (await clickVisibleButton(page, 'Skip')) {
      await page.waitForTimeout(1_500)
      continue
    }

    if (await clickVisibleButton(page, 'Continue', { fromEnd: true })) {
      await page.waitForTimeout(1_500)
      continue
    }

    await page.waitForTimeout(1_500)
  }

  const createButtons = createProjectButtons(page)
  const createButton = createButtons.last()
  await expect.poll(async () => createButtons.count(), {
    timeout: 120_000,
    message: 'expected a visible Create button after completing builder setup steps',
  }).toBeGreaterThan(0)
  await expect(createButton).toBeEnabled({ timeout: 120_000 })
}

async function clickVisibleButton(
  page: import('@playwright/test').Page,
  name: string,
  options: { fromEnd?: boolean } = {},
) {
  const buttons = page.getByRole('button', { name: new RegExp(name, 'i') })
  const count = await buttons.count()
  const indexes = options.fromEnd
    ? Array.from({ length: count }, (_, index) => count - index - 1)
    : Array.from({ length: count }, (_, index) => index)
  for (const index of indexes) {
    const button = buttons.nth(index)
    if (await button.isVisible().catch(() => false) && await button.isEnabled().catch(() => false)) {
      await button.click()
      return true
    }
  }
  return false
}

function builderProjectName(page: import('@playwright/test').Page) {
  return page.locator('#builder-project-name')
}

function createProjectButtons(page: import('@playwright/test').Page) {
  return page.locator('button:visible').filter({ hasText: /^Create (project|agent|team)$/ })
}

function createProjectButton(page: import('@playwright/test').Page) {
  return createProjectButtons(page).last()
}

async function getWithTransientRetry(page: import('@playwright/test').Page, url: string, timeout = 120_000) {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.request.get(url, { timeout })
    } catch (error) {
      lastError = error
      await page.waitForTimeout(750 * (attempt + 1))
    }
  }
  throw lastError
}

async function fillPromptAndEnable(page: import('@playwright/test').Page, selector: string, buttonName: string, value: string) {
  const field = page.locator(selector)
  await field.click()
  await field.clear()
  await field.pressSequentially(value, { delay: 10 })
  await expect(page.getByRole('button', { name: buttonName })).toBeEnabled({ timeout: 30_000 })
}

test.describe('AI generation flows', () => {
  test.describe.configure({ timeout: 10 * 60_000 })

  test('can generate and create a reviewed project from /new', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    const generatedProjectName = `Smoke Support Project ${Date.now()}`
    let createdProjectId: string | null = null

    try {
      await page.setExtraHTTPHeaders({
        'x-real-ip': `10.78.${Date.now() % 250}.${Math.floor(Math.random() * 250)}`,
      })
      await page.goto(`/${workspace.org.slug}/new?start=describe`, {
        waitUntil: 'domcontentloaded',
        timeout: 300_000,
      })

      await sendBuilderPrompt(
        page,
        `Create from scratch a single support agent project. Do not use templates, catalogs, or prebuilt setups. Keep it as one agent, not a team. Name the project "${generatedProjectName}". The agent should answer common questions and escalate billing issues.`,
      )
      await waitForBuilderCreateReady(page)
      await expect(builderProjectName(page)).toHaveValue(generatedProjectName, { timeout: 120_000 })

      if (await page.getByText(/Selected apps need setup|Set up selected apps before creating/i).isVisible().catch(() => false)) {
        await clickVisibleButton(page, 'Skip', { fromEnd: true })
        await page.waitForTimeout(1_000)
      }

      await createProjectButton(page).click()
      let createdProject: Record<string, unknown> | null = null
      await expect.poll(async () => {
        const projects = await getProjects(page, workspace.org.id)
        if (projects.status !== 200) return false
        createdProject = projects.body.projects.find((project: Record<string, unknown>) => project.name === generatedProjectName) ?? null
        return Boolean(createdProject)
      }, { timeout: 180_000 }).toBe(true)
      expect(createdProject).toBeTruthy()
      createdProjectId = createdProject.id as string
    } finally {
      if (createdProjectId) {
        const archived = await archiveProject(page, {
          orgId: workspace.org.id,
          projectId: createdProjectId,
        })
        if (archived.status !== 200) {
          console.warn('Project cleanup failed after successful creation smoke', archived.status, archived.body)
        }
      }
    }
  })

  test('can guided-edit an existing assistant and apply the changes', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    const csrfToken = await getCsrfToken(page)
    const initialName = `E2E Guided Agent ${Date.now()}`
    const updatedDescription = `Handles smoke test guided edits ${Date.now()}`
    const updatedPrompt = 'You are the smoke test agent. Respond clearly, directly, and escalate billing issues immediately.'

    const created = await createAssistant(page, {
      orgId: workspace.org.id,
      name: initialName,
      csrfToken,
    })
    expect(created.status).toBe(201)

    const assistantId = created.body.id as string

    try {
      const generation = await page.request.post(`/api/orgs/${workspace.org.id}/blueprints/generate`, {
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        data: {
          prompt: `Keep this as a single agent. Set the description exactly to "${updatedDescription}". Replace the system prompt with: "${updatedPrompt}"`,
          draft: {
            version: '1.0',
            mode: 'blank-agent',
            project: {
              name: initialName,
            },
            starterName: initialName,
            agent: {
              kind: 'agent',
              system_prompt: 'You are a helpful AI agent',
            },
          },
        },
        timeout: 180_000,
      })
      expect(generation.ok()).toBe(true)
      const generationBody = await generation.json()
      expect(generationBody.mode).toBe('blank-agent')
      expect(generationBody.draft.project.description).toBe(updatedDescription)
      expect(generationBody.draft.agent.system_prompt).toBe(updatedPrompt)

      const applyResponse = await page.request.patch(`/api/assistants/${assistantId}`, {
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        data: {
          name: generationBody.draft.starterName || generationBody.draft.project.name,
          description: generationBody.draft.project.description,
          system_prompt: generationBody.draft.agent.system_prompt,
        },
        timeout: 180_000,
      })
      expect(applyResponse.ok()).toBe(true)
      const appliedAssistant = await applyResponse.json()
      expect(appliedAssistant.description).toBe(updatedDescription)
      expect(appliedAssistant.system_prompt).toBe(updatedPrompt)

      await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/agents/${assistantId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 300_000,
      })

      await expect(page.getByText(initialName, { exact: true }).first()).toBeVisible({ timeout: 120_000 })
    } finally {
      await deleteAssistantBestEffort(page, { assistantId, csrfToken, timeoutMs: 45_000 })
    }
  })

  test('can guided-edit an existing team and apply the compatible changes', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    const csrfToken = await getCsrfToken(page)

    const agentA = await createAssistant(page, {
      orgId: workspace.org.id,
      name: `E2E Team Agent A ${Date.now()}`,
      csrfToken,
    })
    expect(agentA.status).toBe(201)
    const agentAId = agentA.body.id as string

    const agentB = await createAssistant(page, {
      orgId: workspace.org.id,
      name: `E2E Team Agent B ${Date.now()}`,
      csrfToken,
    })
    expect(agentB.status).toBe(201)
    const agentBId = agentB.body.id as string

    const updatedTeamName = `E2E Guided Team Updated ${Date.now()}`
    const updatedObjective = `Handle smoke test escalation flow ${Date.now()}`
    const updatedDescription = `Coordinates guided team edit verification ${Date.now()}`

    let teamId: string | null = null

    try {
      const teamCreated = await createTeamWithMembers(page, {
        orgId: workspace.org.id,
        projectId: workspace.project.id,
        name: `E2E Guided Team ${Date.now()}`,
        objective: 'Initial objective',
        members: [
          { assistant_id: agentAId, role: 'triage', is_coordinator: true },
          { assistant_id: agentBId, role: 'resolver', is_coordinator: false },
        ],
        edges: [
          {
            source_member_index: 0,
            target_member_index: 1,
            direction: 'bidirectional',
          },
        ],
      })
      expect(teamCreated.status).toBe(201)
      teamId = teamCreated.body.crew.id as string

      await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/teams/${teamId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 300_000,
      })

      await fillPromptAndEnable(
        page,
        '#team-guided-edit',
        'Generate suggestion',
        `Keep the same two members. Rename the team to "${updatedTeamName}". Set the objective to "${updatedObjective}". Set the description to "${updatedDescription}". Keep the roles as triage lead and resolver, with triage lead as coordinator.`,
      )
      await page.getByRole('button', { name: 'Generate suggestion' }).click()

      await expect(page.getByRole('button', { name: 'Apply changes' })).toBeVisible({ timeout: 120_000 })
      await expect(page.getByRole('button', { name: 'Apply changes' })).toBeVisible({ timeout: 120_000 })

      await page.getByRole('button', { name: 'Apply changes' }).click()

      await expect(page.locator('#team-name')).toHaveValue(updatedTeamName, { timeout: 120_000 })
      await expect(page.locator('#team-objective')).toHaveValue(updatedObjective, { timeout: 120_000 })
      await expect(page.locator('#team-description')).toHaveValue(updatedDescription, { timeout: 120_000 })
      await expect(page.getByText('triage lead', { exact: true }).first()).toBeVisible({ timeout: 120_000 })
      await expect(page.getByText('resolver', { exact: true }).first()).toBeVisible({ timeout: 120_000 })
    } finally {
      if (teamId) {
        const deleted = await deleteTeam(page, {
          teamId,
          orgId: workspace.org.id,
          projectId: workspace.project.id,
        })
        expect(deleted.status).toBe(200)
      }
      await deleteAssistantBestEffort(page, { assistantId: agentAId, csrfToken, timeoutMs: 45_000 })
      await deleteAssistantBestEffort(page, { assistantId: agentBId, csrfToken, timeoutMs: 45_000 })
    }
  })

  test('can refine a team during creation with AI and create it', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    const csrfToken = await getCsrfToken(page)

    const agentAName = `E2E Dialog Agent A ${Date.now()}`
    const agentBName = `E2E Dialog Agent B ${Date.now()}`
    const refinedTeamName = `E2E Review Team ${Date.now()}`

    const agentA = await createAssistant(page, {
      orgId: workspace.org.id,
      name: agentAName,
      csrfToken,
    })
    expect(agentA.status).toBe(201)
    const agentAId = agentA.body.id as string

    const agentB = await createAssistant(page, {
      orgId: workspace.org.id,
      name: agentBName,
      csrfToken,
    })
    expect(agentB.status).toBe(201)
    const agentBId = agentB.body.id as string

    let teamId: string | null = null

    try {
      const generation = await page.request.post(`/api/orgs/${workspace.org.id}/blueprints/generate`, {
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        data: {
          prompt: `Keep the same two selected members. Rename the team to "${refinedTeamName}". Set the first member role to triage lead, the second to resolver, and keep the first member as coordinator.`,
          draft: {
            version: '1.0',
            mode: 'blank-team',
            project: {
              name: `E2E Draft Team ${Date.now()}`,
            },
            starterName: `E2E Draft Team ${Date.now()}`,
            team: {
              kind: 'team',
              objective: 'Draft team objective for AI refinement',
              members: [
                {
                  role: agentAName,
                  is_coordinator: true,
                  system_prompt: 'You are agent A',
                  model_hint: 'lucid-auto',
                },
                {
                  role: agentBName,
                  is_coordinator: false,
                  system_prompt: 'You are agent B',
                  model_hint: 'lucid-auto',
                },
              ],
              edges: [
                {
                  from: agentAName,
                  to: agentBName,
                },
              ],
            },
          },
        },
        timeout: 180_000,
      })
      expect(generation.ok()).toBe(true)
      const generationBody = await generation.json()
      expect(generationBody.mode).toBe('blank-team')

      const members = [
        {
          assistant_id: agentAId,
          role: generationBody.draft.team.members[0].role,
          is_coordinator: generationBody.draft.team.members[0].is_coordinator,
        },
        {
          assistant_id: agentBId,
          role: generationBody.draft.team.members[1].role,
          is_coordinator: generationBody.draft.team.members[1].is_coordinator,
        },
      ]
      const createdTeam = await createTeamWithMembers(page, {
        orgId: workspace.org.id,
        projectId: workspace.project.id,
        name: generationBody.draft.project.name,
        objective: generationBody.draft.team.objective || 'Draft team objective for AI refinement',
        members,
        edges: [
          {
            source_member_index: 0,
            target_member_index: 1,
            direction: 'bidirectional',
          },
        ],
      })
      expect(createdTeam.status).toBe(201)
      teamId = createdTeam.body.crew.id as string

      await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/teams`, {
        waitUntil: 'domcontentloaded',
        timeout: 300_000,
      })

      await expect(page.getByText(refinedTeamName, { exact: true }).first()).toBeVisible({ timeout: 120_000 })
      await expect(page.getByText('2 members', { exact: false }).first()).toBeVisible({ timeout: 120_000 })

      const teamsResponse = await getWithTransientRetry(
        page,
        `/api/crews?org_id=${workspace.org.id}&project_id=${workspace.project.id}`,
      )
      expect(teamsResponse.ok()).toBe(true)
      const teamsBody = await teamsResponse.json()
      const persistedTeam = teamsBody.crews.find((crew: Record<string, unknown>) => crew.name === refinedTeamName)
      expect(persistedTeam).toBeTruthy()
    } finally {
      if (teamId) {
        const deleted = await deleteTeam(page, {
          teamId,
          orgId: workspace.org.id,
          projectId: workspace.project.id,
        })
        expect(deleted.status).toBe(200)
      }
      await deleteAssistantBestEffort(page, { assistantId: agentAId, csrfToken, timeoutMs: 45_000 })
      await deleteAssistantBestEffort(page, { assistantId: agentBId, csrfToken, timeoutMs: 45_000 })
    }
  })
})
