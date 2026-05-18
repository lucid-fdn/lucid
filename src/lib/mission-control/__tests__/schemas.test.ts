import { describe, it, expect } from 'vitest'
import {
  controlRequestSchema,
  approvalActionSchema,
  feedQuerySchema,
  agentListQuerySchema,
} from '../schemas'

describe('controlRequestSchema', () => {
  it('validates correct input', () => {
    const input = {
      agent_id: '550e8400-e29b-41d4-a716-446655440000',
      action: 'pause',
    }
    const result = controlRequestSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('accepts optional fields', () => {
    const input = {
      agent_id: '550e8400-e29b-41d4-a716-446655440000',
      action: 'escalate',
      target_model: 'gpt-4o',
      run_id: 'run-123',
    }
    const result = controlRequestSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects missing agent_id', () => {
    const result = controlRequestSchema.safeParse({ action: 'pause' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid agent_id (non-UUID)', () => {
    const result = controlRequestSchema.safeParse({
      agent_id: 'not-a-uuid',
      action: 'pause',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid action', () => {
    const result = controlRequestSchema.safeParse({
      agent_id: '550e8400-e29b-41d4-a716-446655440000',
      action: 'destroy',
    })
    expect(result.success).toBe(false)
  })
})

describe('approvalActionSchema', () => {
  it('validates approve action', () => {
    const result = approvalActionSchema.safeParse({ action: 'approved' })
    expect(result.success).toBe(true)
  })

  it('validates deny action', () => {
    const result = approvalActionSchema.safeParse({ action: 'denied', reason: 'Too risky' })
    expect(result.success).toBe(true)
  })

  it('rejects invalid action', () => {
    const result = approvalActionSchema.safeParse({ action: 'maybe' })
    expect(result.success).toBe(false)
  })
})

describe('feedQuerySchema', () => {
  it('applies default limit of 50', () => {
    const result = feedQuerySchema.parse({})
    expect(result.limit).toBe(50)
  })

  it('accepts valid parameters', () => {
    const result = feedQuerySchema.parse({
      agent_id: '550e8400-e29b-41d4-a716-446655440000',
      event_type: 'channel_deactivated',
      severity: 'warning',
      limit: 10,
    })
    expect(result.limit).toBe(10)
    expect(result.event_type).toBe('channel_deactivated')
    expect(result.severity).toBe('warning')
  })

  it('rejects limit > 100', () => {
    const result = feedQuerySchema.safeParse({ limit: 200 })
    expect(result.success).toBe(false)
  })

  it('rejects limit < 1', () => {
    const result = feedQuerySchema.safeParse({ limit: 0 })
    expect(result.success).toBe(false)
  })
})

describe('agentListQuerySchema', () => {
  it('applies default sort_by=status and sort_order=desc', () => {
    const result = agentListQuerySchema.parse({})
    expect(result.sort_by).toBe('status')
    expect(result.sort_order).toBe('desc')
  })

  it('accepts valid status filter', () => {
    const result = agentListQuerySchema.parse({ status: 'active' })
    expect(result.status).toBe('active')
  })

  it('rejects invalid sort_by', () => {
    const result = agentListQuerySchema.safeParse({ sort_by: 'invalid' })
    expect(result.success).toBe(false)
  })
})
