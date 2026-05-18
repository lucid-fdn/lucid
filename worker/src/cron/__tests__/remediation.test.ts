import { beforeEach, describe, expect, it, vi } from 'vitest'

import { repairRecentQueuedReplyGaps } from '../remediation.js'

const mockRepairCompletedInboundDelivery = vi.fn()

vi.mock('../../processors/inbound.js', () => ({
  repairCompletedInboundDelivery: (...args: unknown[]) => mockRepairCompletedInboundDelivery(...args),
}))

function createSupabaseMock() {
  return {
    from(table: string) {
      if (table === 'assistant_inbound_events') {
        const query = {
          select: () => query,
          eq: () => query,
          not: () => query,
          gte: () => query,
          order: () => query,
          limit: async () => ({
            data: [
              { id: 'inbound-slack-missing', channel_id: 'channel-slack', processed_at: '2026-04-24T15:00:00Z' },
              { id: 'inbound-discord-linked', channel_id: 'channel-discord', processed_at: '2026-04-24T15:01:00Z' },
              { id: 'inbound-telegram', channel_id: 'channel-telegram', processed_at: '2026-04-24T15:02:00Z' },
            ],
            error: null,
          }),
        }
        return query
      }

      if (table === 'assistant_channels') {
        return {
          select: () => ({
            in: async () => ({
              data: [
                { id: 'channel-slack', channel_type: 'slack' },
                { id: 'channel-discord', channel_type: 'discord' },
                { id: 'channel-telegram', channel_type: 'telegram' },
              ],
              error: null,
            }),
          }),
        }
      }

      if (table === 'assistant_outbound_events') {
        return {
          select: () => ({
            in: async () => ({
              data: [{ inbound_event_id: 'inbound-discord-linked' }],
              error: null,
            }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

describe('repairRecentQueuedReplyGaps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('repairs only recent completed Slack/Discord inbounds without outbound rows', async () => {
    mockRepairCompletedInboundDelivery.mockResolvedValueOnce(true)

    const repairedCount = await repairRecentQueuedReplyGaps(
      createSupabaseMock() as any,
      {
        MESSAGE_ENCRYPTION_MASTER_KEY: '',
      } as any,
    )

    expect(repairedCount).toBe(1)
    expect(mockRepairCompletedInboundDelivery).toHaveBeenCalledTimes(1)
    expect(mockRepairCompletedInboundDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'inbound-slack-missing',
        acceptedStatuses: ['done'],
      }),
    )
  })
})
