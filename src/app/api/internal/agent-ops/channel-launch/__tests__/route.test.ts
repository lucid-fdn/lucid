import crypto from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockStartAgentOpsRunFromChannelCommand = vi.fn()
const mockCaptureException = vi.fn()

vi.mock('@/lib/db/agent-ops-channel-launch', () => ({
  startAgentOpsRunFromChannelCommand: (...args: unknown[]) =>
    mockStartAgentOpsRunFromChannelCommand(...args),
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: {
    captureException: (...args: unknown[]) => mockCaptureException(...args),
  },
}))

function signedRequest(body: unknown): Request {
  const rawBody = JSON.stringify(body)
  const secret = process.env.WORKER_TRIGGER_SECRET ?? 'worker-secret'
  const requestId = 'request-1'
  const timestamp = String(Date.now())
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${requestId}:${timestamp}:${rawBody}`)
    .digest('hex')

  return new Request('http://localhost/api/internal/agent-ops/channel-launch', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-lucid-request-id': requestId,
      'x-lucid-timestamp': timestamp,
      'x-lucid-signature': signature,
    },
    body: rawBody,
  })
}

describe('POST /api/internal/agent-ops/channel-launch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env.WORKER_TRIGGER_SECRET = 'worker-secret'
  })

  it('rejects unauthenticated worker bridge requests', async () => {
    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/internal/agent-ops/channel-launch', {
      method: 'POST',
      body: '{}',
    }) as never)

    expect(res.status).toBe(401)
    expect(mockStartAgentOpsRunFromChannelCommand).not.toHaveBeenCalled()
  })

  it('launches Agent Ops through the centralized channel launcher', async () => {
    mockStartAgentOpsRunFromChannelCommand.mockResolvedValue('Slack Agent Ops run started')

    const { POST } = await import('../route')
    const res = await POST(signedRequest({
      channelType: 'slack',
      channelLabel: 'Slack',
      surfaceId: 'C123',
      externalUserId: 'U123',
      rawCommandArg: 'qa https://preview.example.com',
      binding: {
        assistant_id: 'assistant-1',
        org_id: 'org-1',
        assistant_name: null,
      },
    }) as never)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      ok: true,
      report: 'Slack Agent Ops run started',
      reportChunks: ['Slack Agent Ops run started'],
    })
    expect(mockStartAgentOpsRunFromChannelCommand).toHaveBeenCalledWith({
      channelType: 'slack',
      channelLabel: 'Slack',
      surfaceId: 'C123',
      externalUserId: 'U123',
      command: expect.objectContaining({ workflowId: 'qa', target: 'https://preview.example.com' }),
      binding: {
        assistant_id: 'assistant-1',
        org_id: 'org-1',
        assistant_name: null,
      },
    })
  })

  it('runs first-party capability template channel commands without using Agent Ops workflow ids', async () => {
    const { POST } = await import('../route')
    const res = await POST(signedRequest({
      channelType: 'slack',
      channelLabel: 'Slack',
      surfaceId: 'C123',
      externalUserId: 'U123',
      rawCommandArg: 'whales watched wallet moved 2,100 ETH to Coinbase',
      binding: {
        assistant_id: 'assistant-1',
        org_id: 'org-1',
        assistant_name: null,
      },
    }) as never)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      report: expect.stringContaining('Template: Whale Watchtower'),
      reportChunks: expect.arrayContaining([
        expect.stringContaining('Template: Whale Watchtower'),
      ]),
    })
    expect(mockStartAgentOpsRunFromChannelCommand).not.toHaveBeenCalled()
  })

  it('returns centralized usage copy for invalid commands', async () => {
    const { POST } = await import('../route')
    const res = await POST(signedRequest({
      channelType: 'slack',
      channelLabel: 'Slack',
      surfaceId: 'C123',
      rawCommandArg: '',
      binding: {
        assistant_id: 'assistant-1',
      },
    }) as never)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      error: 'Invalid channel command',
      report: expect.stringContaining('Slack Agent Ops'),
    })
    expect(mockStartAgentOpsRunFromChannelCommand).not.toHaveBeenCalled()
  })

  it('rejects malformed JSON as a caller error', async () => {
    const rawBody = '{'
    const requestId = 'request-json'
    const timestamp = String(Date.now())
    const signature = crypto
      .createHmac('sha256', 'worker-secret')
      .update(`${requestId}:${timestamp}:${rawBody}`)
      .digest('hex')

    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost/api/internal/agent-ops/channel-launch', {
      method: 'POST',
      headers: {
        'x-lucid-request-id': requestId,
        'x-lucid-timestamp': timestamp,
        'x-lucid-signature': signature,
      },
      body: rawBody,
    }) as never)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON body' })
    expect(mockCaptureException).not.toHaveBeenCalled()
  })
})
