import 'server-only'

import type { AgentIdentityDocument } from '@contracts/agent-identity'
import type { AgentCard, LucidCardImportPreview, LucidCardResolution } from '@contracts/lucid-card'
import { AssistantOrgMismatchError, getAssistant, updateAssistant } from '@/lib/db'
import { createAgentIdentityDocument, listAgentIdentityDocuments } from '@/lib/db/agent-identity'
import { createSharedContextRecord, resolveAgentSharedContext } from '@/lib/db/shared-context'
import { buildLucidCardExport, normalizeAgentCard } from '@/lib/lucid-cards/card-core'
import { parseNativeLucidAgentCardImport } from '@/lib/lucid-cards/card-import-core'
import { resolveLucidCards } from '@/lib/lucid-cards/card-resolution'
import { buildAgentCardDiff } from './agent-card-diff'
import { renderAgentCardIdentityDocuments } from './agent-card-renderer'
import { validateAgentCard } from './agent-card-validator'

interface AssistantLike {
  id: string
  org_id: string
  project_id?: string | null
  name?: string | null
  description?: string | null
  system_prompt?: string | null
}

export interface AgentCardApplyOptions {
  updateAssistantProfile?: boolean
  createKnowledgeSnippets?: boolean
  selectedMode?: string | null
}

function assistantFallback(assistant: AssistantLike) {
  return { name: assistant.name ?? 'Untitled Agent', description: assistant.description ?? null }
}

function latestActiveDocument(documents: AgentIdentityDocument[], type: AgentIdentityDocument['document_type']) {
  return documents
    .filter((doc) => doc.document_type === type && doc.status === 'active')
    .sort((a, b) => b.version - a.version)[0] ?? null
}

function reconstructAgentCardFromDocuments(assistant: AssistantLike, documents: AgentIdentityDocument[]): AgentCard {
  const soul = latestActiveDocument(documents, 'SOUL')
  const access = latestActiveDocument(documents, 'ACCESS_POLICY')
  const memory = latestActiveDocument(documents, 'MEMORY_POLICY')
  const tool = latestActiveDocument(documents, 'TOOL_POLICY')
  const current = latestActiveDocument(documents, 'CURRENT_CONTEXT')
  const soulContent = soul?.content ?? {}
  const activeMode = current?.content.active_mode

  return normalizeAgentCard({
    schema_version: '1.0',
    kind: 'agent_card',
    metadata: {
      source: 'lucid',
      version: soul?.version ?? 1,
      source_hash: typeof soulContent.card_hash === 'string' ? soulContent.card_hash : undefined,
    },
    profile: {
      ...(typeof soulContent.profile === 'object' && soulContent.profile ? soulContent.profile : {}),
      name: assistant.name ?? 'Untitled Agent',
      description: assistant.description ?? undefined,
    },
    voice: typeof soulContent.voice === 'object' && soulContent.voice ? soulContent.voice : {},
    style: typeof soulContent.style === 'object' && soulContent.style ? soulContent.style : {},
    examples: typeof soulContent.examples === 'object' && soulContent.examples ? soulContent.examples : {},
    modes: typeof activeMode === 'object' && activeMode ? [activeMode] : [],
    guardrails: typeof access?.content.guardrails === 'object' && access.content.guardrails ? access.content.guardrails : {},
    knowledge: typeof soulContent.knowledge === 'object' && soulContent.knowledge ? soulContent.knowledge : {},
    policies: {
      memory_policy: typeof memory?.content.policy === 'object' && memory.content.policy ? memory.content.policy : undefined,
      access_policy: typeof access?.content.policy === 'object' && access.content.policy ? access.content.policy : undefined,
      tool_policy: typeof tool?.content.policy === 'object' && tool.content.policy ? tool.content.policy : undefined,
    },
  }, assistantFallback(assistant))
}

export async function getAgentCardState(assistantId: string, userId?: string | null): Promise<{
  assistant: AssistantLike
  card: AgentCard
  documents: AgentIdentityDocument[]
  resolution: LucidCardResolution
}> {
  const assistant = await getAssistant(assistantId) as AssistantLike | null
  if (!assistant) throw new Error('Assistant not found')
  const documents = await listAgentIdentityDocuments(assistantId)
  const card = reconstructAgentCardFromDocuments(assistant, documents)
  const sharedContext = await resolveAgentSharedContext(assistantId, assistant.org_id, assistant.project_id ?? null, userId ?? null)
  const resolution = resolveLucidCards({ agentCard: card, sharedContext })
  return { assistant, card, documents, resolution }
}

export async function previewAgentCardImport(input: {
  assistantId: string
  payload: unknown
  userId?: string | null
  options?: AgentCardApplyOptions
}): Promise<LucidCardImportPreview & { warnings: string[] }> {
  const state = await getAgentCardState(input.assistantId, input.userId)
  const parsed = parseNativeLucidAgentCardImport(input.payload, assistantFallback(state.assistant))
  const validation = validateAgentCard(parsed.card)
  const sharedContext = await resolveAgentSharedContext(input.assistantId, state.assistant.org_id, state.assistant.project_id ?? null, input.userId ?? null)
  const resolution = resolveLucidCards({ agentCard: parsed.card, sharedContext })
  const diff = buildAgentCardDiff({
    assistant: state.assistant,
    documents: state.documents,
    card: parsed.card,
    validation,
    createKnowledgeSnippets: input.options?.createKnowledgeSnippets,
  })
  return { card: parsed.card, validation, resolution, diff, can_apply: validation.status !== 'fail', warnings: parsed.warnings }
}

export async function applyAgentCardImport(input: {
  assistantId: string
  payload: unknown
  userId?: string | null
  options?: AgentCardApplyOptions
}): Promise<LucidCardImportPreview & { applied: boolean; warnings: string[] }> {
  const preview = await previewAgentCardImport(input)
  if (!preview.can_apply) return { ...preview, applied: false }

  const state = await getAgentCardState(input.assistantId, input.userId)
  const options = input.options ?? {}
  if (options.updateAssistantProfile !== false) {
    const profileUpdate = {
      name: preview.card.profile.name,
      description: preview.card.profile.description ?? null,
    }
    try {
      await updateAssistant(input.assistantId, profileUpdate, state.assistant.org_id)
    } catch (error) {
      if (!(error instanceof AssistantOrgMismatchError)) throw error
      await updateAssistant(input.assistantId, profileUpdate)
    }
  }

  for (const draft of renderAgentCardIdentityDocuments(preview.card, { selectedMode: options.selectedMode })) {
    const document = await createAgentIdentityDocument(input.assistantId, {
      document_type: draft.document_type,
      status: 'active',
      content: draft.content,
    }, input.userId)
    if (!document) throw new Error(`Failed to create ${draft.document_type} identity document`)
  }

  if (options.createKnowledgeSnippets) {
    await Promise.all(preview.card.knowledge.snippets.map((snippet, index) =>
      createSharedContextRecord(state.assistant.org_id, {
        project_id: state.assistant.project_id ?? null,
        agent_id: input.assistantId,
        scope_type: 'agent',
        scope_id: input.assistantId,
        record_type: 'memory',
        title: `Agent Card snippet ${index + 1}`,
        body: snippet,
        source_type: 'agent_card',
        source_id: preview.card.metadata.source_hash ?? null,
        confidence: 0.8,
        status: 'active',
        metadata: { agent_card_source: preview.card.metadata.source, snippet_index: index },
        links: [],
      }, input.userId),
    ))
  }

  return { ...preview, applied: true }
}

export async function validateAgentCardPayload(input: { assistantId: string; payload?: unknown; userId?: string | null }) {
  const state = await getAgentCardState(input.assistantId, input.userId)
  return validateAgentCard(input.payload ? normalizeAgentCard(input.payload, assistantFallback(state.assistant)) : state.card)
}

export async function exportAgentCard(input: { assistantId: string; userId?: string | null }) {
  const state = await getAgentCardState(input.assistantId, input.userId)
  return buildLucidCardExport(state.card, { includeHash: true })
}
