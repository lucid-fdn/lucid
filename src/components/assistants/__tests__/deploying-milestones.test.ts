/**
 * Deploying Canvas Node — Milestone Derivation Tests
 */

import { describe, it, expect } from 'vitest'
import type { L2DeployStatus } from '@/lib/mission-control/types'

type MilestoneState = 'pending' | 'active' | 'done' | 'error'
type Phase = 'deploying' | 'connecting' | 'creating' | 'failed'

interface Milestone {
  label: string
  state: MilestoneState
}

function deriveMilestones(phase: Phase, l2Status: L2DeployStatus | null | undefined): Milestone[] {
  const l2 = l2Status?.status ?? null

  if (l2 === 'failed' || phase === 'failed') {
    return [
      { label: 'Queued for deploy', state: 'done' },
      { label: l2Status?.error ? `Build failed: ${l2Status.error}` : 'Deploy failed', state: 'error' },
      { label: 'Creating agent', state: 'pending' },
    ]
  }

  if (phase === 'creating') {
    return [
      { label: 'Queued for deploy', state: 'done' },
      { label: 'Building container', state: 'done' },
      { label: 'Creating agent', state: 'active' },
    ]
  }

  if (phase === 'connecting') {
    return [
      { label: 'Queued for deploy', state: 'done' },
      { label: 'Building container', state: 'done' },
      { label: 'Creating agent', state: 'active' },
    ]
  }

  if (l2 === 'running') {
    return [
      { label: 'Queued for deploy', state: 'done' },
      { label: 'Building container', state: 'done' },
      { label: 'Creating agent', state: 'active' },
    ]
  }

  if (l2 === 'deploying') {
    return [
      { label: 'Queued for deploy', state: 'done' },
      { label: 'Building container', state: 'active' },
      { label: 'Creating agent', state: 'pending' },
    ]
  }

  return [
    { label: 'Queued for deploy', state: 'active' },
    { label: 'Building container', state: 'pending' },
    { label: 'Creating agent', state: 'pending' },
  ]
}

describe('deriveMilestones', () => {
  it('shows queued state before provider progress arrives', () => {
    const milestones = deriveMilestones('deploying', null)
    expect(milestones[0].state).toBe('active')
    expect(milestones[1].state).toBe('pending')
    expect(milestones[2].state).toBe('pending')
  })

  it('shows building when L2 says deploying', () => {
    const milestones = deriveMilestones('deploying', { status: 'deploying' })
    expect(milestones[0].state).toBe('done')
    expect(milestones[1].state).toBe('active')
    expect(milestones[2].state).toBe('pending')
  })

  it('shows ready-to-create when L2 says running but phase still deploying', () => {
    const milestones = deriveMilestones('deploying', { status: 'running' })
    expect(milestones[0].state).toBe('done')
    expect(milestones[1].state).toBe('done')
    expect(milestones[2].state).toBe('active')
  })

  it('shows connecting phase without extra visible steps', () => {
    const milestones = deriveMilestones('connecting', { status: 'running' })
    expect(milestones[0].state).toBe('done')
    expect(milestones[1].state).toBe('done')
    expect(milestones[2].state).toBe('active')
  })

  it('shows creating phase — all previous done', () => {
    const milestones = deriveMilestones('creating', { status: 'running' })
    expect(milestones[0].state).toBe('done')
    expect(milestones[1].state).toBe('done')
    expect(milestones[2].state).toBe('active')
  })

  it('shows error on L2 failure', () => {
    const milestones = deriveMilestones('deploying', { status: 'failed', error: 'Build timeout' })
    expect(milestones[0].state).toBe('done')
    expect(milestones[1].state).toBe('error')
    expect(milestones[1].label).toBe('Build failed: Build timeout')
  })

  it('shows generic error when phase is failed but no L2 error', () => {
    const milestones = deriveMilestones('failed', null)
    expect(milestones[1].state).toBe('error')
    expect(milestones[1].label).toBe('Deploy failed')
  })

  it('always returns 3 milestones', () => {
    const cases: [Phase, L2DeployStatus | null][] = [
      ['deploying', null],
      ['deploying', { status: 'deploying' }],
      ['deploying', { status: 'running' }],
      ['connecting', null],
      ['connecting', { status: 'running' }],
      ['creating', null],
      ['failed', null],
      ['failed', { status: 'failed', error: 'boom' }],
    ]
    for (const [phase, l2] of cases) {
      expect(deriveMilestones(phase, l2)).toHaveLength(3)
    }
  })
})

describe('Railway deploy scenarios', () => {
  it('simulates the simplified lifecycle', () => {
    let m = deriveMilestones('deploying', null)
    expect(m.map((x) => x.state)).toEqual(['active', 'pending', 'pending'])

    m = deriveMilestones('deploying', { status: 'deploying' })
    expect(m.map((x) => x.state)).toEqual(['done', 'active', 'pending'])

    m = deriveMilestones('deploying', { status: 'running' })
    expect(m.map((x) => x.state)).toEqual(['done', 'done', 'active'])

    m = deriveMilestones('connecting', { status: 'running' })
    expect(m.map((x) => x.state)).toEqual(['done', 'done', 'active'])

    m = deriveMilestones('creating', { status: 'running' })
    expect(m.map((x) => x.state)).toEqual(['done', 'done', 'active'])
  })
})
