import type { CreateKnowledgeClaimInput, KnowledgeClaimEvidence } from '@contracts/knowledge-claims'
import type { KnowledgeImportItem, KnowledgeImportJob } from '@contracts/knowledge-imports'

export function buildKnowledgeImportClaimInput(input: {
  job: KnowledgeImportJob
  item: KnowledgeImportItem
  actorUserId: string | null
  metadata?: Record<string, unknown>
}): CreateKnowledgeClaimInput {
  const content = extractCommitContent(input.item)
  return {
    orgId: input.job.orgId,
    projectId: input.job.projectId ?? null,
    teamId: input.job.teamId ?? null,
    claimType: inferClaimType(input.item),
    subject: buildClaimSubject(input.item),
    claim: content,
    holderType: 'source',
    holderId: input.item.itemKey,
    confidence: 0.6,
    weight: 0.4,
    status: 'active',
    evidence: [buildImportEvidence(input.job, input.item)],
    metadata: {
      ...(input.metadata ?? {}),
      knowledge_import_job_id: input.job.id,
      knowledge_import_item_id: input.item.id,
      knowledge_import_item_key: input.item.itemKey,
      knowledge_import_source_type: input.job.sourceType,
      knowledge_import_item_type: input.item.itemType,
      redaction_count: input.item.redactions.length,
      import_target: 'claims',
    },
    createdByUserId: input.actorUserId,
  }
}

export function extractCommitContent(item: KnowledgeImportItem): string {
  const redactedContent = typeof item.metadata.redacted_content === 'string'
    ? item.metadata.redacted_content.trim()
    : ''
  const preview = item.preview?.trim() ?? ''
  return (redactedContent || preview || 'Imported Knowledge item').slice(0, 8_000)
}

function buildClaimSubject(item: KnowledgeImportItem): string {
  return (item.title?.trim() || item.itemKey).slice(0, 240)
}

function inferClaimType(item: KnowledgeImportItem): CreateKnowledgeClaimInput['claimType'] {
  if (item.itemType.includes('decision')) return 'decision'
  if (item.itemType.includes('risk')) return 'risk'
  if (item.itemType.includes('preference')) return 'preference'
  return 'claim'
}

function buildImportEvidence(job: KnowledgeImportJob, item: KnowledgeImportItem): KnowledgeClaimEvidence {
  return {
    kind: inferEvidenceKind(job),
    label: `${job.sourceType.replace(/_/g, ' ')}: ${item.title ?? item.itemKey}`,
  }
}

function inferEvidenceKind(job: KnowledgeImportJob): KnowledgeClaimEvidence['kind'] {
  if (job.sourceType === 'channel_transcript' || job.sourceType === 'meeting_notes') return 'transcript'
  if (job.sourceType === 'browser_artifact') return 'screenshot'
  if (job.sourceType === 'repo_docs' || job.sourceType === 'manual_upload') return 'file'
  return 'log'
}
