import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const candidate = {
  provider: 'openai' as const,
  baseUrl: 'https://api.openai.test/v1',
  apiKey: 'openai-key',
  model: 'gpt-image-2',
  cacheKey: 'openai:test:gpt-image-2',
}

describe('OpenAI-compatible image payloads', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses OpenAI multipart image[] fields for edit reference images', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === 'https://assets.example/avatar.png') {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      }

      expect(url).toBe('https://api.openai.test/v1/images/edits')
      expect(init?.method).toBe('POST')
      expect(init?.headers).toEqual({ Authorization: 'Bearer openai-key' })
      expect(init?.body).toBeInstanceOf(FormData)

      const formData = init?.body as FormData
      expect(formData.get('model')).toBe('gpt-image-2')
      expect(formData.get('prompt')).toBe('Keep identity and change studio lighting.')
      expect(formData.getAll('image[]')).toHaveLength(1)

      return Response.json({
        data: [{ b64_json: Buffer.from([4, 5, 6]).toString('base64') }],
      })
    })

    const { editOpenAICompatibleImage } = await import('../openai-compatible')
    const result = await editOpenAICompatibleImage(candidate, {
      purpose: 'agent-avatar',
      mode: 'edit',
      prompt: 'Keep identity and change studio lighting.',
      referenceImages: [{ url: 'https://assets.example/avatar.png', role: 'identity' }],
      outputFormat: 'webp',
    })

    expect(Array.from(result.imageBytes)).toEqual([4, 5, 6])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to non-streaming generation when streaming fails', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body))
      if (body.stream) {
        return Response.json({ error: { message: 'streaming proxy failed' } }, { status: 502 })
      }

      return Response.json({
        data: [{ b64_json: Buffer.from([7, 8, 9]).toString('base64') }],
      })
    })

    const { generateOpenAICompatibleImage } = await import('../openai-compatible')
    const result = await generateOpenAICompatibleImage(candidate, {
      purpose: 'agent-avatar',
      mode: 'generate',
      prompt: 'Generate a studio avatar.',
      outputFormat: 'webp',
      streamProgress: true,
      partialImages: 3,
    })

    expect(Array.from(result.imageBytes)).toEqual([7, 8, 9])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ stream: true })
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).not.toHaveProperty('stream')
  })

  it('normalizes provider quota failures without streaming fallback retry', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        error: {
          message: 'OpenAIException - Billing hard limit has been reached.',
        },
      }, { status: 400 }),
    )

    const { generateOpenAICompatibleImage } = await import('../openai-compatible')
    await expect(generateOpenAICompatibleImage(candidate, {
      purpose: 'agent-avatar',
      mode: 'generate',
      prompt: 'Generate a studio avatar.',
      outputFormat: 'webp',
      streamProgress: true,
      partialImages: 3,
    })).rejects.toMatchObject({
      code: 'provider_quota_exceeded',
      message: 'Image provider quota or billing limit reached. Check TrustGate/OpenAI billing, then try again.',
      statusCode: 402,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('normalizes TrustGate string-wrapped LiteLLM quota failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        error: 'LiteLLM error (400): {"error":{"message":"OpenAIException - Billing hard limit has been reached."}}',
      }, { status: 502 }),
    )

    const { generateOpenAICompatibleImage } = await import('../openai-compatible')
    await expect(generateOpenAICompatibleImage(candidate, {
      purpose: 'agent-avatar',
      mode: 'generate',
      prompt: 'Generate a studio avatar.',
      outputFormat: 'webp',
    })).rejects.toMatchObject({
      code: 'provider_quota_exceeded',
      message: 'Image provider quota or billing limit reached. Check TrustGate/OpenAI billing, then try again.',
      statusCode: 502,
    })
  })

  it('keeps non-json provider error bodies for diagnostics', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('upstream image gateway temporarily unavailable', {
        status: 502,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    const { generateOpenAICompatibleImage } = await import('../openai-compatible')
    await expect(generateOpenAICompatibleImage(candidate, {
      purpose: 'agent-avatar',
      mode: 'generate',
      prompt: 'Generate a studio avatar.',
      outputFormat: 'webp',
    })).rejects.toMatchObject({
      code: 'provider_unavailable',
      message: 'upstream image gateway temporarily unavailable',
      statusCode: 502,
    })
  })
})
