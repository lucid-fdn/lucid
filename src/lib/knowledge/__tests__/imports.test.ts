import { describe, expect, it } from 'vitest'

import {
  buildKnowledgeImportClaimInput,
  buildKnowledgeImportPreviewPlan,
  parseKnowledgeImportPayload,
  redactKnowledgeImportSecrets,
} from '../imports'
import type { KnowledgeImportItem, KnowledgeImportJob } from '@contracts/knowledge-imports'

describe('Knowledge imports', () => {
  it('parses raw text into bounded import items with stable keys', () => {
    const items = parseKnowledgeImportPayload({
      sourceType: 'meeting_notes',
      rawText: '### Launch notes\n\nQA must pass before release.\n\nCanary owner is Support.',
      metadata: { source: 'fixture' },
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      type: 'transcript',
      title: 'Launch notes',
      metadata: expect.objectContaining({ source: 'fixture' }),
    })
    expect(items[0]?.key).toMatch(/^item-1-/)
  })

  it('parses JSON and JSONL exports into import items before paragraph chunking', () => {
    const jsonItems = parseKnowledgeImportPayload({
      sourceType: 'codex_session',
      rawText: JSON.stringify({
        messages: [
          { role: 'user', content: 'Ship browser evidence drawer', createdAt: '2026-05-07T10:00:00Z' },
          { role: 'assistant', content: 'Implemented provenance-first drawer' },
        ],
      }),
    })
    const jsonlItems = parseKnowledgeImportPayload({
      sourceType: 'channel_transcript',
      rawText: [
        JSON.stringify({ speaker: 'Ops', text: 'Risk needs finance evidence', timestamp: '09:00' }),
        JSON.stringify({ speaker: 'Sales', text: 'Buyer requested weekly digest' }),
      ].join('\n'),
    })

    expect(jsonItems).toHaveLength(2)
    expect(jsonItems[0]).toMatchObject({
      type: 'agent_session',
      metadata: expect.objectContaining({ parser: 'json_records' }),
    })
    expect(jsonItems[0]?.content).toContain('user')
    expect(jsonlItems).toHaveLength(2)
    expect(jsonlItems[0]).toMatchObject({
      type: 'transcript',
      metadata: expect.objectContaining({ parser: 'jsonl_records' }),
    })
  })

  it('parses CSV and TSV exports into import items', () => {
    const csvItems = parseKnowledgeImportPayload({
      sourceType: 'channel_transcript',
      rawText: [
        'timestamp,speaker,title,message',
        '09:00,Ops,Risk Review,"Finance evidence must be attached, before launch."',
        '09:05,Sales,Buyer Note,Buyer asked for weekly digest.',
      ].join('\n'),
    })
    const tsvItems = parseKnowledgeImportPayload({
      sourceType: 'meeting_notes',
      rawText: [
        'time\tauthor\tsubject\tcontent',
        '10:00\tQA\tRelease\tCanary must remain enabled.',
      ].join('\n'),
    })

    expect(csvItems).toHaveLength(2)
    expect(csvItems[0]).toMatchObject({
      title: 'Risk Review',
      metadata: expect.objectContaining({ parser: 'csv_records' }),
    })
    expect(csvItems[0]?.content).toContain('09:00 Ops')
    expect(tsvItems).toHaveLength(1)
    expect(tsvItems[0]?.title).toBe('Release')
  })

  it('redacts common secrets before preview or commit content is stored', () => {
    const result = redactKnowledgeImportSecrets([
      'Authorization: Bearer sk-proj-this_should_never_be_visible_123456789',
      'stripe = sk_live_123456789012345678901234',
      'jwt = eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue123456',
      'api_key = "abcdef1234567890"',
      'Normal customer fact remains visible.',
    ].join('\n'))

    expect(result.content).toContain('[REDACTED_TOKEN]')
    expect(result.content).toContain('[REDACTED_STRIPE_KEY]')
    expect(result.content).toContain('[REDACTED_JWT]')
    expect(result.content).toContain('[REDACTED_SECRET]')
    expect(result.content).toContain('Normal customer fact remains visible.')
    expect(result.redactions.map((redaction) => redaction.type)).toEqual(
      expect.arrayContaining(['authorization_header', 'stripe_key', 'jwt', 'named_secret']),
    )
  })

  it('builds preview plans with payload dedupe and previous-import dedupe', () => {
    const parsed = parseKnowledgeImportPayload({
      sourceType: 'manual_upload',
      items: [
        { key: 'a', type: 'note', title: 'A', content: 'Same content', metadata: {} },
        { key: 'b', type: 'note', title: 'B', content: 'Same content', metadata: {} },
        { key: 'c', type: 'note', title: 'C', content: 'Existing content', metadata: {} },
      ],
    })
    const firstPlan = buildKnowledgeImportPreviewPlan({ sourceType: 'manual_upload', items: parsed })
    const existingHash = firstPlan.items.find((item) => item.itemKey === 'c')?.contentHash
    const plan = buildKnowledgeImportPreviewPlan({
      sourceType: 'manual_upload',
      items: parsed,
      existingContentHashes: new Set(existingHash ? [existingHash] : []),
    })

    expect(plan.previewItemCount).toBe(1)
    expect(plan.skippedItemCount).toBe(2)
    expect(plan.items.find((item) => item.itemKey === 'b')?.metadata.skipped_reason).toBe('duplicate_in_payload')
    expect(plan.items.find((item) => item.itemKey === 'c')?.metadata.skipped_reason).toBe('duplicate_in_previous_import')
  })

  it('maps committed import previews into evidence-backed claims without raw secrets', () => {
    const job: KnowledgeImportJob = {
      id: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      projectId: '33333333-3333-4333-8333-333333333333',
      teamId: null,
      sourceType: 'channel_transcript',
      mode: 'preview',
      status: 'preview_ready',
      itemCount: 1,
      redactionCount: 1,
      errorMessage: null,
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const item: KnowledgeImportItem = {
      id: '44444444-4444-4444-8444-444444444444',
      orgId: job.orgId,
      importJobId: job.id,
      itemKey: 'call-1',
      itemType: 'transcript',
      status: 'preview',
      contentHash: 'a'.repeat(64),
      title: 'Customer call',
      preview: 'Customer wants weekly launch proof. [REDACTED_TOKEN]',
      redactions: [{ type: 'authorization_header', label: 'Authorization bearer token' }],
      outputRefs: [],
      metadata: { redacted_content: 'Customer wants weekly launch proof. [REDACTED_TOKEN]' },
      createdAt: new Date().toISOString(),
    }

    const claim = buildKnowledgeImportClaimInput({
      job,
      item,
      actorUserId: '55555555-5555-4555-8555-555555555555',
    })

    expect(claim.projectId).toBe(job.projectId)
    expect(claim.holderType).toBe('source')
    expect(claim.evidence?.[0]?.kind).toBe('transcript')
    expect(claim.claim).toContain('[REDACTED_TOKEN]')
    expect(claim.metadata).toMatchObject({
      knowledge_import_job_id: job.id,
      knowledge_import_item_id: item.id,
      redaction_count: 1,
    })
  })
})
