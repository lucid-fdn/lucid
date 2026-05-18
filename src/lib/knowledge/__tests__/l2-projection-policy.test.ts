import { describe, expect, it } from 'vitest'

import {
  buildRedactedKnowledgeL2Payload,
  hashKnowledgeL2Content,
  resolveKnowledgeL2ProjectionPolicy,
} from '../l2-projection-policy'
import { lucidL2VerifiableMemoryBackend } from '../backends'

describe('Knowledge L2 projection policy', () => {
  it('defaults private memory to commitment-only instead of public payload', () => {
    expect(resolveKnowledgeL2ProjectionPolicy({
      enabled: true,
      resourceType: 'assistant_memory',
      visibility: 'private',
      trustLevel: 'operator_approved',
      allowPublicPayload: true,
    })).toBe('commitment_only')
  })

  it('allows public payload only for high-trust federated org knowledge with explicit opt-in', () => {
    expect(resolveKnowledgeL2ProjectionPolicy({
      enabled: true,
      resourceType: 'org_brain',
      visibility: 'federated',
      trustLevel: 'system',
      federationPolicy: 'org_federated',
      allowPublicPayload: true,
    })).toBe('public_payload')
  })

  it('prefers encrypted payloads when available and disables ephemeral memory', () => {
    expect(resolveKnowledgeL2ProjectionPolicy({
      enabled: true,
      resourceType: 'project_brain',
      visibility: 'project',
      trustLevel: 'operator_approved',
      hasEncryptedPayload: true,
    })).toBe('encrypted_payload')

    expect(resolveKnowledgeL2ProjectionPolicy({
      enabled: true,
      resourceType: 'project_brain',
      visibility: 'project',
      trustLevel: 'operator_approved',
      retentionPolicy: 'ephemeral',
      hasEncryptedPayload: true,
    })).toBe('disabled')
  })

  it('builds stable commitments and redacted payloads without raw truth content', () => {
    const hashA = hashKnowledgeL2Content({ b: 2, a: 1 })
    const hashB = hashKnowledgeL2Content({ a: 1, b: 2 })
    const payload = buildRedactedKnowledgeL2Payload({
      resourceType: 'project_brain',
      subject: 'Pricing',
      eventSummary: 'Operator approved current pricing.',
      evidenceCount: 2,
      contentHash: hashA,
      source: {
        orgId: 'org-1',
        projectId: 'project-1',
        type: 'manual',
        label: 'Operator',
        visibility: 'project',
        trustLevel: 'operator_approved',
      },
    })

    expect(hashA).toBe(hashB)
    expect(JSON.stringify(payload)).not.toContain('raw')
    expect(payload).toMatchObject({
      resourceType: 'project_brain',
      subject: 'Pricing',
      evidenceCount: 2,
      contentHash: hashA,
    })
  })

  it('keeps Lucid-L2 out of normal hot prompt-packet recall by default', () => {
    expect(lucidL2VerifiableMemoryBackend.localFirst).toBe(false)
    expect(lucidL2VerifiableMemoryBackend.defaultForPromptPackets).toBe(false)
    expect(lucidL2VerifiableMemoryBackend.capabilities).toEqual(expect.arrayContaining(['verify', 'restore']))
  })
})
