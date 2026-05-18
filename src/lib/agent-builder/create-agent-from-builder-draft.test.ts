import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/csrf-client', () => ({
  getCSRFTokenFromCookie: () => 'csrf-token',
}))

const { createAgentFromBuilderDraft } = await import('./create-agent-from-builder-draft')

const blueprint = {
  version: '1.0' as const,
  project: { name: 'Ops' },
  items: [
    {
      kind: 'agent' as const,
      source: 'blank' as const,
      name: 'Ops Agent',
      spec: {
        kind: 'agent' as const,
        system_prompt: 'Run ops.',
      },
    },
  ],
}

describe('createAgentFromBuilderDraft', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns the created agent id for single-agent deployments', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        projectSlug: 'ops',
        primary: {
          kind: 'agent',
          assistantId: 'assistant-1',
        },
        assistants: ['assistant-1'],
      }),
    }))

    await expect(createAgentFromBuilderDraft({
      workspaceId: 'org-1',
      blueprint,
    })).resolves.toEqual({
      projectSlug: 'ops',
      agentId: 'assistant-1',
      crewId: null,
      assistantIds: ['assistant-1'],
      raw: expect.any(Object),
    })
  })

  it('returns crew id and assistant ids without treating team members as the primary agent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        project_slug: 'ops',
        primary: {
          kind: 'team',
          crewId: 'crew-1',
          assistantIds: ['assistant-1', 'assistant-2'],
        },
        assistants: ['assistant-1', 'assistant-2'],
        crews: ['crew-1'],
      }),
    }))

    await expect(createAgentFromBuilderDraft({
      workspaceId: 'org-1',
      blueprint,
    })).resolves.toEqual({
      projectSlug: 'ops',
      agentId: null,
      crewId: 'crew-1',
      assistantIds: ['assistant-1', 'assistant-2'],
      raw: expect.any(Object),
    })
  })
})
