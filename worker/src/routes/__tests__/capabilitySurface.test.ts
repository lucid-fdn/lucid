import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCapabilitySurfaceInspectionHandler } from '../capabilitySurface.js'
import * as capabilitySurfaceModule from '../../agent/contracts/capability-surface.js'

vi.mock('../../agent/contracts/capability-surface.js', () => ({
  buildAgentCapabilitySurface: vi.fn(),
}))

const buildAgentCapabilitySurface = vi.mocked(capabilitySurfaceModule.buildAgentCapabilitySurface)

function createMockResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
  }
}

function createSupabaseMock(assistant: Record<string, unknown> | null) {
  const single = vi.fn().mockResolvedValue({ data: assistant, error: assistant ? null : { message: 'missing' } })
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  const rpc = vi.fn().mockResolvedValue({
    data: [
      {
        plugin_slug: 'github',
        plugin_name: 'GitHub',
        tool_manifest: [{ name: 'list_issues', description: 'List issues', parameters: {} }],
        enabled_tools: null,
        org_config: {},
        plugin_config: {},
        kind: 'integration',
        transport: 'nango',
        trust_level: 'verified',
        execution_mode: 'gateway',
        auth_type: 'oauth2',
        auth_provider: 'github',
        connection_id: 'conn-1',
      },
    ],
    error: null,
  })

  return {
    from,
    rpc,
  }
}

describe('createCapabilitySurfaceInspectionHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildAgentCapabilitySurface.mockResolvedValue({
      introspection: {
        engine: 'openclaw',
        runtimeFlavor: 'shared',
        channelOwnership: 'lucid_relay',
      },
    })
  })

  it('returns 400 when assistantId is missing', async () => {
    const handler = createCapabilitySurfaceInspectionHandler({} as never, {} as never)
    const res = createMockResponse()

    await handler({ body: {} } as never, res as never)

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'assistantId is required' })
  })

  it('builds and returns the capability surface introspection for a run', async () => {
    const supabase = createSupabaseMock({
      id: 'asst-1',
      name: 'Agent',
      engine: 'openclaw',
      runtime_flavor: 'shared',
      system_prompt: 'Be concise',
      soul_content: null,
      lucid_model: 'openai/gpt-4.1',
      temperature: 0.2,
      max_tokens: 4096,
      memory_enabled: true,
      memory_window_size: 20,
      org_id: 'org-1',
      passport_id: null,
      policy_config: null,
      wallet_enabled: false,
      approval_required_tools: [],
      agent_wallets: [],
    })

    const handler = createCapabilitySurfaceInspectionHandler(supabase as never, {} as never)
    const res = createMockResponse()

    await handler({
      body: {
        assistantId: 'asst-1',
        userMessage: 'Use github to list issues',
        conversationId: 'conv-1',
        channelId: 'channel-1',
        userId: 'user-1',
        engine: 'hermes',
        runtimeFlavor: 'shared',
        channelOwnership: 'lucid_relay',
        model: 'openai/gpt-4.1-mini',
      },
    } as never, res as never)

    expect(buildAgentCapabilitySurface).toHaveBeenCalledWith(expect.objectContaining({
      assistant: expect.objectContaining({
        id: 'asst-1',
        engine: 'hermes',
        runtime_flavor: 'shared',
        lucid_model: 'openai/gpt-4.1-mini',
      }),
      engine: 'hermes',
      runtimeFlavor: 'shared',
      channelOwnership: 'lucid_relay',
      userMessage: 'Use github to list issues',
      conversationId: 'conv-1',
      channelId: 'channel-1',
      userId: 'user-1',
      plugins: [
        expect.objectContaining({
          slug: 'github',
          name: 'GitHub',
        }),
      ],
      selection: expect.objectContaining({
        model: 'openai/gpt-4.1-mini',
        provider: 'openai',
      }),
    }))
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      effectiveConfig: {
        engine: 'hermes',
        runtimeFlavor: 'shared',
        channelOwnership: 'lucid_relay',
        model: 'openai/gpt-4.1-mini',
        provider: 'openai',
      },
      capabilitySurface: {
        engine: 'openclaw',
        runtimeFlavor: 'shared',
        channelOwnership: 'lucid_relay',
      },
    })
  })

  it('rejects unsupported runtime configurations', async () => {
    const supabase = createSupabaseMock({
      id: 'asst-1',
      name: 'Agent',
      engine: 'hermes',
      runtime_flavor: 'shared',
      system_prompt: 'Be concise',
      soul_content: null,
      lucid_model: 'openai/gpt-4.1',
      temperature: 0.2,
      max_tokens: 4096,
      memory_enabled: true,
      memory_window_size: 20,
      org_id: 'org-1',
      passport_id: null,
      policy_config: null,
      wallet_enabled: false,
      approval_required_tools: [],
      agent_wallets: [],
    })

    const handler = createCapabilitySurfaceInspectionHandler(supabase as never, {} as never)
    const res = createMockResponse()

    await handler({
      body: {
        assistantId: 'asst-1',
        engine: 'hermes',
        runtimeFlavor: 'shared',
        channelOwnership: 'runtime_native',
      },
    } as never, res as never)

    expect(buildAgentCapabilitySurface).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({
      error: 'hermes does not support runtime_native for shared',
    })
  })
})
