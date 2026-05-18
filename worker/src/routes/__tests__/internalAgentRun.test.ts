import { beforeEach, describe, expect, it, vi } from 'vitest'

const runAgent = vi.fn()

vi.mock('../../agent/engines/index.js', () => ({
  runAgent,
}))

describe('createInternalAgentRunHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forces tool-free execution when no tools are allowlisted', async () => {
    runAgent.mockResolvedValue({
      text: 'ok',
      usage: { promptTokens: 1, completionTokens: 1 },
      steps: 1,
      toolCallsUsed: 0,
      budgetExhausted: false,
      hasProviderError: false,
    })

    const { createInternalAgentRunHandler } = await import('../internalAgentRun.js')

    const handler = createInternalAgentRunHandler({} as any, {
      LUCID_API_BASE_URL: 'http://localhost:3001',
      LUCID_API_KEY: 'test-key',
    } as any)

    const responseState: {
      statusCode?: number
      jsonBody?: unknown
    } = {}

    await handler(
      {
        body: {
          agent: {
            name: 'builder',
            systemPrompt: 'system',
            model: 'openai/gpt-4.1',
          },
          input: {
            message: 'hello',
          },
          policy: {
            allowBuiltInSkills: false,
            allowedTools: [],
          },
        },
      } as any,
      {
        status(code: number) {
          responseState.statusCode = code
          return this
        },
        json(payload: unknown) {
          responseState.jsonBody = payload
          return this
        },
      } as any,
    )

    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        assistant: expect.objectContaining({
          policy_config: expect.objectContaining({
            disable_builtin_skills: true,
            internal_allowed_tools: [],
          }),
        }),
        budget: expect.objectContaining({
          maxToolCalls: 0,
        }),
      }),
    )
    expect(responseState.jsonBody).toEqual(
      expect.objectContaining({
        text: 'ok',
      }),
    )
  })
})
