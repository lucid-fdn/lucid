import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  executePublicRuntimeAction,
  executePublicRuntimeChat,
  selectAppRuntimeExecutor,
  type RuntimeExecutorContext,
} from '../runtime-executor'

const context: RuntimeExecutorContext = {
  app: {
    id: 'app_1',
    org_id: 'org_1',
    project_id: 'project_1',
    generation_run_id: null,
    name: 'Support Concierge',
    slug: 'support-concierge',
    assistant_ids: ['assistant_1'],
  },
  manifest: {
    runtime: { executor: 'mock' },
  },
  capabilities: ['chat', 'public_actions'],
}

describe('app runtime executor seam', () => {
  it('selects manifest-declared mock runtime without touching provider code', () => {
    expect(selectAppRuntimeExecutor(context).key).toBe('mock')
  })

  it('executes deterministic mock chat and action results', async () => {
    await expect(executePublicRuntimeChat(context, {
      assistantId: 'assistant_1',
      agentopsTraceId: 'trace_1',
      messages: [{ role: 'user', content: 'Hello' }],
    })).resolves.toMatchObject({
      model: 'mock',
      estimatedCostCents: 0,
      text: expect.stringContaining('Hello'),
    })

    await expect(executePublicRuntimeAction(context, {
      action: 'escalate',
      input: { priority: 'high' },
    })).resolves.toMatchObject({
      status: 'completed',
      result: { action: 'escalate', mode: 'mock', accepted: true },
    })
  })
})
