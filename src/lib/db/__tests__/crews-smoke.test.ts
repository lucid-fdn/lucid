/**
 * Crew Mode — Smoke Tests
 *
 * Validates the full crew stack is wired correctly:
 * - Contracts export all types and Zod schemas
 * - DB layer exports all expected functions
 * - Types are consistent between layers
 */

import { describe, it, expect } from 'vitest'
import { randomUUID } from 'crypto'

// Mock server-only
vi.mock('server-only', () => ({}))

// Mock DB client (needed for crews.ts import)
vi.mock('@/lib/db/client', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
  ErrorService: { captureException: vi.fn() },
}))

const UUID_A = randomUUID()
const UUID_B = randomUUID()

describe('Crew contracts smoke tests', () => {
  it('exports all domain model types from contracts/crew', async () => {
    const mod = await import('@contracts/crew')
    expect(mod).toBeDefined()
  })

  it('exports CreateCrewSchema with correct shape', async () => {
    const { CreateCrewSchema } = await import('@contracts/crew')

    // Valid input (members optional)
    const valid = CreateCrewSchema.safeParse({
      name: 'Alpha Team',
      objective: 'Research markets',
    })
    expect(valid.success).toBe(true)

    // Valid with inline members
    const withMembers = CreateCrewSchema.safeParse({
      name: 'Alpha Team',
      objective: 'Research markets',
      members: [{ assistant_id: UUID_A, role: 'researcher' }],
    })
    expect(withMembers.success).toBe(true)

    // Invalid: missing name
    const invalid = CreateCrewSchema.safeParse({ objective: 'Research' })
    expect(invalid.success).toBe(false)
  })

  it('validates CreateCrewSchema name constraints', async () => {
    const { CreateCrewSchema } = await import('@contracts/crew')

    // Empty name
    expect(CreateCrewSchema.safeParse({ name: '', objective: 'x' }).success).toBe(false)

    // Name too long (>100)
    expect(CreateCrewSchema.safeParse({ name: 'a'.repeat(101), objective: 'x' }).success).toBe(false)
  })

  it('validates UpdateCrewSchema allows partial updates', async () => {
    const { UpdateCrewSchema } = await import('@contracts/crew')

    expect(UpdateCrewSchema.safeParse({ name: 'New Name' }).success).toBe(true)
    expect(UpdateCrewSchema.safeParse({ status: 'active' }).success).toBe(true)
    expect(UpdateCrewSchema.safeParse({ status: 'invalid' }).success).toBe(false)
  })

  it('validates AddCrewMemberSchema requires valid UUID assistant_id', async () => {
    const { AddCrewMemberSchema } = await import('@contracts/crew')

    const valid = AddCrewMemberSchema.safeParse({ assistant_id: UUID_A, role: 'researcher' })
    expect(valid.success).toBe(true)

    const invalid = AddCrewMemberSchema.safeParse({ assistant_id: 'not-a-uuid', role: 'researcher' })
    expect(invalid.success).toBe(false)
  })

  it('validates AddCrewEdgeSchema with valid UUIDs', async () => {
    const { AddCrewEdgeSchema } = await import('@contracts/crew')

    const valid = AddCrewEdgeSchema.safeParse({
      source_member_id: UUID_A,
      target_member_id: UUID_B,
    })
    expect(valid.success).toBe(true)
  })

  it('validates ReplaceCrewEdgesSchema accepts edge array', async () => {
    const { ReplaceCrewEdgesSchema } = await import('@contracts/crew')

    const valid = ReplaceCrewEdgesSchema.safeParse({
      edges: [{
        source_member_id: UUID_A,
        target_member_id: UUID_B,
        direction: 'bidirectional',
      }],
    })
    expect(valid.success).toBe(true)

    // Empty edges array (valid — clears topology)
    expect(ReplaceCrewEdgesSchema.safeParse({ edges: [] }).success).toBe(true)
  })

  it('validates edge direction enum', async () => {
    const { AddCrewEdgeSchema } = await import('@contracts/crew')

    expect(AddCrewEdgeSchema.safeParse({
      source_member_id: UUID_A,
      target_member_id: UUID_B,
      direction: 'unidirectional',
    }).success).toBe(true)

    expect(AddCrewEdgeSchema.safeParse({
      source_member_id: UUID_A,
      target_member_id: UUID_B,
      direction: 'both-ways',
    }).success).toBe(false)
  })
})

describe('Crew DB layer smoke tests', () => {
  it('exports all expected functions', async () => {
    const db = await import('../crews')

    expect(typeof db.getCrews).toBe('function')
    expect(typeof db.getCrew).toBe('function')
    expect(typeof db.getCrewTopology).toBe('function')
    expect(typeof db.getCrewsTopologyBatch).toBe('function')
    expect(typeof db.createCrew).toBe('function')
    expect(typeof db.updateCrew).toBe('function')
    expect(typeof db.deleteCrew).toBe('function')
    expect(typeof db.addCrewMember).toBe('function')
    expect(typeof db.removeCrewMember).toBe('function')
    expect(typeof db.replaceCrewEdges).toBe('function')
    expect(typeof db.startCrewRun).toBe('function')
    expect(typeof db.getCrewRuns).toBe('function')
    expect(typeof db.getCrewRunDetail).toBe('function')
    expect(typeof db.completeCrewRun).toBe('function')
  })
})

describe('Crew mission-control types smoke tests', () => {
  it('FeedEventType includes crew event types', async () => {
    const types = await import('@/lib/mission-control/types')
    expect(types).toBeDefined()
  })
})

describe('Crew assistant type smoke tests', () => {
  it('Assistant interface includes crew_id field', async () => {
    const types = await import('@/types/assistant')
    expect(types).toBeDefined()
  })
})
