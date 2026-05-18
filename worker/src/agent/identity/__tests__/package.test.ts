import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAgentIdentityPromptSections, loadSharedContextPromptSections } from '../package.js'

class MockQuery {
  constructor(private readonly payload: { data: unknown[]; error: unknown }) {}
  select() { return this }
  eq() { return this }
  is() { return this }
  order() { return this }
  limit() { return this }
  then(resolve: (value: { data: unknown[]; error: unknown }) => unknown) {
    return Promise.resolve(resolve(this.payload))
  }
}

function mockSupabase() {
  return {
    from(table: string) {
      if (table === 'agent_identity_documents') {
        return new MockQuery({
          data: [
            {
              document_type: 'SOUL',
              status: 'active',
              version: 2,
              content: {
                source: 'agent_card',
                summary: 'Name: Native Lucid Agent\n- Style: concise',
                profile: { name: 'Native Lucid Agent' },
              },
            },
            {
              document_type: 'ACCESS_POLICY',
              status: 'active',
              version: 2,
              content: {
                source: 'agent_card',
                summary: '- Never: invent verification evidence',
                guardrails: { never: ['invent verification evidence'] },
              },
            },
          ],
          error: null,
        })
      }
      if (table === 'crew_members') {
        return new MockQuery({ data: [], error: null })
      }
      if (table === 'shared_context_records') {
        return new MockQuery({
          data: [
            {
              scope_type: 'workspace',
              scope_id: 'workspace-1',
              record_type: 'policy',
              title: 'Organization Card policy',
              body: 'Use approvals for risky actions.',
              confidence: 0.9,
              status: 'active',
              valid_from: null,
              valid_until: null,
              metadata: { policy: { approvals: true } },
              created_at: new Date(0).toISOString(),
            },
            {
              scope_type: 'project',
              scope_id: 'project-1',
              record_type: 'risk',
              title: 'Project Card risk',
              body: 'Do not ship without smoke coverage.',
              confidence: 0.8,
              status: 'active',
              valid_from: null,
              valid_until: null,
              metadata: {},
              created_at: new Date(1).toISOString(),
            },
          ],
          error: null,
        })
      }
      return new MockQuery({ data: [], error: null })
    },
  } as unknown as SupabaseClient
}

describe('worker identity prompt package', () => {
  it('renders Agent Card identity docs as summaries instead of raw JSON', async () => {
    const sections = await loadAgentIdentityPromptSections(mockSupabase(), 'agent-1')
    const prompt = sections.join('\n\n')
    expect(prompt).toContain('## SOUL')
    expect(prompt).toContain('Name: Native Lucid Agent')
    expect(prompt).toContain('## ACCESS_POLICY')
    expect(prompt).toContain('Never: invent verification evidence')
    expect(prompt).not.toContain('"profile"')
    expect(prompt).not.toContain('"guardrails"')
  })

  it('keeps Organization and Project Card context in shared operating context sections', async () => {
    const sections = await loadSharedContextPromptSections(mockSupabase(), {
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      agentId: 'agent-1',
      userId: null,
    })
    const prompt = sections.join('\n\n')
    expect(prompt).toContain('## MERGED_OPERATING_POLICY')
    expect(prompt).toContain('"approvals": true')
    expect(prompt).toContain('## Risks')
    expect(prompt).toContain('[project] Project Card risk')
  })
})
