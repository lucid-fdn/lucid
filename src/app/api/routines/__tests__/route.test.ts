import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  isUserOrgMember: vi.fn(),
  listRoutines: vi.fn(),
  createRoutine: vi.fn(),
  getRoutine: vi.fn(),
  updateRoutine: vi.fn(),
  cancelRoutine: vi.fn(),
  deleteRoutine: vi.fn(),
  simulateRoutine: vi.fn(),
  triggerRoutineNow: vi.fn(),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: mocks.getUserId,
}))

vi.mock('@/lib/db', () => ({
  isUserOrgMember: mocks.isUserOrgMember,
}))

vi.mock('@/lib/routines/service', () => ({
  listRoutines: mocks.listRoutines,
  createRoutine: mocks.createRoutine,
  getRoutine: mocks.getRoutine,
  updateRoutine: mocks.updateRoutine,
  cancelRoutine: mocks.cancelRoutine,
  deleteRoutine: mocks.deleteRoutine,
  simulateRoutine: mocks.simulateRoutine,
  triggerRoutineNow: mocks.triggerRoutineNow,
}))

vi.mock('@/lib/errors/error-service', () => ({
  ErrorService: { captureException: vi.fn() },
}))

import { GET, POST } from '../route'
import { PATCH } from '../[routineId]/route'
import { POST as SIMULATE } from '../simulate/route'
import { POST as RUN_NOW } from '../[routineId]/run-now/route'

const orgId = '22222222-2222-4222-8222-222222222222'
const userId = '44444444-4444-4444-8444-444444444444'
const routineId = '55555555-5555-4555-8555-555555555555'

function jsonRequest(url: string, body: Record<string, unknown>, method = 'POST') {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('/api/routines', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserId.mockResolvedValue(userId)
    mocks.isUserOrgMember.mockResolvedValue(true)
    mocks.listRoutines.mockResolvedValue([{ id: routineId, name: 'Daily check' }])
    mocks.createRoutine.mockResolvedValue({ id: routineId, name: 'Daily check' })
    mocks.getRoutine.mockResolvedValue({ id: routineId, name: 'Daily check' })
    mocks.updateRoutine.mockResolvedValue({ id: routineId, name: 'Updated check', target_type: 'knowledge' })
    mocks.cancelRoutine.mockResolvedValue(true)
    mocks.deleteRoutine.mockResolvedValue(true)
    mocks.simulateRoutine.mockResolvedValue({ valid: true, nextRuns: [], errors: [], warnings: [] })
    mocks.triggerRoutineNow.mockResolvedValue({ id: routineId, name: 'Daily check', next_run_at: new Date().toISOString() })
  })

  it('lists routines for an org member using canonical filters', async () => {
    const request = new NextRequest(`http://localhost:3000/api/routines?org_id=${orgId}&assistant_id=agent-1&target_type=assistant`)
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.routines).toHaveLength(1)
    expect(mocks.listRoutines).toHaveBeenCalledWith(expect.objectContaining({
      orgId,
      assistantId: 'agent-1',
      targetType: 'assistant',
    }))
  })

  it('creates routines through the canonical service', async () => {
    const payload = {
      org_id: orgId,
      assistant_id: '33333333-3333-4333-8333-333333333333',
      name: 'Daily check',
      task_prompt: 'Summarize blockers.',
      cron_expression: '0 9 * * 1-5',
    }
    const response = await POST(jsonRequest('http://localhost:3000/api/routines', payload))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.routine.id).toBe(routineId)
    expect(mocks.createRoutine).toHaveBeenCalledWith(payload, userId)
  })

  it('simulates routines without writing state', async () => {
    const payload = {
      org_id: orgId,
      assistant_id: '33333333-3333-4333-8333-333333333333',
      name: 'Daily check',
      task_prompt: 'Summarize blockers.',
      cron_expression: '0 9 * * 1-5',
    }
    const response = await SIMULATE(jsonRequest('http://localhost:3000/api/routines/simulate', payload))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.simulation.valid).toBe(true)
    expect(mocks.simulateRoutine).toHaveBeenCalledWith(payload)
  })

  it('queues a routine for immediate execution', async () => {
    const response = await RUN_NOW(
      jsonRequest(`http://localhost:3000/api/routines/${routineId}/run-now`, { org_id: orgId }),
      { params: Promise.resolve({ routineId }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.routine.id).toBe(routineId)
    expect(mocks.triggerRoutineNow).toHaveBeenCalledWith(routineId, orgId, userId)
  })

  it('updates routine trigger, target, runtime, and retry policy through the canonical service', async () => {
    const payload = {
      target_type: 'knowledge',
      trigger_kind: 'cron',
      cron_expression: '15 8 * * 1-5',
      timezone: 'Europe/Rome',
      concurrency_policy: 'queue_one',
      catch_up_policy: 'bounded',
      catch_up_limit: 3,
      max_retries: 5,
      runtime_selector: {
        engine: 'hermes',
        runtimeFlavor: 'dedicated',
        nativeScheduler: 'observe',
      },
    }
    const response = await PATCH(
      jsonRequest(`http://localhost:3000/api/routines/${routineId}?org_id=${orgId}`, payload, 'PATCH'),
      { params: Promise.resolve({ routineId }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.routine.name).toBe('Updated check')
    expect(mocks.updateRoutine).toHaveBeenCalledWith(routineId, orgId, payload, userId)
  })
})
