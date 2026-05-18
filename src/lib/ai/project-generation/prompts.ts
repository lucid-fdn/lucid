import type { TemplateCatalogEntry } from '@contracts/template'

import type { BuilderTopologyDecision } from '@/lib/agent-builder/topology'
import type { GenerationDraft, GenerationIntent, TemplateMatch } from './schemas'

function formatTemplateCandidate(
  template: Pick<TemplateCatalogEntry, 'slug' | 'name' | 'kind' | 'category' | 'description' | 'preview_prompt' | 'tags' | 'params'>,
  match?: TemplateMatch,
): string {
  const params = (template.params ?? [])
    .map((param) => `${param.key}${param.required ? ' (required)' : ''}${param.hint ? `: ${param.hint}` : ''}`)
    .join(', ')

  return [
    `slug: ${template.slug}`,
    `name: ${template.name}`,
    `kind: ${template.kind}`,
    `category: ${template.category}`,
    `description: ${template.description ?? ''}`,
    `preview_prompt: ${template.preview_prompt ?? ''}`,
    `tags: ${(template.tags ?? []).join(', ')}`,
    `params: ${params || 'none'}`,
    ...(match ? [`heuristic_score: ${match.score}`, `heuristic_reason: ${match.reason}`] : []),
  ].join('\n')
}

export function buildIntentSystemPrompt(): string {
  return [
    'You classify a Lucid project creation request.',
    'Return structured intent only.',
    'Prefer template reuse when there is a clear fit.',
    'Prefer a single agent by default.',
    'Only mark team_needed true when the prompt clearly implies multiple specialized roles, review loops, or handoffs.',
    'Keep confidence conservative.',
  ].join(' ')
}

export function buildIntentUserPrompt(input: {
  prompt: string
  preferredMode?: string
  selectedTemplateSlug?: string
}): string {
  return [
    `Prompt: ${input.prompt}`,
    input.preferredMode ? `Preferred mode: ${input.preferredMode}` : null,
    input.selectedTemplateSlug ? `Currently selected template: ${input.selectedTemplateSlug}` : null,
  ].filter(Boolean).join('\n')
}

export function buildGenerationSystemPrompt(): string {
  return [
    'You create a Lucid generation draft for project creation.',
    'Output only structured data.',
    'Project names and starter names must be short, user-facing titles.',
    'Do not include request verbs like create, build, start, make, launch, or set up in the name.',
    'Prefer names that describe the assistant or team directly, such as "Daily Assistant" or "Executive Assistant".',
    'For broad common intents, make a strong first assumption instead of staying generic.',
    'When the intent clearly sounds like a personal, executive, sales, research, or support agent, carry forward the recommended capability bundle unless the prompt argues against it.',
    'Use template mode when a candidate is a strong fit and do not invent template params you do not know.',
    'Use blank-agent by default.',
    'Use blank-team only when clearly required.',
    'Keep generated teams small, realistic, and deployable.',
    'When relevant, populate skills, plugins, MCP/tool servers, permission policy, memory strategy, schedules, channel hints, and evaluation scaffolding.',
    'Only use capabilities that appear in the provided capability registry or template specs.',
    'If the user asks for a channel, integration, or app that is not in the capability registry or supported channel list, do not invent it or claim it is connected.',
    'For team members, make roles concrete and include responsibilities when the topology truly benefits from explicit ownership.',
    'Do not promise environment, credentials, or test-run setup inside the draft; those happen after creation.',
  ].join(' ')
}

export function buildGenerationUserPrompt(input: {
  prompt: string
  intent: GenerationIntent
  templateCandidates: Array<Pick<TemplateCatalogEntry, 'slug' | 'name' | 'kind' | 'category' | 'description' | 'preview_prompt' | 'tags' | 'params'>>
  templateMatches: TemplateMatch[]
  capabilitySnapshot: string
  planningMemo: string
  teamPlanJson: string
  preferredMode?: string
  runtimeMode?: string
  intentProfileSummary?: string | null
  recommendedTemplateAction?: string | null
  topologyDecision?: BuilderTopologyDecision | null
}): string {
  const candidates = input.templateCandidates
    .map((template) => formatTemplateCandidate(
      template,
      input.templateMatches.find((match) => match.slug === template.slug),
    ))
    .join('\n\n---\n\n')

  return [
    `User prompt:\n${input.prompt}`,
    `Intent:\n${JSON.stringify(input.intent, null, 2)}`,
    input.preferredMode ? `Preferred mode: ${input.preferredMode}` : null,
    input.runtimeMode ? `Requested runtime mode: ${input.runtimeMode}` : null,
    input.intentProfileSummary ? `Intent profile:\n${input.intentProfileSummary}` : null,
    input.recommendedTemplateAction ? `Template recommendation:\n${input.recommendedTemplateAction}` : null,
    input.topologyDecision ? `Topology decision:\n${JSON.stringify(input.topologyDecision, null, 2)}` : null,
    `Builder planning memo:\n${input.planningMemo}`,
    `Builder topology suggestion:\n${input.teamPlanJson}`,
    `Capability registry:\n${input.capabilitySnapshot}`,
    `Template candidates:\n${candidates || 'none'}`,
    'Return a GenerationDraft-compatible object and a short reasoning summary.',
    'For common broad prompts, propose likely integrations concretely rather than asking a vague open-ended question.',
    'If using template mode, include only params supported by the chosen template.',
    'If using a blank agent or team, fill operational capability fields only where they materially improve the setup.',
    input.topologyDecision?.topology === 'single-agent'
      ? 'Topology is locked to single-agent for this turn. Return blank-agent unless an explicitly selected agent template is used.'
      : null,
    input.topologyDecision?.topology === 'team'
      ? 'Topology is locked to team for this turn. Return blank-team unless an explicitly selected team template is used.'
      : null,
    input.topologyDecision?.topology === 'clarify'
      ? 'Topology is ambiguous. Keep the draft conservative and let the clarification card resolve the structure.'
      : null,
    'For unsupported requested surfaces, preserve the user intent in the draft text but avoid unsupported channel_hints, plugins, or tools.',
  ].filter(Boolean).join('\n\n')
}

export function buildPatchSystemPrompt(): string {
  return [
    'You update a Lucid project generation draft.',
    'Return a GenerationPatch only.',
    'Prefer small targeted edits over full rewrites.',
    'If the user asks for a template swap, use replace_template.',
    'If the user asks for prompt or personality changes to a blank agent, use update_agent_prompt.',
    'Use update_agent_spec when the user is changing tools, skills, MCP servers, guardrails, memory strategy, schedules, or other capability-level agent settings.',
    'Use replace_team_spec when the user is changing team structure, responsibilities, handoffs, or member capability stacks in a broad way.',
    'If the request implies converting a single agent into a coordinated team, use convert_agent_to_team.',
  ].join(' ')
}

export function buildPatchUserPrompt(input: {
  prompt: string
  draft: GenerationDraft
  templateCandidates: Array<Pick<TemplateCatalogEntry, 'slug' | 'name' | 'kind' | 'category' | 'description' | 'preview_prompt' | 'tags' | 'params'>>
  templateMatches: TemplateMatch[]
  capabilitySnapshot: string
  planningMemo: string
  teamPlanJson: string
}): string {
  const candidates = input.templateCandidates
    .map((template) => formatTemplateCandidate(
      template,
      input.templateMatches.find((match) => match.slug === template.slug),
    ))
    .join('\n\n---\n\n')

  return [
    `User refinement request:\n${input.prompt}`,
    `Current draft:\n${JSON.stringify(input.draft, null, 2)}`,
    `Builder planning memo:\n${input.planningMemo}`,
    `Builder topology suggestion:\n${input.teamPlanJson}`,
    `Capability registry:\n${input.capabilitySnapshot}`,
    `Relevant templates:\n${candidates || 'none'}`,
  ].join('\n\n')
}
