import { describe, expect, it } from 'vitest'

import { buildAgentOpsProductionPreflightPlan } from '../production-preflight'

describe('Agent Ops production preflight', () => {
  it('builds a non-destructive local promotion gate with core and worker checks', () => {
    const plan = buildAgentOpsProductionPreflightPlan()

    expect(plan.target).toBe('local')
    expect(plan.steps.map((step) => step.id)).toEqual([
      'typecheck',
      'lint-agent-ops',
      'capability-docs',
      'host-pack-matrix-dry-run',
      'agent-ops-tests',
      'channel-native-smoke',
      'agent-ops-stress',
      'web-app-smoke',
      'worker-runtime-packages-build',
      'worker-build',
      'worker-agent-ops-tests',
      'worker-channel-smoke',
    ])
    expect(plan.steps.every((step) => step.required)).toBe(true)
    expect(plan.steps.every((step) => step.destructive === false)).toBe(true)
    expect(plan.steps.every((step) => step.live === false)).toBe(true)
    expect(plan.steps.find((step) => step.id === 'agent-ops-tests')?.args).toEqual(expect.arrayContaining([
      'src/lib/agent-ops/__tests__',
      'src/app/api/agent-ops/overview/__tests__/route.test.ts',
    ]))
    expect(plan.steps.find((step) => step.id === 'host-pack-matrix-dry-run')?.args).toEqual([
      'run',
      'agent-ops:host-pack:install',
      '--',
      '--host',
      'all',
      '--root',
      '.',
    ])
    expect(plan.steps.find((step) => step.id === 'agent-ops-tests')?.description).toContain('production gates')
    expect(plan.steps.find((step) => step.id === 'channel-native-smoke')?.args).toEqual(['run', 'test:channels:smoke'])
    expect(plan.steps.find((step) => step.id === 'web-app-smoke')?.args).toEqual(['run', 'test:app-smoke:spawned'])
    expect(plan.steps.find((step) => step.id === 'worker-channel-smoke')?.args).toEqual(['--prefix', 'worker', 'run', 'test:channels:smoke'])
    const manualChecks = plan.manualPromotionChecks.join('\n')
    expect(manualChecks).toContain('adaptive dispatch')
    expect(manualChecks).toContain('channel-native Agent Ops launch/report')
    expect(manualChecks).toContain('host-pack doctor checks')
    expect(manualChecks).toContain('performance budget breach twice')
    expect(manualChecks).toContain('cross-org reads are denied')
  })

  it('can add read-only live checks without adding mutation steps', () => {
    const plan = buildAgentOpsProductionPreflightPlan({
      target: 'staging',
      includeLiveChecks: true,
      includeWorkerChecks: false,
    })

    expect(plan.target).toBe('staging')
    expect(plan.steps.map((step) => step.id)).toEqual([
      'typecheck',
      'lint-agent-ops',
      'capability-docs',
      'host-pack-matrix-dry-run',
      'agent-ops-tests',
      'channel-native-smoke',
      'agent-ops-stress',
      'web-app-smoke',
      'supabase-migration-list',
      'supabase-db-lint',
      'agent-ops-prod-schema-smoke',
    ])
    expect(plan.steps.filter((step) => step.live).map((step) => step.command)).toEqual(['supabase', 'supabase', 'npm'])
    expect(plan.steps.every((step) => step.destructive === false)).toBe(true)
    expect(plan.steps.find((step) => step.id === 'agent-ops-prod-schema-smoke')?.description).toContain('Browser Operator tables')
    expect(plan.manualPromotionChecks[0]).toContain('staging')
  })
})
