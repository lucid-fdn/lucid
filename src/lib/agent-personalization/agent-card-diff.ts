import type { AgentIdentityDocument } from '@contracts/agent-identity'
import type { AgentCard, LucidCardImportPreview, LucidCardValidationReport } from '@contracts/lucid-card'
import { hashLucidCard } from '@/lib/lucid-cards/card-core'
import { renderAgentCardIdentityDocuments } from './agent-card-renderer'

interface AssistantLike {
  name?: string | null
  description?: string | null
}

export function buildAgentCardDiff(input: {
  assistant: AssistantLike
  documents: AgentIdentityDocument[]
  card: AgentCard
  validation: LucidCardValidationReport
  createKnowledgeSnippets?: boolean
}): LucidCardImportPreview['diff'] {
  const assistant: LucidCardImportPreview['diff']['assistant'] = []
  if ((input.assistant.name ?? '') !== input.card.profile.name) {
    assistant.push({ field: 'name', before: input.assistant.name ?? null, after: input.card.profile.name })
  }
  if ((input.assistant.description ?? null) !== (input.card.profile.description ?? null)) {
    assistant.push({ field: 'description', before: input.assistant.description ?? null, after: input.card.profile.description ?? null })
  }

  const cardHash = hashLucidCard(input.card)
  const identity_documents = renderAgentCardIdentityDocuments(input.card).map((draft) => {
    const active = input.documents.find((doc) => doc.document_type === draft.document_type && doc.status === 'active')
    return {
      document_type: draft.document_type,
      action: active?.content.card_hash === cardHash ? 'update' as const : 'create' as const,
      summary: `${draft.document_type} ${active ? `v${active.version + 1}` : 'v1'}`,
    }
  })

  const shared_context_records = input.createKnowledgeSnippets
    ? input.card.knowledge.snippets.map((snippet, index) => ({
        record_type: 'memory',
        title: `Agent Card snippet ${index + 1}`,
        body: snippet,
      }))
    : []

  return { assistant, identity_documents, shared_context_records }
}
