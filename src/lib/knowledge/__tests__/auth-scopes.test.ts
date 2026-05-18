import { describe, expect, it } from 'vitest'

import {
  bindExternalKnowledgeInput,
  getKnowledgeAuthScopesForOperation,
  hasKnowledgeAuthScopes,
  normalizeKnowledgeOperationId,
} from '../auth-scopes'
import { redactExternalKnowledgeToken } from '../token-issuer'
import type { ExternalKnowledgeClient } from '@contracts/knowledge-auth'

const client: ExternalKnowledgeClient = {
  schemaVersion: '2026-05-07.external-knowledge-client.v1',
  id: '11111111-1111-4111-8111-111111111111',
  clientId: '11111111-1111-4111-8111-111111111111',
  orgId: '22222222-2222-4222-8222-222222222222',
  projectId: '33333333-3333-4333-8333-333333333333',
  teamId: null,
  name: 'Local agent',
  scopes: ['knowledge:read', 'knowledge:claims'],
  status: 'active',
  expiresAt: null,
  lastUsedAt: null,
  metadata: {},
  createdAt: '2026-05-07T00:00:00.000Z',
  updatedAt: '2026-05-07T00:00:00.000Z',
}

describe('external Knowledge auth scopes', () => {
  it('maps operation aliases and dynamic claim persistence scopes', () => {
    expect(normalizeKnowledgeOperationId('knowledge.create_claim')).toBe('knowledge.claims.create')
    expect(getKnowledgeAuthScopesForOperation('knowledge.think')).toEqual(['knowledge:read'])
    expect(getKnowledgeAuthScopesForOperation('knowledge.think', {
      org_id: client.orgId,
      query: 'remember this?',
      persist_claim: true,
    })).toEqual(['knowledge:read', 'knowledge:claims'])
  })

  it('enforces project binding before operation execution', () => {
    expect(bindExternalKnowledgeInput(client, { query: 'hello' })).toEqual({
      ok: true,
      input: {
        org_id: client.orgId,
        project_id: client.projectId,
        query: 'hello',
      },
    })
    expect(bindExternalKnowledgeInput(client, {
      project_id: '44444444-4444-4444-8444-444444444444',
      query: 'hello',
    })).toEqual({
      ok: false,
      error: 'External client is scoped to a different project',
    })
  })

  it('keeps scope checks and token display safe', () => {
    expect(hasKnowledgeAuthScopes(client.scopes, ['knowledge:read'])).toBe(true)
    expect(hasKnowledgeAuthScopes(client.scopes, ['knowledge:governance'])).toBe(false)
    expect(redactExternalKnowledgeToken('lkc_abcdefghijklmnopqrstuvwxyz1234567890')).toBe('lkc_abc...7890')
  })
})
