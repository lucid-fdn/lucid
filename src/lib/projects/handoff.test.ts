import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  buildProjectAgentsHandoffPath,
  consumeProjectCanvasHandoff,
  saveProjectCanvasHandoff,
} from './handoff'

describe('project canvas handoff helpers', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: vi.fn((key: string) => store.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          store.set(key, value)
        }),
        removeItem: vi.fn((key: string) => {
          store.delete(key)
        }),
      },
      dispatchEvent: vi.fn(),
    })
  })

  it('builds the canonical builder-to-agents canvas handoff route', () => {
    expect(buildProjectAgentsHandoffPath({
      workspaceSlug: 'acme',
      projectSlug: 'ops',
      agentId: 'agent-1',
    })).toBe('/acme/projects/ops/agents?view=canvas&agent=agent-1&focus=created')
  })

  it('keeps the agents route in canvas view when no agent id is available', () => {
    expect(buildProjectAgentsHandoffPath({
      workspaceSlug: 'acme',
      projectSlug: 'ops',
      agentId: null,
    })).toBe('/acme/projects/ops/agents?view=canvas')
  })

  it('builds the canonical builder-to-team canvas handoff route', () => {
    expect(buildProjectAgentsHandoffPath({
      workspaceSlug: 'acme',
      projectSlug: 'ops',
      crewId: 'crew-1',
    })).toBe('/acme/projects/ops/agents?view=canvas&team=crew-1&focus=created')
  })

  it('stores and consumes one-shot handoff state', () => {
    const state = {
      projectSlug: 'ops',
      agentId: 'agent-1',
      createdAt: 1_775_000_000_000,
    }

    saveProjectCanvasHandoff(state)

    expect(consumeProjectCanvasHandoff('ops', 'agent-1')).toEqual(state)
    expect(consumeProjectCanvasHandoff('ops', 'agent-1')).toBeNull()
  })

  it('stores and consumes one-shot team handoff state', () => {
    const state = {
      projectSlug: 'ops',
      crewId: 'crew-1',
      createdAt: 1_775_000_000_000,
    }

    saveProjectCanvasHandoff(state)

    expect(consumeProjectCanvasHandoff('ops', 'crew-1')).toEqual(state)
    expect(consumeProjectCanvasHandoff('ops', 'crew-1')).toBeNull()
  })
})
