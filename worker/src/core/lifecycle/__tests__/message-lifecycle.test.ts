import { describe, expect, it, vi } from 'vitest'

const markInboundDone = vi.fn().mockResolvedValue(undefined)
const markInboundFailed = vi.fn().mockResolvedValue(undefined)
const markOutboundSent = vi.fn().mockResolvedValue(undefined)
const markOutboundFailed = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../adapters/supabase.js', () => ({
  markInboundDone: (...args: unknown[]) => markInboundDone(...args),
  markInboundFailed: (...args: unknown[]) => markInboundFailed(...args),
  markOutboundSent: (...args: unknown[]) => markOutboundSent(...args),
  markOutboundFailed: (...args: unknown[]) => markOutboundFailed(...args),
}))

describe('message lifecycle', () => {
  it('routes inbound done through the shared lifecycle helper', async () => {
    const { markInboundStage } = await import('../message-lifecycle.js')
    await markInboundStage({
      supabase: {} as any,
      eventId: 'in-1',
      stage: 'done',
    })
    expect(markInboundDone).toHaveBeenCalledWith(expect.anything(), 'in-1')
  })

  it('routes outbound sent through the shared lifecycle helper', async () => {
    const { markOutboundStage } = await import('../message-lifecycle.js')
    await markOutboundStage({
      supabase: {} as any,
      eventId: 'out-1',
      stage: 'outbound_sent',
      externalMessageId: 'discord-1',
    })
    expect(markOutboundSent).toHaveBeenCalledWith(expect.anything(), 'out-1', 'discord-1')
  })
})
