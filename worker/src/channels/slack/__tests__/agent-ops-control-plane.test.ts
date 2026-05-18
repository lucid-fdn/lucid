import crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  buildSlackAgentOpsControlPlaneAuthHeaders,
  launchSlackAgentOpsFromControlPlane,
  launchSlackAgentOpsMessagesFromControlPlane,
} from '../agent-ops-control-plane.js'

describe('buildSlackAgentOpsControlPlaneAuthHeaders', () => {
  it('signs the bridge body with the shared worker secret', () => {
    const headers = buildSlackAgentOpsControlPlaneAuthHeaders({
      body: '{"hello":"world"}',
      secret: 'worker-secret',
      requestId: 'request-1',
      timestampMs: 123,
    })

    expect(headers['x-lucid-request-id']).toBe('request-1')
    expect(headers['x-lucid-timestamp']).toBe('123')
    expect(headers['x-lucid-signature']).toBe(
      crypto
        .createHmac('sha256', 'worker-secret')
        .update('request-1:123:{"hello":"world"}')
        .digest('hex'),
    )
  })
})

describe('launchSlackAgentOpsFromControlPlane', () => {
  it('calls the centralized control-plane Agent Ops launcher', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, report: 'Slack Agent Ops run started' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const report = await launchSlackAgentOpsFromControlPlane(
      {
        surfaceId: 'C123',
        externalUserId: 'U123',
        rawCommandArg: 'qa https://preview.example.com',
        binding: {
          assistant_id: 'assistant-1',
          org_id: 'org-1',
        },
      },
      {
        controlPlaneUrl: 'https://lucid.foundation/',
        workerTriggerSecret: 'worker-secret',
        fetchImpl,
        requestId: 'request-1',
        timestampMs: 123,
      },
    )

    expect(report).toBe('Slack Agent Ops run started')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://lucid.foundation/api/internal/agent-ops/channel-launch',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          channelType: 'slack',
          channelLabel: 'Slack',
          surfaceId: 'C123',
          externalUserId: 'U123',
          rawCommandArg: 'qa https://preview.example.com',
          binding: {
            assistant_id: 'assistant-1',
            org_id: 'org-1',
          },
        }),
      }),
    )
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit
    expect(init.headers).toMatchObject({
      'content-type': 'application/json',
      'x-lucid-request-id': 'request-1',
      'x-lucid-timestamp': '123',
    })
  })

  it('returns setup guidance when bridge env is missing', async () => {
    const report = await launchSlackAgentOpsFromControlPlane(
      {
        surfaceId: 'C123',
        rawCommandArg: 'qa https://preview.example.com',
        binding: {
          assistant_id: 'assistant-1',
        },
      },
      {
        controlPlaneUrl: null,
        workerTriggerSecret: 'worker-secret',
      },
    )

    expect(report).toContain('LUCID_CONTROL_PLANE_URL')
  })

  it('returns channel chunks when the control plane provides them', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        ok: true,
        report: 'part one\n\npart two',
        reportChunks: ['part one', 'part two'],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const reports = await launchSlackAgentOpsMessagesFromControlPlane(
      {
        surfaceId: 'C123',
        rawCommandArg: 'whales wallet moved',
        binding: { assistant_id: 'assistant-1' },
      },
      {
        controlPlaneUrl: 'https://lucid.foundation/',
        workerTriggerSecret: 'worker-secret',
        fetchImpl,
      },
    )

    expect(reports).toEqual(['part one', 'part two'])
  })
})
