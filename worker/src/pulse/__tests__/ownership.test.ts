import { beforeEach, describe, expect, it, vi } from 'vitest'

import { claimOrReclaimPulseEvent } from '../ownership.js'

function createSupabase(updateResult: { data: unknown; error: unknown }) {
  const select = vi.fn().mockResolvedValue(updateResult)
  const eq3 = vi.fn().mockReturnValue({ select })
  const eq2 = vi.fn().mockReturnValue({ eq: eq3, select })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2, select })
  const update = vi.fn().mockReturnValue({ eq: eq1, select })
  const from = vi.fn().mockReturnValue({ update })

  return {
    from,
    __update: update,
    __eq1: eq1,
    __eq2: eq2,
    __eq3: eq3,
    __select: select,
  } as any
}

describe('claimOrReclaimPulseEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('claims pending events for the current owner', async () => {
    const supabase = createSupabase({ data: [{ id: 'event-1' }], error: null })
    const event = { id: 'event-1', status: 'pending', attempts: 0 }

    const result = await claimOrReclaimPulseEvent({
      supabase,
      table: 'assistant_inbound_events',
      logPrefix: '[pulse:test]',
      eventId: 'event-1',
      event,
      lockOwner: 'worker-1',
    })

    expect(result.proceed).toBe(true)
    expect(result.event.status).toBe('processing')
    expect(result.event.locked_by).toBe('worker-1')
    expect(result.event.attempts).toBe(1)
  })

  it('reclaims legacy worker-local locks', async () => {
    const supabase = createSupabase({ data: [{ id: 'event-1' }], error: null })
    const event = { id: 'event-1', status: 'processing', locked_by: 'worker-local', attempts: 1 }

    const result = await claimOrReclaimPulseEvent({
      supabase,
      table: 'assistant_outbound_events',
      logPrefix: '[pulse:test]',
      eventId: 'event-1',
      event,
      lockOwner: 'pulse:run-1',
    })

    expect(result.proceed).toBe(true)
    expect(result.event.locked_by).toBe('pulse:run-1')
    expect(supabase.from).toHaveBeenCalledWith('assistant_outbound_events')
  })

  it('skips events owned by another non-legacy worker', async () => {
    const supabase = createSupabase({ data: [{ id: 'event-1' }], error: null })
    const event = { id: 'event-1', status: 'processing', locked_by: 'pulse:other-run', attempts: 1 }

    const result = await claimOrReclaimPulseEvent({
      supabase,
      table: 'assistant_inbound_events',
      logPrefix: '[pulse:test]',
      eventId: 'event-1',
      event,
      lockOwner: 'pulse:this-run',
    })

    expect(result.proceed).toBe(false)
    expect(supabase.__update).not.toHaveBeenCalled()
  })
})
