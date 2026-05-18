import type { AgentIdentityDocumentType } from '@contracts/agent-identity'
import type { AgentCard } from '@contracts/lucid-card'
import { hashLucidCard } from '@/lib/lucid-cards/card-core'

export interface RenderedAgentCardIdentityDocument {
  document_type: AgentIdentityDocumentType
  content: Record<string, unknown>
  promptSection: string
}

function section(title: string, rows: Array<string | undefined>): string {
  const body = rows.filter(Boolean).join('\n')
  return body ? `## ${title}\n${body}` : ''
}

function bullets(values: string[] | undefined): string | undefined {
  if (!values?.length) return undefined
  return values.map((value) => `- ${value}`).join('\n')
}

export function renderAgentCardIdentityDocuments(card: AgentCard, options: { selectedMode?: string | null } = {}): RenderedAgentCardIdentityDocument[] {
  const cardHash = hashLucidCard(card)
  const source = 'agent_card'
  const soulContent = {
    source,
    card_hash: cardHash,
    summary: section('Persona', [
      `Name: ${card.profile.name}`,
      card.profile.description ? `Description: ${card.profile.description}` : undefined,
      bullets(card.profile.bio),
      card.voice.summary ? `Voice: ${card.voice.summary}` : undefined,
      bullets(card.style.all?.map((item) => `Style: ${item}`)),
    ]).replace(/^## Persona\n/, ''),
    profile: card.profile,
    voice: card.voice,
    style: card.style,
    examples: card.examples,
    knowledge: card.knowledge,
  }
  const accessContent = {
    source,
    card_hash: cardHash,
    summary: section('Access And Guardrails', [
      bullets(card.guardrails.always?.map((item) => `Always: ${item}`)),
      bullets(card.guardrails.never?.map((item) => `Never: ${item}`)),
      card.guardrails.refusal_style ? `Refusal style: ${card.guardrails.refusal_style}` : undefined,
      bullets(card.guardrails.escalation_rules?.map((item) => `Escalate: ${item}`)),
    ]).replace(/^## Access And Guardrails\n/, ''),
    guardrails: card.guardrails,
    policy: card.policies.access_policy ?? {},
  }
  const memoryContent = {
    source,
    card_hash: cardHash,
    summary: section('Memory Policy', [
      bullets(card.knowledge.snippets),
      Object.keys(card.policies.memory_policy ?? {}).length ? `Policy: ${JSON.stringify(card.policies.memory_policy)}` : undefined,
    ]).replace(/^## Memory Policy\n/, ''),
    snippets: card.knowledge.snippets,
    source_refs: card.knowledge.source_refs,
    policy: card.policies.memory_policy ?? {},
  }
  const toolContent = {
    source,
    card_hash: cardHash,
    summary: Object.keys(card.policies.tool_policy ?? {}).length ? JSON.stringify(card.policies.tool_policy) : 'No tool policy overrides.',
    policy: card.policies.tool_policy ?? {},
  }
  const activeMode = options.selectedMode
    ? card.modes.find((mode) => mode.id === options.selectedMode || mode.name === options.selectedMode) ?? null
    : card.modes[0] ?? null

  const documents: RenderedAgentCardIdentityDocument[] = [
    {
      document_type: 'SOUL',
      content: soulContent,
      promptSection: section('Persona', [
        `Name: ${card.profile.name}`,
        card.profile.description ? `Description: ${card.profile.description}` : undefined,
        bullets(card.profile.bio),
        bullets(card.profile.lore),
        card.voice.summary ? `Voice: ${card.voice.summary}` : undefined,
        bullets(card.profile.adjectives?.map((item) => `Trait: ${item}`)),
        bullets(card.profile.topics?.map((item) => `Topic: ${item}`)),
        bullets(card.style.all?.map((item) => `Style: ${item}`)),
        bullets(card.style.chat?.map((item) => `Chat: ${item}`)),
      ]),
    },
    {
      document_type: 'ACCESS_POLICY',
      content: accessContent,
      promptSection: section('Access And Guardrails', [
        bullets(card.guardrails.always?.map((item) => `Always: ${item}`)),
        bullets(card.guardrails.never?.map((item) => `Never: ${item}`)),
        card.guardrails.refusal_style ? `Refusal style: ${card.guardrails.refusal_style}` : undefined,
        bullets(card.guardrails.escalation_rules?.map((item) => `Escalate: ${item}`)),
      ]),
    },
    {
      document_type: 'MEMORY_POLICY',
      content: memoryContent,
      promptSection: section('Memory Policy', [
        bullets(card.knowledge.snippets),
        Object.keys(card.policies.memory_policy ?? {}).length ? `Policy: ${JSON.stringify(card.policies.memory_policy)}` : undefined,
      ]),
    },
    {
      document_type: 'TOOL_POLICY',
      content: toolContent,
      promptSection: section('Tool Policy', [
        Object.keys(card.policies.tool_policy ?? {}).length ? JSON.stringify(card.policies.tool_policy) : undefined,
      ]),
    },
    {
      document_type: 'CURRENT_CONTEXT',
      content: { source, card_hash: cardHash, active_mode: activeMode },
      promptSection: section('Current Mode', [
        activeMode ? JSON.stringify(activeMode) : undefined,
      ]),
    },
  ]
  return documents.filter((doc) => doc.promptSection || Object.keys(doc.content).length > 0)
}

export function getAgentCardPromptChars(card: AgentCard): number {
  return renderAgentCardIdentityDocuments(card).reduce((sum, doc) => sum + doc.promptSection.length, 0)
}
