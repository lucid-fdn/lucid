import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleTeamsOutbound } from '../outbound-delivery.js'

describe('handleTeamsOutbound', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('falls back to inbound Teams conversation metadata when the channel has no fixed external_channel_id', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'teams-token',
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'activity-1' }), { status: 200 }),
      )

    const messageId = await handleTeamsOutbound({
      channel: {
        id: 'channel-1',
        external_channel_id: null,
        channel_config: null,
      },
      event: {
        inbound_event_id: 'inbound-1',
        message_text: 'hello from tenant default',
        reply_to_external_id: 'reply-1',
      },
      secrets: {
        app_id: 'teams-app-id',
        app_password: 'teams-secret',
      },
      loadInboundMessageData: vi.fn().mockResolvedValue({
        teams_conversation_id: 'conv-surface-default',
        teams_tenant_id: 'tenant-1',
        serviceUrl: 'https://smba.trafficmanager.net/teams',
      }),
    })

    expect(messageId).toBe('activity-1')
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://smba.trafficmanager.net/teams/v3/conversations/conv-surface-default/activities',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })
})
