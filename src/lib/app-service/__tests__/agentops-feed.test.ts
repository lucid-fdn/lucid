import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getAppDeployment: vi.fn(),
  captureException: vi.fn(),
}))

vi.mock('@/lib/db/client', () => ({
  supabase: {
    from: mocks.from,
  },
  ErrorService: {
    captureException: mocks.captureException,
  },
}))

vi.mock('../deployments', () => ({
  getAppDeployment: mocks.getAppDeployment,
}))

import { APP_SERVICE_REDACTED } from '../security-redaction'
import { listAppAgentOpsFeed } from '../runtime-gateway/agentops'

function builder(data: unknown[] = [], error: unknown = null) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data, error })),
  }
  return chain
}

describe('app-scoped AgentOps feed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.APP_SERVICE_STRUCTURED_LOGS
  })

  it('merges app deployment events with matching runtime events', async () => {
    const appEvents = builder([
      {
        id: '11111111-1111-4111-8111-111111111111',
        app_deployment_id: 'app-1',
        generation_run_id: 'gen-1',
        event_type: 'public_chat_completed',
        severity: 'info',
        message: 'Public chat completed with sk-test-secret12345',
        provider: null,
        external_id: null,
        payload: {
          agentops_trace_id: 'trace-1',
          api_key: 'sk-test-secret12345',
        },
        created_at: '2026-05-01T12:00:00.000Z',
      },
    ])
    const runtimeEvents = builder([
      {
        id: '22222222-2222-4222-8222-222222222222',
        agent_id: 'assistant-1',
        event_type: 'tool_call',
        severity: 'warning',
        payload: {
          appDeploymentId: 'app-1',
          toolName: 'search',
        },
        created_at: '2026-05-01T12:01:00.000Z',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        agent_id: 'assistant-other',
        event_type: 'tool_call',
        severity: 'info',
        payload: { appDeploymentId: 'other-app' },
        created_at: '2026-05-01T12:02:00.000Z',
      },
    ])
    mocks.from.mockImplementation((table: string) => {
      if (table === 'app_deployment_events') return appEvents
      if (table === 'runtime_events') return runtimeEvents
      throw new Error(`unexpected table ${table}`)
    })

    const feed = await listAppAgentOpsFeed('app-1', {
      orgId: 'org-1',
      generationRunId: 'gen-1',
      assistantIds: ['assistant-1'],
      limit: 20,
    })

    expect(feed.map((item) => item.id)).toEqual([
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
    ])
    expect(feed[0]).toMatchObject({
      type: 'tool_call',
      severity: 'warning',
      metadata: expect.objectContaining({
        source: 'runtime_events',
        matched_by: 'app_deployment_id',
        event_class: 'tool_execution',
        stack_id: 'agentops',
      }),
    })
    expect(feed[1]).toMatchObject({
      type: 'public_chat_completed',
      severity: 'info',
      metadata: expect.objectContaining({
        source: 'app_deployment_events',
        event_class: 'app_service_public_runtime',
        stack_id: 'app_service',
        api_key: APP_SERVICE_REDACTED,
      }),
    })
    expect(feed[1].message).toContain(APP_SERVICE_REDACTED)
  })

  it('can resolve app context when the caller only has an app id', async () => {
    const appEvents = builder([])
    const runtimeEvents = builder([
      {
        id: '44444444-4444-4444-8444-444444444444',
        agent_id: 'assistant-1',
        event_type: 'run_finished',
        severity: 'info',
        payload: {},
        created_at: '2026-05-01T12:00:00.000Z',
      },
    ])
    mocks.getAppDeployment.mockResolvedValue({
      id: 'app-1',
      org_id: 'org-1',
      project_id: 'project-1',
      generation_run_id: 'gen-1',
      assistant_ids: ['assistant-1'],
      slug: 'demo',
    })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'app_deployment_events') return appEvents
      if (table === 'runtime_events') return runtimeEvents
      throw new Error(`unexpected table ${table}`)
    })

    const feed = await listAppAgentOpsFeed('app-1')

    expect(mocks.getAppDeployment).toHaveBeenCalledWith('app-1')
    expect(feed).toHaveLength(1)
    expect(feed[0].metadata).toMatchObject({
      matched_by: 'assistant_id',
    })
  })
})
