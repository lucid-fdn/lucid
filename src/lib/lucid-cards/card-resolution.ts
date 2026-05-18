import type { AgentCard, LucidCardResolution, LucidCardResolutionConflict, OrganizationCard, ProjectCard } from '@contracts/lucid-card'
import type { ResolvedSharedContext, SharedContextRecord } from '@contracts/shared-context'
import { getAgentCardPromptChars, renderAgentCardIdentityDocuments } from '@/lib/agent-personalization/agent-card-renderer'

function linesFor(records: SharedContextRecord[], type: SharedContextRecord['record_type'], scope: SharedContextRecord['scope_type']): string[] {
  return records
    .filter((record) => record.record_type === type && record.scope_type === scope)
    .slice(0, 20)
    .map((record) => `${record.title}: ${record.body}`.trim())
}

function policyFor(context: ResolvedSharedContext, scope: SharedContextRecord['scope_type']): Record<string, unknown> {
  const sourceIds = new Set(context.policy_sources.filter((source) => source.scope_type === scope).map((source) => source.record_id))
  const policies = context.records
    .filter((record) => sourceIds.has(record.id))
    .map((record) => record.metadata.policy)
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value))
  return Object.assign({}, ...policies)
}

function sourceRefs(records: SharedContextRecord[], scope: SharedContextRecord['scope_type']) {
  return records
    .filter((record) => record.scope_type === scope)
    .flatMap((record) => record.links.map((link) => ({
      type: link.target_type === 'knowledge_page' || link.target_type === 'knowledge_source' ? link.target_type : 'memory' as const,
      label: link.label ?? record.title,
      ref: link.target_id,
      provenance: link.provenance ?? `${record.record_type} from ${record.scope_type}`,
    })))
    .slice(0, 24)
}

export function buildOrganizationCardFromSharedContext(context: ResolvedSharedContext): OrganizationCard | null {
  const records = context.records.filter((record) => record.scope_type === 'workspace')
  if (records.length === 0) return null
  const policy = policyFor(context, 'workspace')
  return {
    schema_version: '1.0',
    kind: 'organization_card',
    metadata: { source: 'lucid' },
    identity: {
      mission: linesFor(records, 'thesis', 'workspace').join('\n'),
      audience: [],
      positioning: linesFor(records, 'decision', 'workspace'),
    },
    voice: {
      brand_voice: records.filter((record) => record.record_type === 'policy').flatMap((record) => Array.isArray(record.metadata.brand_voice) ? record.metadata.brand_voice as string[] : []),
      default_style: records.filter((record) => record.record_type === 'policy').flatMap((record) => Array.isArray(record.metadata.default_style) ? record.metadata.default_style as string[] : []),
      banned_phrases: records.filter((record) => record.record_type === 'policy').flatMap((record) => Array.isArray(record.metadata.banned_phrases) ? record.metadata.banned_phrases as string[] : []),
    },
    policies: { compliance: policy, memory: policy, access: policy, tool: policy },
    knowledge: { source_refs: sourceRefs(records, 'workspace') },
  }
}

export function buildProjectCardFromSharedContext(context: ResolvedSharedContext): ProjectCard | null {
  const records = context.records.filter((record) => record.scope_type === 'project')
  if (records.length === 0) return null
  const policy = policyFor(context, 'project')
  return {
    schema_version: '1.0',
    kind: 'project_card',
    metadata: { source: 'lucid' },
    mission: {
      goal: linesFor(records, 'thesis', 'project').join('\n'),
      audience: [],
      outcomes: linesFor(records, 'decision', 'project'),
      active_constraints: linesFor(records, 'policy', 'project'),
    },
    domain: {
      facts: linesFor(records, 'memory', 'project'),
      risks: linesFor(records, 'risk', 'project'),
      open_questions: linesFor(records, 'open_question', 'project'),
    },
    voice_override: {
      style: records.filter((record) => record.record_type === 'policy').flatMap((record) => Array.isArray(record.metadata.style) ? record.metadata.style as string[] : []),
      banned_phrases: records.filter((record) => record.record_type === 'policy').flatMap((record) => Array.isArray(record.metadata.banned_phrases) ? record.metadata.banned_phrases as string[] : []),
    },
    policies: { memory: policy, access: policy, tool: policy },
    knowledge: { source_refs: sourceRefs(records, 'project') },
  }
}

function buildConflicts(context: ResolvedSharedContext, agentCard: AgentCard): LucidCardResolutionConflict[] {
  const policyConflicts = context.policy_conflicts.map((conflict) => ({
    key: conflict.key,
    winner: 'project' as const,
    overridden: conflict.scopes.filter((scope) => scope !== 'project').map((scope) => scope === 'workspace' ? 'organization' as const : scope),
    message: `Shared context policy "${conflict.key}" has an override in the resolved context.`,
  }))
  const banned = context.records
    .filter((record) => record.scope_type === 'workspace' && record.record_type === 'policy')
    .flatMap((record) => Array.isArray(record.metadata.banned_phrases) ? record.metadata.banned_phrases as string[] : [])
  const agentText = [...agentCard.style.all, ...agentCard.style.chat, ...agentCard.voice.allowed_phrases].join('\n').toLowerCase()
  const styleConflicts = banned
    .filter((phrase) => agentText.includes(phrase.toLowerCase()))
    .map((phrase) => ({
      key: `voice.banned_phrase.${phrase}`,
      winner: 'organization' as const,
      overridden: ['agent' as const],
      message: `Organization policy bans "${phrase}", overriding Agent Card style.`,
    }))
  return [...policyConflicts, ...styleConflicts]
}

export function resolveLucidCards(input: { agentCard: AgentCard; sharedContext: ResolvedSharedContext | null; promptCap?: number }): LucidCardResolution {
  const identitySections = renderAgentCardIdentityDocuments(input.agentCard).map((doc) => doc.promptSection).filter(Boolean)
  const contextSections = input.sharedContext?.prompt_sections ?? []
  const cap = input.promptCap ?? 32_000
  return {
    organization_card: input.sharedContext ? buildOrganizationCardFromSharedContext(input.sharedContext) : null,
    project_card: input.sharedContext ? buildProjectCardFromSharedContext(input.sharedContext) : null,
    team_context_summary: input.sharedContext ? {
      scopes: input.sharedContext.scopes.filter((scope) => scope.scope_type === 'team'),
      records: input.sharedContext.records.filter((record) => record.scope_type === 'team').length,
    } : null,
    agent_card: input.agentCard,
    user_preferences: input.sharedContext ? {
      records: input.sharedContext.records.filter((record) => record.scope_type === 'user').length,
    } : null,
    conflicts: input.sharedContext ? buildConflicts(input.sharedContext, input.agentCard) : [],
    prompt_sections: [...identitySections, ...contextSections],
    prompt_budget: {
      chars: getAgentCardPromptChars(input.agentCard) + contextSections.join('\n').length,
      cap,
    },
  }
}
