import { expect, test } from '@playwright/test'
import {
  archiveProject,
  chatAssistant,
  createAssistant,
  createTeam,
  deleteAssistantBestEffort,
  deleteRuntime,
  deleteTeam,
  deployDedicatedRuntimeForAgent,
  getCanvasTopology,
  getCsrfToken,
  getRuntimeL2Status,
  getRuntimes,
  getTeams,
  getWorkspaceContext,
  waitForCondition,
} from './helpers'

async function deployByoRailwayRuntime(page: import('@playwright/test').Page, args: {
  orgId: string
  csrfToken: string
  displayName: string
}) {
  const response = await page.request.post(`/api/runtimes?org_id=${args.orgId}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': args.csrfToken,
    },
    data: {
      displayName: args.displayName,
      description: `BYO Railway runtime for ${args.displayName}`,
      provider: 'railway',
      engine: 'openclaw',
      runtimeTier: 'byo',
      runtimeFlavor: 'c2a_autonomous',
      channelOwnership: 'runtime_native',
      channelMode: 'native',
      dedicatedTransportMode: 'native_pulse',
      runtimeBootstrapConfig: {
        advanced: {
          maintenance: {
            auto_update_policy: 'security_auto',
          },
        },
      },
    },
    timeout: 180_000,
  })

  return {
    status: response.status(),
    body: await response.json().catch(() => null),
  }
}

async function deployBlueprintAgent(page: import('@playwright/test').Page, args: {
  orgId: string
  csrfToken: string
  name: string
  runtimeId: string
}) {
  const response = await page.request.post(`/api/orgs/${args.orgId}/blueprints/deploy`, {
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': args.csrfToken,
    },
    data: {
      create_project: true,
      blueprint: {
        version: '1.0',
        project: {
          name: `${args.name} Project`,
          description: 'E2E BYO Railway builder deployment project',
          category: 'Operations',
        },
        items: [{
          kind: 'agent',
          source: 'blank',
          name: args.name,
          runtime: {
            mode: 'byo',
            engine: 'openclaw',
            provider: 'railway',
            runtime_id: args.runtimeId,
            channel_ownership: 'lucid_relay',
          },
          spec: {
            name: args.name,
            description: 'Temporary BYO Railway agent created by the builder deployment smoke test.',
            system_prompt: 'You are a temporary E2E agent. When asked to say OK, answer exactly OK.',
            skills: [],
            memory_enabled: true,
            schedules: [],
          },
        }],
      },
    },
    timeout: 180_000,
  })

  return {
    status: response.status(),
    body: await response.json().catch(() => null),
  }
}

async function deployBlueprintTeam(page: import('@playwright/test').Page, args: {
  orgId: string
  csrfToken: string
  name: string
}) {
  const response = await page.request.post(`/api/orgs/${args.orgId}/blueprints/deploy`, {
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': args.csrfToken,
    },
    data: {
      create_project: true,
      blueprint: {
        version: '1.0',
        project: {
          name: `${args.name} Project`,
          description: 'E2E builder team deployment project',
          category: 'Operations',
        },
        items: [{
          kind: 'team',
          source: 'blank',
          name: args.name,
          spec: {
            kind: 'team',
            objective: 'Coordinate a temporary E2E builder team.',
            members: [
              {
                role: 'Coordinator',
                is_coordinator: true,
                system_prompt: 'Coordinate the E2E team and summarize work.',
                plugins: [],
                skills: [],
              },
              {
                role: 'Researcher',
                system_prompt: 'Research requested topics for the E2E team.',
                plugins: [],
                skills: [],
              },
            ],
            edges: [{ from: 'Coordinator', to: 'Researcher' }],
          },
        }],
      },
    },
    timeout: 180_000,
  })

  return {
    status: response.status(),
    body: await response.json().catch(() => null),
  }
}

test.describe('Project flow smoke', () => {
  test.describe.configure({ timeout: 8 * 60_000 })

  test('can create, chat with, and delete a temporary agent', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/agents?view=canvas`, {
      waitUntil: 'domcontentloaded',
      timeout: 300_000,
    })
    const csrfToken = await getCsrfToken(page)
    const agentName = `E2E Temp Agent ${Date.now()}`

    let assistantId: string | null = null

    try {
      const created = await createAssistant(page, {
        orgId: workspace.org.id,
        name: agentName,
        csrfToken,
      })

      expect(created.status).toBe(201)
      assistantId = created.body.id
      expect(assistantId).toBeTruthy()

      const topology = await waitForCondition(
        () => getCanvasTopology(page, workspace.org.id),
        (result) => result.status === 200
          && result.body.agents.some((item: Record<string, unknown>) => item.id === assistantId),
        { timeoutMs: 60_000, intervalMs: 5_000 },
      )

      expect(
        topology.body.agents.some((item: Record<string, unknown>) => item.id === assistantId),
      ).toBe(true)

      const chat = await chatAssistant(page, assistantId!, 'Say OK and only OK.')
      if (chat.status === 502) {
        test.skip(true, 'Shared worker chat backend is unavailable in this local environment')
      }
      expect(chat.status).toBe(200)
      expect(chat.contentType).toContain('text/event-stream')
      expect(chat.text).toContain('"delta":"OK"')
    } finally {
      if (assistantId) {
        await deleteAssistantBestEffort(page, { assistantId, csrfToken })
      }
    }
  })

  test('can create and delete a temporary team', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/teams`, {
      waitUntil: 'domcontentloaded',
      timeout: 300_000,
    })
    const teamName = `E2E Temp Team ${Date.now()}`
    const objective = 'Smoke test team objective'

    let teamId: string | null = null

    try {
      const created = await createTeam(page, {
        orgId: workspace.org.id,
        projectId: workspace.project.id,
        name: teamName,
        objective,
      })

      expect(created.status).toBe(201)
      teamId = created.body.crew.id
      expect(teamId).toBeTruthy()

      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByText(teamName, { exact: true })).toBeVisible({ timeout: 30_000 })
    } finally {
      if (teamId) {
        const deleted = await deleteTeam(page, {
          teamId,
          orgId: workspace.org.id,
          projectId: workspace.project.id,
        })
        expect(deleted.status).toBe(200)

        const teamsAfterDelete = await waitForCondition(
          () => getTeams(page, {
            orgId: workspace.org.id,
            projectId: workspace.project.id,
          }),
          (result) => result.status === 200
            && !result.body.crews.some((item: Record<string, unknown>) => item.id === teamId),
          { timeoutMs: 60_000, intervalMs: 5_000 },
        )

        expect(
          teamsAfterDelete.body.crews.some((item: Record<string, unknown>) => item.id === teamId),
        ).toBe(false)

        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page.getByText(teamName, { exact: true })).toHaveCount(0)
      }
    }
  })

  test('reports at least one connected dedicated runtime with a deployment URL', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/agents?view=canvas`, {
      waitUntil: 'domcontentloaded',
      timeout: 300_000,
    })
    const csrfToken = await getCsrfToken(page)
    let runtimes = await getRuntimes(page, workspace.org.id)

    expect(runtimes.status).toBe(200)
    expect(Array.isArray(runtimes.body.runtimes)).toBe(true)

    let connectedDedicated = runtimes.body.runtimes.find((runtime: Record<string, unknown>) =>
      runtime.status === 'connected'
      && runtime.runtimeTier === 'dedicated'
      && typeof runtime.deploymentUrl === 'string'
      && runtime.deploymentUrl.length > 0,
    )

    if (!connectedDedicated) {
      const agentName = `E2E Runtime Inventory Agent ${Date.now()}`
      let assistantId: string | null = null
      let runtimeId: string | null = null

      try {
        const created = await createAssistant(page, {
          orgId: workspace.org.id,
          name: agentName,
          csrfToken,
        })
        expect(created.status).toBe(201)
        assistantId = created.body.id

        const deployment = await deployDedicatedRuntimeForAgent(page, {
          orgId: workspace.org.id,
          agentId: assistantId!,
          csrfToken,
          displayName: `${agentName} runtime`,
        })

        if (
          deployment.status === 403
          && typeof deployment.body?.error === 'string'
          && deployment.body.error.includes('Managed runtimes require a Pro plan or higher')
        ) {
          test.skip(true, 'Managed runtime deployment is not enabled for this environment/org')
        }

        expect(deployment.status).toBe(200)
        runtimeId = deployment.body.runtimeId as string

        runtimes = await waitForCondition(
          () => getRuntimes(page, workspace.org.id),
          (result) =>
            result.status === 200 &&
            result.body.runtimes.some((runtime: Record<string, unknown>) =>
              runtime.id === runtimeId &&
              runtime.status === 'connected' &&
              typeof runtime.deploymentUrl === 'string' &&
              runtime.deploymentUrl.length > 0,
            ),
          { timeoutMs: 120_000, intervalMs: 5_000 },
        )

        connectedDedicated = runtimes.body.runtimes.find((runtime: Record<string, unknown>) => runtime.id === runtimeId)
      } finally {
        if (runtimeId) {
          await deleteRuntime(page, { runtimeId, orgId: workspace.org.id })
        }
        if (assistantId) {
          await deleteAssistantBestEffort(page, { assistantId, csrfToken, timeoutMs: 30_000 })
        }
      }
    }

    expect(connectedDedicated).toBeTruthy()
  })

  test('dedicated deploy reaches an explicit control-plane outcome and cleans up', async ({ page }) => {
    test.setTimeout(8 * 60_000)

    const workspace = await getWorkspaceContext(page)
    await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/agents?view=canvas`, {
      waitUntil: 'domcontentloaded',
      timeout: 300_000,
    })
    const csrfToken = await getCsrfToken(page)
    const agentName = `E2E Dedicated Agent ${Date.now()}`

    let assistantId: string | null = null
    let runtimeId: string | null = null

    try {
      const created = await createAssistant(page, {
        orgId: workspace.org.id,
        name: agentName,
        csrfToken,
      })

      expect(created.status).toBe(201)
      assistantId = created.body.id
      expect(assistantId).toBeTruthy()

      const deployment = await deployDedicatedRuntimeForAgent(page, {
        orgId: workspace.org.id,
        agentId: assistantId!,
        csrfToken,
        displayName: `${agentName} runtime`,
      })

      if (
        deployment.status === 403
        && typeof deployment.body?.error === 'string'
        && deployment.body.error.includes('Managed runtimes require a Pro plan or higher')
      ) {
        test.skip(true, 'Managed runtime deployment is not enabled for this environment/org')
      }

      expect(deployment.status).toBe(200)
      expect(deployment.body.runtimeId).toBeTruthy()
      runtimeId = deployment.body.runtimeId as string

      const controlPlaneOutcome = await waitForCondition(
        () => getRuntimeL2Status(page, { orgId: workspace.org.id, runtimeId: runtimeId! }),
        (result) => {
          const l2Status = result.status === 200 ? result.body.l2Status : null
          return !!l2Status && l2Status.status === 'running'
        },
        { timeoutMs: 300_000, intervalMs: 10_000 },
      )

      const l2Status = controlPlaneOutcome.body.l2Status as
        | { status: 'deploying' | 'running' | 'stopped' | 'failed' | 'terminated' | 'unknown'; url?: string; health?: string; error?: string }
        | null
      expect(l2Status?.status).toBe('running')

      const deployedRuntimeResponse = await waitForCondition(
        () => getRuntimes(page, workspace.org.id),
        (result) => {
          const runtime = result.body.runtimes.find((item: Record<string, unknown>) => item.id === runtimeId)
          return result.status === 200
            && !!runtime
            && runtime.status === 'connected'
            && typeof runtime.deploymentUrl === 'string'
            && runtime.deploymentUrl.length > 0
        },
        { timeoutMs: 180_000, intervalMs: 10_000 },
      )

      const connectedRuntime = deployedRuntimeResponse.body.runtimes.find(
        (item: Record<string, unknown>) => item.id === runtimeId,
      )
      expect(connectedRuntime).toBeTruthy()
      expect(connectedRuntime.deploymentUrl).toBeTruthy()

      const topology = await waitForCondition(
        () => getCanvasTopology(page, workspace.org.id),
        (result) => {
          if (result.status !== 200) return false
          const agent = result.body.agents.find((item: Record<string, unknown>) => item.id === assistantId)
          return agent?.runtimeId === runtimeId
        },
        { timeoutMs: 60_000, intervalMs: 5_000 },
      )

      const dedicatedAgent = topology.body.agents.find((item: Record<string, unknown>) => item.id === assistantId)
      expect(dedicatedAgent.runtimeId).toBe(runtimeId)

      const chat = await chatAssistant(page, assistantId!, 'Say OK and only OK.')
      expect(chat.status).toBe(200)
      expect(chat.contentType).toContain('text/event-stream')
      expect(chat.route).toBe('dedicated')
      expect(chat.routeReason).toBe('dedicated-runtime')
      expect(chat.text).toContain('"delta":"OK"')
    } finally {
      if (assistantId) {
        if (runtimeId) {
          const runtimeDeleted = await deleteRuntime(page, {
            runtimeId,
            orgId: workspace.org.id,
          })
          expect(runtimeDeleted.status).toBe(200)
        }

        await deleteAssistantBestEffort(page, { assistantId, csrfToken, timeoutMs: 30_000 })
      }

      if (runtimeId) {
        const runtimesAfterDelete = await waitForCondition(
          () => getRuntimes(page, workspace.org.id),
          (result) => result.status === 200
            && !result.body.runtimes.some((item: Record<string, unknown>) => item.id === runtimeId),
          { timeoutMs: 300_000, intervalMs: 10_000 },
        )
        expect(
          runtimesAfterDelete.body.runtimes.some((item: Record<string, unknown>) => item.id === runtimeId),
        ).toBe(false)
      }
    }
  })

  test('can deploy a team blueprint through the builder deployment contract', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    const csrfToken = await getCsrfToken(page)
    const teamName = `E2E Builder Team ${Date.now()}`

    let projectId: string | null = null
    let teamId: string | null = null
    let assistantIds: string[] = []

    try {
      const deployed = await deployBlueprintTeam(page, {
        orgId: workspace.org.id,
        csrfToken,
        name: teamName,
      })

      expect(deployed.status).toBe(201)
      projectId = deployed.body.projectId
      teamId = deployed.body.primary?.crewId
      assistantIds = deployed.body.primary?.assistantIds ?? []

      expect(teamId).toBeTruthy()
      expect(assistantIds).toHaveLength(2)

      const teams = await waitForCondition(
        () => getTeams(page, {
          orgId: workspace.org.id,
          projectId: projectId!,
        }),
        (result) => result.status === 200
          && result.body.crews.some((item: Record<string, unknown>) => item.id === teamId),
        { timeoutMs: 60_000, intervalMs: 5_000 },
      )

      expect(teams.body.crews.some((item: Record<string, unknown>) => item.id === teamId)).toBe(true)
    } finally {
      if (teamId && projectId) {
        await deleteTeam(page, {
          teamId,
          orgId: workspace.org.id,
          projectId,
        }).catch(() => null)
      }
      for (const assistantId of assistantIds) {
        await deleteAssistantBestEffort(page, { assistantId, csrfToken }).catch(() => null)
      }
      if (projectId) {
        await archiveProject(page, {
          orgId: workspace.org.id,
          projectId,
        }).catch(() => null)
      }
    }
  })

  test('BYO Railway provider deploy creates a real runtime-backed builder agent and cleans up', async ({ page }) => {
    test.setTimeout(8 * 60_000)

    const workspace = await getWorkspaceContext(page)
    await page.goto(`/${workspace.org.slug}/projects/${workspace.project.slug}/agents?view=canvas`, {
      waitUntil: 'domcontentloaded',
      timeout: 300_000,
    })
    const csrfToken = await getCsrfToken(page)
    const agentName = `E2E BYO Railway Agent ${Date.now()}`

    let runtimeId: string | null = null
    let assistantId: string | null = null
    let projectId: string | null = null

    try {
      const deployment = await deployByoRailwayRuntime(page, {
        orgId: workspace.org.id,
        csrfToken,
        displayName: `${agentName} runtime`,
      })

      if (
        deployment.status === 403 &&
        typeof deployment.body?.error === 'string' &&
        (
          deployment.body.error.includes('BYO runtimes require') ||
          deployment.body.error.includes('Dedicated native Pulse is not enabled')
        )
      ) {
        test.skip(true, 'BYO runtime deployment is not enabled for this environment/org')
      }
      if (
        deployment.status === 502 &&
        typeof deployment.body?.error === 'string' &&
        (
          deployment.body.error.includes('Admin authentication required') ||
          deployment.body.error.includes('Invalid admin API key') ||
          deployment.body.error.includes('Too Many Requests') ||
          deployment.body.error.includes('No L2 passport owner wallet')
        )
      ) {
        test.skip(true, `BYO Railway L2 deploy is not configured for this environment: ${deployment.body.error}`)
      }

      expect(deployment.status, JSON.stringify(deployment.body)).toBe(200)
      expect(deployment.body?.runtime?.id).toBeTruthy()
      expect(deployment.body?.l2Deployment).toBeTruthy()
      runtimeId = String(deployment.body.runtime.id)

      const controlPlaneOutcome = await waitForCondition(
        () => getRuntimeL2Status(page, { orgId: workspace.org.id, runtimeId: runtimeId! }),
        (result) => {
          const l2Status = result.status === 200 ? result.body.l2Status : null
          return !!l2Status && l2Status.status === 'running'
        },
        { timeoutMs: 300_000, intervalMs: 10_000 },
      )
      expect(controlPlaneOutcome.body.l2Status?.status).toBe('running')

      const connectedRuntimeResponse = await waitForCondition(
        () => getRuntimes(page, workspace.org.id),
        (result) => {
          const runtime = result.status === 200
            ? result.body.runtimes.find((item: Record<string, unknown>) => item.id === runtimeId)
            : null
          return !!runtime
            && runtime.status === 'connected'
            && runtime.runtimeTier === 'byo'
            && runtime.runtimeFlavor === 'c2a_autonomous'
            && runtime.provider === 'railway'
            && typeof runtime.deploymentUrl === 'string'
            && runtime.deploymentUrl.length > 0
        },
        { timeoutMs: 180_000, intervalMs: 10_000 },
      )

      const connectedRuntime = connectedRuntimeResponse.body.runtimes.find(
        (item: Record<string, unknown>) => item.id === runtimeId,
      )
      expect(connectedRuntime.provider).toBe('railway')
      expect(connectedRuntime.runtimeTier).toBe('byo')
      expect(connectedRuntime.runtimeFlavor).toBe('c2a_autonomous')

      const blueprintDeployment = await deployBlueprintAgent(page, {
        orgId: workspace.org.id,
        csrfToken,
        name: agentName,
        runtimeId,
      })

      expect(blueprintDeployment.status).toBe(201)
      projectId = blueprintDeployment.body?.projectId ?? null
      assistantId = blueprintDeployment.body?.primary?.assistantId ?? blueprintDeployment.body?.assistants?.[0] ?? null
      expect(projectId).toBeTruthy()
      expect(assistantId).toBeTruthy()

      const topology = await waitForCondition(
        () => getCanvasTopology(page, workspace.org.id),
        (result) => {
          if (result.status !== 200) return false
          const agent = result.body.agents.find((item: Record<string, unknown>) => item.id === assistantId)
          return agent?.runtimeId === runtimeId
        },
        { timeoutMs: 60_000, intervalMs: 5_000 },
      )
      const byoAgent = topology.body.agents.find((item: Record<string, unknown>) => item.id === assistantId)
      expect(byoAgent.runtimeId).toBe(runtimeId)

      const chat = await chatAssistant(page, assistantId!, 'Say OK and only OK.')
      expect(chat.status).toBe(200)
      expect(chat.contentType).toContain('text/event-stream')
      expect(chat.route).toBe('dedicated')
      expect(chat.routeReason).toBe('dedicated-runtime')
      expect(chat.text).toContain('"delta":"OK"')
    } finally {
      if (runtimeId) {
        await deleteRuntime(page, {
          runtimeId,
          orgId: workspace.org.id,
        })
      }
      if (assistantId) {
        await deleteAssistantBestEffort(page, { assistantId, csrfToken, timeoutMs: 30_000 })
      }
      if (projectId) {
        await archiveProject(page, {
          orgId: workspace.org.id,
          projectId,
        })
      }
    }
  })
})
