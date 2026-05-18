import { expect, test, type Page } from '@playwright/test'

import { getWorkspaceContext } from './helpers'

function overviewFixture() {
  return {
    learnings: [],
    decisionPreferences: [],
    evalRuns: [],
    evalReceipts: [],
    securityAttempts: [],
    contextSnapshots: [],
    projectPolicy: null,
    performance: null,
    performanceHealth: null,
    specialistTelemetry: [],
    browserProcedures: [],
    browserHostPlaybooks: [],
    browserSecurityEvents: [],
    browserSessionEvents: [],
    browserSessionShares: [],
    browserSessionSharedActions: [],
    operatorProfiles: [],
    designFeedback: [],
    decisionEvents: [],
    teamSetupDoctor: [],
    summary: {
      learningCount: 0,
      decisionPreferenceCount: 0,
      latestEvalScore: null,
      openSecurityAttemptCount: 0,
      safetyMode: 'normal',
      browserProcedureCount: 0,
      activeBrowserProcedureCount: 0,
      browserSecurityEventCount: 0,
      blockingBrowserSecurityEventCount: 0,
      browserSessionEventCount: 0,
      browserHandoffRequiredCount: 0,
      browserSessionShareCount: 0,
      activeBrowserSessionShareCount: 0,
      browserSessionSharedActionCount: 0,
    },
  }
}

async function mockPackApis(page: Page, orgId: string) {
  let forked = false
  let forkBody: Record<string, unknown> | null = null
  const now = new Date().toISOString()
  const install = {
    id: 'install-e2e-pack',
    orgId,
    projectId: null,
    packId: 'pack-e2e-governance',
    status: 'active',
    config: {},
    installedBy: null,
    installedAt: now,
    pausedAt: null,
    archivedAt: null,
    updatedAt: now,
  }
  const pack = {
    id: 'pack-e2e-governance',
    orgId,
    name: 'E2E Governance Pack',
    slug: 'e2e-governance-pack',
    description: 'E2E pack with a drifted resource that can be forked.',
    version: '1.0.0',
    status: 'active',
    summary: {
      resources: 1,
      policyCount: 1,
    },
    createdAt: now,
    updatedAt: now,
  }

  await page.route('**/api/agent-ops/workflows', async (route) => {
    await route.fulfill({ json: { workflows: [] } })
  })
  await page.route('**/api/agent-ops/overview?**', async (route) => {
    await route.fulfill({ json: overviewFixture() })
  })
  await page.route('**/api/agent-ops/runs?**', async (route) => {
    await route.fulfill({ json: { runs: [] } })
  })
  await page.route('**/api/mission-control/agents?**', async (route) => {
    await route.fulfill({ json: { agents: [] } })
  })
  await page.route('**/api/agent-ops/packs?**', async (route) => {
    await route.fulfill({ json: { packs: [pack] } })
  })
  await page.route('**/api/agent-ops/packs/install?**', async (route) => {
    await route.fulfill({
      json: {
        installs: [install],
        resources: [{
          id: 'resource-e2e-pack',
          orgId,
          installId: install.id,
          resourceKind: 'policy',
          resourceKey: 'commerce.spend.limit',
          resourceId: 'policy-e2e',
          status: forked ? 'forked' : 'drifted',
          manifestHash: 'pack-hash-1234567890',
          currentHash: forked ? 'local-fork-hash-1234567890' : 'local-drift-hash-1234567890',
          lastReconciledAt: now,
          forkedFromResourceId: forked ? 'resource-e2e-pack' : null,
          forkedAt: forked ? now : null,
          forkReason: forked ? 'Operator forked from Mission Control before local edits.' : null,
          uninstalledAt: null,
          uninstallReason: null,
          metadata: {
            reconcile_reason: 'Policy was edited locally after pack installation.',
            desired_spec_hash: 'pack-hash-1234567890',
            previous_spec_hash: 'local-drift-hash-1234567890',
          },
          createdAt: now,
          updatedAt: now,
        }],
      },
    })
  })
  await page.route('**/api/agent-ops/packs/install/install-e2e-pack', async (route) => {
    expect(route.request().method()).toBe('PATCH')
    forkBody = route.request().postDataJSON() as Record<string, unknown>
    forked = true
    await route.fulfill({ json: { ok: true, install } })
  })

  return {
    getForkBody: () => forkBody,
  }
}

test.describe('Agent Ops pack fork UI', () => {
  test.describe.configure({ timeout: 8 * 60_000 })

  test('forks a drifted managed resource from Mission Control', async ({ page }) => {
    const workspace = await getWorkspaceContext(page)
    const api = await mockPackApis(page, workspace.org.id)

    await page.goto(`/${workspace.org.slug}/mission-control/agent-ops`, {
      waitUntil: 'domcontentloaded',
      timeout: 300_000,
    })

    await expect(page.getByText('Managed packs', { exact: true })).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText('commerce.spend.limit')).toBeVisible()
    await page.getByRole('button', { name: 'Fork' }).click()

    await expect(page.getByText(/policy · forked/i).first()).toBeVisible()
    await expect(page.getByText(/commerce\.spend\.limit · forked/i).first()).toBeVisible()
    expect(api.getForkBody()).toEqual(expect.objectContaining({
      org_id: workspace.org.id,
      action: 'fork_resource',
      resource_key: 'commerce.spend.limit',
    }))
  })
})
