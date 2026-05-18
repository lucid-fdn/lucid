import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const synthesizeSpeechMock = vi.fn()
const transcribeAudioDetailedMock = vi.fn()
const runProjectBuilderTurnMock = vi.fn()
const proxyToWorkerStreamMock = vi.fn()

vi.mock('@/lib/ai/media-gateway', () => ({
  synthesizeSpeech: (...args: unknown[]) => synthesizeSpeechMock(...args),
  transcribeAudioDetailed: (...args: unknown[]) => transcribeAudioDetailedMock(...args),
}))

vi.mock('@/lib/ai/services/builder-service', () => ({
  runProjectBuilderTurn: (...args: unknown[]) => runProjectBuilderTurnMock(...args),
}))

vi.mock('@/lib/ai/worker-proxy', () => ({
  proxyToWorkerStream: (...args: unknown[]) => proxyToWorkerStreamMock(...args),
}))

describe('control-plane media/builder/agent adapters', () => {
  it('records speech provider metadata and output bytes', async () => {
    synthesizeSpeechMock.mockResolvedValueOnce({
      buffer: Buffer.from('voice'),
      mimeType: 'audio/ogg',
      fileName: 'preview.ogg',
      provider: 'trustgate',
      model: 'gpt-4o-mini-tts',
      voice: 'coral',
      format: 'opus',
      latencyMs: 12,
    })

    const { speechGenerationAdapter } = await import('../adapters/speech')
    const output = await speechGenerationAdapter({
      text: 'Hello',
      gatewayBaseUrls: ['https://trustgate.example'],
      gatewayApiKeys: ['key'],
      voice: 'coral',
      format: 'opus',
    })

    expect(output).toMatchObject({
      provider: 'trustgate',
      model: 'gpt-4o-mini-tts',
      usage: { bytes: 5 },
      receipt: {
        latencyMs: 12,
        metadata: {
          voice: 'coral',
          format: 'opus',
          outputBytes: 5,
        },
      },
    })
  })

  it('records transcription provider metadata and input bytes', async () => {
    transcribeAudioDetailedMock.mockResolvedValueOnce({
      text: 'hello',
      provider: 'trustgate',
      model: 'gpt-4o-mini-transcribe',
      inputBytes: 8,
      mimeType: 'audio/ogg',
      fileName: 'voice.ogg',
      latencyMs: 44,
    })

    const { transcriptionGenerationAdapter } = await import('../adapters/transcription')
    const output = await transcriptionGenerationAdapter({
      buffer: Buffer.from('voice-in'),
      mimeType: 'audio/ogg',
      fileName: 'voice.ogg',
      candidates: [{ provider: 'trustgate' }],
    })

    expect(output).toMatchObject({
      text: 'hello',
      provider: 'trustgate',
      model: 'gpt-4o-mini-transcribe',
      usage: { bytes: 8 },
      receipt: {
        latencyMs: 44,
        metadata: {
          fileName: 'voice.ogg',
          inputBytes: 8,
        },
      },
    })
  })

  it('wraps builder turns without flattening builder mode metadata', async () => {
    runProjectBuilderTurnMock.mockResolvedValueOnce({
      result: { mode: 'template', blueprint: { name: 'Agent' } },
      models: {
        requestedModelId: 'lucid-auto',
        modelId: 'lucid-auto',
        fastModelId: 'openai/gpt-4.1-mini',
        strongModel: 'strong',
        fastModel: 'fast',
        useGatewayFallback: false,
      },
    })

    const { builderGenerationAdapter } = await import('../adapters/builder')
    const output = await builderGenerationAdapter({
      orgId: 'org-1',
      prompt: 'Build an agent',
      preferredMode: 'template',
    })

    expect(output.provider).toBe('trustgate')
    expect(output.model).toBe('lucid-auto')
    expect(output.receipt).toMatchObject({
      metadata: {
        mode: 'template',
        preferredMode: 'template',
        useGatewayFallback: false,
      },
    })
  })

  it('wraps worker stream dispatch as an agent-run envelope', async () => {
    proxyToWorkerStreamMock.mockResolvedValueOnce(new Response('stream', {
      status: 200,
      headers: {
        'x-lucid-route': 'shared',
      },
    }))

    const { agentRunGenerationAdapter } = await import('../adapters/agent-run')
    const output = await agentRunGenerationAdapter({
      assistantId: 'assistant-1',
      assistantConfig: {
        id: 'assistant-1',
        name: 'Assistant',
        system_prompt: null,
        lucid_model: 'lucid-auto',
        temperature: null,
        max_tokens: null,
        memory_enabled: true,
        memory_window_size: null,
        org_id: 'org-1',
        policy_config: null,
        updated_at: new Date().toISOString(),
      },
      plugins: [],
      message: 'Hello',
      userId: 'user-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
    })

    expect(output).toMatchObject({
      provider: 'worker',
      model: 'lucid-auto',
      runId: 'run-1',
      receipt: {
        requestId: 'run-1',
        metadata: {
          route: 'shared',
          status: 200,
        },
      },
    })
    expect(output.response.status).toBe(200)
  })
})
