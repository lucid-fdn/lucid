import type { TemplateCatalogEntry } from '@contracts/template'

import type { GenerationIntent, TemplateMatch } from '@/lib/ai/project-generation/schemas'
import { normalizeBuilderText } from '@/lib/ai/project-generation/normalization'
import type { RuntimeFeatureAccess } from '@/lib/access-control/types'

import type {
  AiBuilderTopologyIntent,
  BuilderTopology,
  BuilderTopologyDecision,
  BuilderTopologyRole,
} from './topology-schema'

const EXPLICIT_SINGLE_PATTERN = /\b(single agent|one agent|1 agent|solo agent|single assistant|one assistant|single operator|one operator|personal assistant|daily assistant|executive assistant|support agent|sales agent|research agent|monitor(?:ing)? agent|personal agent|daily agent|personal operator|daily operator|assistant|operator|bot)\b/i
const EXPLICIT_TEAM_PATTERN = /\b(team|crew|multi[-\s]?agent|multiple agents|several agents|subagents?|specialists?|coordinator|handoff|review loop|reviewer|approval flow|agent team)\b/i
const ROLE_SEPARATION_PATTERN = /\b(research(?:er|ing)?|writer|editor|publisher|analyst|reviewer|coordinator|planner|operator|qa|triage|executor)\b/i
const WORKFLOW_PATTERN = /\b(pipeline|workflow|handoff|approve|approval|review|coordinate|delegate|orchestrate|parallel|stages?|steps?)\b/i
const LOW_SPECIFICITY_PATTERN = /\b(run|manage|handle|grow|operate|scale)\b.{0,24}\b(growth|sales|marketing|ops|business|company)\b/i
const AMBIGUOUS_TOPOLOGY_CHOICE_PATTERN = /\b(?:agent|assistant|operator)\s+or\s+team\b|\bteam\s+or\s+(?:agent|assistant|operator)\b/i
const BROAD_COMPANY_SCOPE_PATTERN = /\b(?:everything|anything|all)\b.{0,48}\b(?:go[-\s]?to[-\s]?market|gtm|business|company|operations?|workflows?)\b|\bwhole company\b|\bmarketing\b.{0,24}\bsales\b.{0,24}\bsupport\b|\bsales\b.{0,24}\bmarketing\b.{0,24}\bsupport\b/i

export interface DecideBuilderTopologyInput {
  prompt: string
  preferredMode?: 'auto' | 'template' | 'agent' | 'team'
  selectedTemplate?: Pick<TemplateCatalogEntry, 'slug' | 'name' | 'kind'> | null
  templateMatches?: TemplateMatch[]
  intent: GenerationIntent
  previousDecision?: BuilderTopologyDecision | null
  userOverride?: 'single-agent' | 'team'
  planCapabilities?: RuntimeFeatureAccess | null
  llmIntent?: AiBuilderTopologyIntent | null
}

export function decideBuilderTopology(input: DecideBuilderTopologyInput): BuilderTopologyDecision {
  const prompt = input.prompt.trim()
  const normalized = normalizeBuilderText(prompt).toLowerCase()

  if (input.userOverride) {
    return decision({
      topology: input.userOverride,
      confidence: 1,
      source: 'user-override',
      rationale: `The user explicitly selected ${describeTopology(input.userOverride)}.`,
      suggestedRoles: input.userOverride === 'team'
        ? rolesFromLlmIntent(input.llmIntent) || defaultTeamRoles(prompt)
        : [],
      warnings: buildPlanWarnings(input.userOverride, input.planCapabilities),
    })
  }

  if (input.preferredMode === 'agent') {
    return decision({
      topology: 'single-agent',
      confidence: 0.98,
      source: 'explicit-user',
      rationale: 'The user explicitly requested a single-agent setup.',
    })
  }

  if (input.preferredMode === 'team') {
    return decision({
      topology: 'team',
      confidence: 0.98,
      source: 'explicit-user',
      rationale: 'The user explicitly requested a team setup.',
      suggestedRoles: rolesFromLlmIntent(input.llmIntent) || defaultTeamRoles(prompt),
      warnings: buildPlanWarnings('team', input.planCapabilities),
    })
  }

  if (input.selectedTemplate) {
    const topology = input.selectedTemplate.kind === 'team' ? 'team' : 'single-agent'
    return decision({
      topology,
      confidence: 0.97,
      source: 'template',
      rationale: `The selected template "${input.selectedTemplate.name}" is a ${input.selectedTemplate.kind} template.`,
      suggestedRoles: topology === 'team'
        ? rolesFromLlmIntent(input.llmIntent) || defaultTeamRoles(prompt)
        : [],
      warnings: buildPlanWarnings(topology, input.planCapabilities),
    })
  }

  const teamAudienceOnly = isTeamAudienceOnly(normalized)
  const explicitTeam = !teamAudienceOnly && (EXPLICIT_TEAM_PATTERN.test(normalized) || /\bagents\b/i.test(normalized))
  const explicitSingle = EXPLICIT_SINGLE_PATTERN.test(normalized)

  if (AMBIGUOUS_TOPOLOGY_CHOICE_PATTERN.test(normalized)) {
    return buildClarificationDecision('The request explicitly leaves the choice open between one agent and a team.')
  }

  if (explicitSingle && teamAudienceOnly) {
    return decision({
      topology: 'single-agent',
      confidence: 0.88,
      source: 'explicit-user',
      rationale: 'The request describes one assistant/operator serving a team, not multiple coordinated agents.',
    })
  }

  if (explicitTeam && !explicitSingle) {
    return decision({
      topology: 'team',
      confidence: 0.92,
      source: 'explicit-user',
      rationale: 'The request explicitly refers to multiple agents, team roles, handoffs, or coordination.',
      suggestedRoles: rolesFromLlmIntent(input.llmIntent) || defaultTeamRoles(prompt),
      warnings: buildPlanWarnings('team', input.planCapabilities),
    })
  }

  if (explicitSingle && !explicitTeam) {
    return decision({
      topology: 'single-agent',
      confidence: 0.9,
      source: 'explicit-user',
      rationale: 'The request describes one assistant/operator rather than coordinated specialist roles.',
    })
  }

  const structuralScore = scoreStructuralTeamSignals(normalized)
  if (shouldClarifyTopology(input, structuralScore)) {
    return buildClarificationDecision(input.llmIntent?.ambiguity_reason)
  }

  if (input.llmIntent && input.llmIntent.confidence >= 0.78 && input.llmIntent.recommended_topology !== 'clarify') {
    const topology = input.llmIntent.recommended_topology
    return decision({
      topology,
      confidence: input.llmIntent.confidence,
      source: 'llm',
      rationale: input.llmIntent.rationale,
      suggestedRoles: topology === 'team' ? rolesFromLlmIntent(input.llmIntent) || defaultTeamRoles(prompt) : [],
      warnings: buildPlanWarnings(topology, input.planCapabilities),
    })
  }

  if (structuralScore >= 3) {
    return decision({
      topology: 'team',
      confidence: Math.min(0.88, 0.68 + structuralScore * 0.06),
      source: 'policy',
      rationale: 'The request has separable work stages, specialist roles, or review/approval handoffs.',
      suggestedRoles: rolesFromLlmIntent(input.llmIntent) || defaultTeamRoles(prompt),
      warnings: buildPlanWarnings('team', input.planCapabilities),
    })
  }

  const bestTemplateMatch = input.templateMatches?.[0]
  if (bestTemplateMatch?.kind === 'team' && bestTemplateMatch.score >= 0.82) {
    return decision({
      topology: 'team',
      confidence: bestTemplateMatch.score,
      source: 'policy',
      rationale: `The strongest matching template, "${bestTemplateMatch.name}", is team-based.`,
      suggestedRoles: rolesFromLlmIntent(input.llmIntent) || defaultTeamRoles(prompt),
      warnings: buildPlanWarnings('team', input.planCapabilities),
    })
  }

  return decision({
    topology: 'single-agent',
    confidence: input.intent.likely_mode === 'blank-agent' ? Math.max(0.74, input.intent.confidence) : 0.74,
    source: 'policy',
    rationale: 'A single agent is the lowest-friction default when the request does not require separate roles or handoffs.',
  })
}

export function shouldUseTopologyLlm(input: {
  prompt: string
  preferredMode?: 'auto' | 'template' | 'agent' | 'team'
  selectedTemplate?: Pick<TemplateCatalogEntry, 'slug' | 'name' | 'kind'> | null
  firstPass: BuilderTopologyDecision
}): boolean {
  if (input.preferredMode === 'agent' || input.preferredMode === 'team') return false
  if (input.selectedTemplate) return false
  if (input.firstPass.source === 'explicit-user') return false
  if (input.firstPass.topology === 'clarify') return true
  if (input.firstPass.confidence < 0.78) return true
  return false
}

function shouldClarifyTopology(input: DecideBuilderTopologyInput, structuralScore: number): boolean {
  if (input.llmIntent?.recommended_topology === 'clarify' && input.llmIntent.confidence >= 0.62) return true
  if (BROAD_COMPANY_SCOPE_PATTERN.test(input.prompt) && structuralScore < 3) return true
  if (LOW_SPECIFICITY_PATTERN.test(input.prompt) && structuralScore < 3) return true
  if (input.intent.confidence < 0.54 && input.intent.likely_mode === 'blank-team') return true
  return false
}

function isTeamAudienceOnly(normalizedPrompt: string): boolean {
  return /\bfor\s+(?:my|our|a|the)?\s*(?:small\s+)?team\b/i.test(normalizedPrompt)
    && !/\b(team\s+of\s+agents|agent team|multi[-\s]?agent|crew|subagents?|handoff|coordinator|specialists?)\b/i.test(normalizedPrompt)
}

function scoreStructuralTeamSignals(normalizedPrompt: string): number {
  let score = 0
  const roleMatches = normalizedPrompt.match(new RegExp(ROLE_SEPARATION_PATTERN.source, 'gi')) ?? []
  const uniqueRoles = new Set(roleMatches.map((role) => role.toLowerCase()))
  if (uniqueRoles.size >= 2) score += 2
  if (WORKFLOW_PATTERN.test(normalizedPrompt)) score += 1
  if (/\b(research|write|edit|publish)\b/i.test(normalizedPrompt) && /\b(and|then|to)\b/i.test(normalizedPrompt)) score += 1
  if (/\bquality review|approval|handoff|coordinator\b/i.test(normalizedPrompt)) score += 2
  return score
}

function buildClarificationDecision(reason?: string): BuilderTopologyDecision {
  return decision({
    topology: 'clarify',
    confidence: 0.5,
    source: 'policy',
    rationale: reason || 'The request could be either one operator or a team of specialists.',
    clarification: {
      ambiguity_class: 'topology',
      question: 'Should this be one agent or a team of specialists?',
      options: [
        {
          id: 'single-agent',
          label: 'One agent',
          description: 'Simpler setup with one operator.',
          submit_message: 'Make this one agent.',
        },
        {
          id: 'team',
          label: 'Team of agents',
          description: 'Split responsibilities across coordinated roles.',
          submit_message: 'Make this a team of agents.',
        },
      ],
    },
  })
}

function decision(input: {
  topology: BuilderTopology
  confidence: number
  source: BuilderTopologyDecision['source']
  rationale: string
  suggestedRoles?: BuilderTopologyRole[]
  clarification?: BuilderTopologyDecision['clarification']
  warnings?: string[]
}): BuilderTopologyDecision {
  return {
    topology: input.topology,
    confidence: clamp(input.confidence),
    source: input.source,
    rationale: input.rationale,
    suggested_roles: input.suggestedRoles ?? [],
    ...(input.clarification ? { clarification: input.clarification } : {}),
    warnings: input.warnings ?? [],
  }
}

function rolesFromLlmIntent(intent?: AiBuilderTopologyIntent | null): BuilderTopologyRole[] | null {
  if (!intent?.suggested_roles.length) return null
  return intent.suggested_roles.slice(0, 5)
}

function defaultTeamRoles(prompt: string): BuilderTopologyRole[] {
  const lower = prompt.toLowerCase()
  if (/\b(content|article|blog|seo|publish|newsletter)\b/i.test(lower)) {
    return [
      {
        id: 'coordinator',
        label: 'Coordinator',
        mission: 'Own the final package and coordinate specialist work.',
        responsibilities: ['Route work', 'Resolve blockers', 'Assemble final output'],
        required_capabilities: [],
      },
      {
        id: 'research-strategist',
        label: 'Research Strategist',
        mission: 'Find search intent, references, and topic angles.',
        responsibilities: ['Research sources', 'Identify angles', 'Summarize findings'],
        required_capabilities: [],
      },
      {
        id: 'editor',
        label: 'Editor',
        mission: 'Review quality, structure, and publication readiness.',
        responsibilities: ['Review output', 'Tighten structure', 'Flag gaps'],
        required_capabilities: [],
      },
    ]
  }

  return [
    {
      id: 'coordinator',
      label: 'Coordinator',
      mission: 'Own the outcome and coordinate the workflow.',
      responsibilities: ['Route work', 'Resolve blockers', 'Own final quality'],
      required_capabilities: [],
    },
    {
      id: 'specialist',
      label: 'Specialist',
      mission: 'Execute the specialized work and return structured output.',
      responsibilities: ['Execute assigned work', 'Report progress', 'Escalate blockers'],
      required_capabilities: [],
    },
  ]
}

function buildPlanWarnings(topology: BuilderTopology, planCapabilities?: RuntimeFeatureAccess | null): string[] {
  void planCapabilities
  if (topology !== 'team') return []
  return []
}

function describeTopology(topology: Exclude<BuilderTopology, 'clarify'>): string {
  return topology === 'team' ? 'a team' : 'one agent'
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))))
}
