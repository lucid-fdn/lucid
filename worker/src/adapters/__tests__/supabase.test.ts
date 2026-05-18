import { describe, expect, it, vi } from 'vitest'

import { markOutboundSent } from '../supabase.js'

describe('markOutboundSent', () => {
  it('clears stale retry metadata after a successful send', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ update })
    const supabase = { from } as any

    await markOutboundSent(supabase, 'out-1', 'slack-1')

    expect(from).toHaveBeenCalledWith('assistant_outbound_events')
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'sent',
        external_message_id: 'slack-1',
        last_error: null,
        next_attempt_at: null,
        locked_at: null,
        locked_by: null,
        locked_until: null,
      }),
    )
    expect(eq).toHaveBeenCalledWith('id', 'out-1')
  })
})
