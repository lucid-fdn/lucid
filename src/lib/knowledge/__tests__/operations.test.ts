import { describe, expect, it } from 'vitest'

import {
  getKnowledgeOperation,
  listKnowledgeOperations,
  toAgentOpsActionDefinitions,
  toMcpToolDefinitions,
  toWorkerToolDefinitions,
  validateKnowledgeOperationInput,
} from '../operations'

describe('knowledge operations contract', () => {
  it('exposes stable operation metadata for API, worker, MCP, and Agent Ops surfaces', () => {
    const operations = listKnowledgeOperations()

    expect(operations.length).toBeGreaterThan(8)
    expect(getKnowledgeOperation('knowledge.retrieve_context')?.requiresRole).toBe('member')
    expect(getKnowledgeOperation('knowledge.write_project')?.requiresRole).toBe('admin')
    expect(getKnowledgeOperation('knowledge.think')?.requiresRole).toBe('member')
    expect(getKnowledgeOperation('knowledge.claims.create')?.requiresRole).toBe('admin')
    expect(getKnowledgeOperation('knowledge.imports.create')?.requiresRole).toBe('admin')
    expect(getKnowledgeOperation('knowledge.imports.preview')?.requiresRole).toBe('admin')
    expect(getKnowledgeOperation('knowledge.imports.commit')?.requiresRole).toBe('admin')
    expect(toMcpToolDefinitions().map((tool) => tool.name)).toContain('lucid_knowledge_retrieve_context')
    expect(toMcpToolDefinitions().map((tool) => tool.name)).toContain('lucid_knowledge_think')
    expect(toWorkerToolDefinitions().find((tool) => tool.id === 'knowledge.retrieve_context')?.safeForHotPath).toBe(true)
    expect(toAgentOpsActionDefinitions().map((action) => action.action)).toContain('knowledge.promote_to_project')
    expect(toAgentOpsActionDefinitions().map((action) => action.action)).toContain('knowledge.claims.create')
  })

  it('validates operation inputs at the contract boundary', () => {
    const input = validateKnowledgeOperationInput('knowledge.write_project', {
      org_id: '22222222-2222-4222-8222-222222222222',
      project_id: '33333333-3333-4333-8333-333333333333',
      subject: 'Release policy',
      compiled_truth: 'Release requires QA and canary evidence.',
      event_type: 'corrected',
    })

    expect(input.event_type).toBe('corrected')
    expect(() => validateKnowledgeOperationInput('knowledge.write_project', {
      org_id: 'not-a-uuid',
      project_id: '33333333-3333-4333-8333-333333333333',
      subject: 'Release policy',
      compiled_truth: 'Release requires QA and canary evidence.',
    })).toThrow()
  })

  it('validates claims and imports as first-class shared Knowledge operations', () => {
    const claimInput = validateKnowledgeOperationInput('knowledge.claims.create', {
      org_id: '22222222-2222-4222-8222-222222222222',
      project_id: '33333333-3333-4333-8333-333333333333',
      subject: 'Launch bar',
      claim: 'Launch requires QA evidence and a named owner.',
      confidence: 0.82,
      weight: 0.7,
    })
    const importInput = validateKnowledgeOperationInput('knowledge.imports.create', {
      org_id: '22222222-2222-4222-8222-222222222222',
      source_type: 'codex_session',
      mode: 'preview',
    })
    const importPreviewInput = validateKnowledgeOperationInput('knowledge.imports.preview', {
      org_id: '22222222-2222-4222-8222-222222222222',
      import_job_id: '44444444-4444-4444-8444-444444444444',
      raw_text: 'Customer prefers weekly proof summaries.',
    })
    const importCommitInput = validateKnowledgeOperationInput('knowledge.imports.commit', {
      org_id: '22222222-2222-4222-8222-222222222222',
      import_job_id: '44444444-4444-4444-8444-444444444444',
    })

    expect(claimInput.claim_type).toBe('claim')
    expect(claimInput.holder_type).toBe('agent')
    expect(importInput.status).toBe('queued')
    expect(importPreviewInput.raw_text).toContain('weekly proof')
    expect(importCommitInput.target).toBe('claims')
    expect(() => validateKnowledgeOperationInput('knowledge.claims.create', {
      org_id: '22222222-2222-4222-8222-222222222222',
      subject: '',
      claim: 'Missing subject should fail.',
    })).toThrow()
  })
})
