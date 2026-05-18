/**
 * Field Mapping — Unit tests for buildStatusMap, buildPriorityMap,
 * and isTerminalStatus.
 */

import { describe, it, expect } from 'vitest'
import {
  buildStatusMap,
  buildPriorityMap,
  isTerminalStatus,
  WORK_ITEM_STATUSES,
  WORK_ITEM_PRIORITIES,
} from '../field-mapping'

describe('WORK_ITEM_STATUSES / PRIORITIES', () => {
  it('enumerates every HumanWorkItemLite status/priority', () => {
    expect(WORK_ITEM_STATUSES).toHaveLength(6)
    expect(WORK_ITEM_PRIORITIES).toHaveLength(4)
  })
})

describe('buildStatusMap', () => {
  const linearMap = {
    open: 'Backlog',
    in_progress: 'In Progress',
    waiting: 'Waiting',
    done: 'Done',
    cancelled: 'Canceled',
    rejected: 'Canceled', // intentional collision — "open" variant wins
  } as const

  const { toExternal, fromExternal } = buildStatusMap(linearMap, 'Backlog', 'open')

  it('maps internal → external for each status', () => {
    expect(toExternal('open')).toBe('Backlog')
    expect(toExternal('done')).toBe('Done')
  })

  it('maps external → internal', () => {
    expect(fromExternal('Backlog')).toBe('open')
    expect(fromExternal('In Progress')).toBe('in_progress')
    expect(fromExternal('Done')).toBe('done')
  })

  it('first internal status wins on external collision', () => {
    // Both `cancelled` and `rejected` map to 'Canceled'; `cancelled` enumerates first.
    expect(fromExternal('Canceled')).toBe('cancelled')
  })

  it('falls back to default on unknown external value', () => {
    expect(fromExternal('Unknown')).toBe('open')
    expect(fromExternal(null)).toBe('open')
    expect(fromExternal(undefined)).toBe('open')
  })
})

describe('buildPriorityMap', () => {
  const linearPriorityMap = {
    critical: 1,
    high: 2,
    normal: 3,
    low: 4,
  } as const

  const { toExternal, fromExternal } = buildPriorityMap(linearPriorityMap, 0)

  it('maps in both directions', () => {
    expect(toExternal('critical')).toBe(1)
    expect(fromExternal(2)).toBe('high')
  })

  it('falls back to normal on unknown external', () => {
    expect(fromExternal(99)).toBe('normal')
    expect(fromExternal(null)).toBe('normal')
  })
})

describe('isTerminalStatus', () => {
  it('returns true for done/cancelled/rejected', () => {
    expect(isTerminalStatus('done')).toBe(true)
    expect(isTerminalStatus('cancelled')).toBe(true)
    expect(isTerminalStatus('rejected')).toBe(true)
  })

  it('returns false for open/in_progress/waiting', () => {
    expect(isTerminalStatus('open')).toBe(false)
    expect(isTerminalStatus('in_progress')).toBe(false)
    expect(isTerminalStatus('waiting')).toBe(false)
  })
})
