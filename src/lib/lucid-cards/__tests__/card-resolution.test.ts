import { describe, expect, it } from 'vitest'
import type { AgentCard } from '@contracts/lucid-card'
import type { ResolvedSharedContext } from '@contracts/shared-context'
import { resolveLucidCards } from '../card-resolution'

const card: AgentCard = {
  schema_version: '1.0',
  kind: 'agent_card',
  metadata: { source: 'lucid' },
  profile: { name: 'Agent', bio: [], lore: [], adjectives: [], topics: [] },
  voice: { allowed_phrases: ['forbidden'], banned_phrases: [] },
  style: { all: [], chat: [], post: [] },
  examples: { message_examples: [], post_examples: [] },
  guardrails: { always: [], never: ['do not fabricate'], escalation_rules: [] },
  knowledge: { snippets: [], source_refs: [] },
  policies: {},
  modes: [],
}

const context: ResolvedSharedContext = {
  workspace_id: '00000000-0000-0000-0000-000000000001',
  project_id: '00000000-0000-0000-0000-000000000002',
  team_id: null,
  agent_id: '00000000-0000-0000-0000-000000000003',
  user_id: null,
  generated_at: new Date(0).toISOString(),
  scopes: [],
  records: [{
    id: '00000000-0000-0000-0000-000000000004',
    workspace_id: '00000000-0000-0000-0000-000000000001',
    project_id: null,
    agent_id: null,
    scope_type: 'workspace',
    scope_id: '00000000-0000-0000-0000-000000000001',
    record_type: 'policy',
    title: 'Voice',
    body: 'Policy',
    source_type: null,
    source_id: null,
    confidence: null,
    status: 'active',
    valid_from: null,
    valid_until: null,
    metadata: { banned_phrases: ['forbidden'], policy: { approvals: true } },
    links: [],
    created_by: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    superseded_by_record_id: null,
  }],
  inherited_policy: { approvals: true },
  policy_sources: [{ record_id: '00000000-0000-0000-0000-000000000004', scope_type: 'workspace', scope_id: '00000000-0000-0000-0000-000000000001', title: 'Voice', keys: ['approvals'], overrides: [] }],
  policy_conflicts: [],
  prompt_sections: ['## Operating Policy\n- [workspace] Voice: Policy'],
}

describe('Lucid Card resolution', () => {
  it('reconstructs inherited organization cards and conflicts', () => {
    const resolution = resolveLucidCards({ agentCard: card, sharedContext: context })
    expect(resolution.organization_card?.voice.banned_phrases).toEqual(['forbidden'])
    expect(resolution.conflicts[0]?.winner).toBe('organization')
    expect(resolution.prompt_sections.join('\n')).toContain('## Persona')
  })
})
