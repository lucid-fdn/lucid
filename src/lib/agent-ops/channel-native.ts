import { AGENT_OPS_WORKFLOW_IDS, type AgentOpsRun, type AgentOpsRunMode, type AgentOpsWorkflowId } from './workflow-types'
import {
  isCapabilityTemplateChannelCommand,
  listCapabilityTemplateChannelCommands,
  resolveCapabilityTemplateChannelCommand,
  type CapabilityTemplateChannelCommand,
} from '@/lib/templates/capabilities/channel-commands'

export const AGENT_OPS_CHANNEL_COMMAND_NAMES = ['ops', 'agentops'] as const

export interface AgentOpsChannelCommand {
  workflowId: AgentOpsWorkflowId
  target: string | null
  runMode?: AgentOpsRunMode
  intent?: 'agent_ops' | 'knowledge_think' | 'plan_only'
}

export type ChannelNativeCommand =
  | { kind: 'agent_ops'; command: AgentOpsChannelCommand }
  | { kind: 'capability_template'; command: CapabilityTemplateChannelCommand }
  | { kind: 'global_search'; query: string }
  | { kind: 'knowledge_remember'; text: string }
  | { kind: 'knowledge_claims'; query: string | null }
  | { kind: 'knowledge_forget'; id: string }

export interface AgentOpsChannelWorkflowChoice {
  name: string
  value: AgentOpsWorkflowId
}

export interface ChannelNativeCommandChoice {
  name: string
  value: string
}

export interface AgentOpsChannelLaunchReportInput {
  run: AgentOpsRun
  channelLabel: string
}

const WORKFLOW_LABELS: Record<AgentOpsWorkflowId, string> = {
  investigate: 'Investigate',
  'office-hours': 'Office hours',
  autoplan: 'Autoplan',
  'plan-ceo-review': 'CEO plan review',
  'plan-eng-review': 'Engineering plan review',
  'plan-design-review': 'Design plan review',
  'plan-devex-review': 'DevEx plan review',
  'devex-review': 'DevEx review',
  'design-consultation': 'Design consultation',
  'design-variants': 'Design variants',
  review: 'Review',
  qa: 'QA',
  'check-page': 'Check page',
  'test-funnel': 'Test funnel',
  'buy-stuff': 'Buy stuff',
  'research-site': 'Research website',
  'extract-data': 'Extract data',
  'monitor-page': 'Monitor page',
  'update-portal': 'Update portal',
  'support-repro': 'Reproduce issue',
  ship: 'Ship',
  canary: 'Canary',
  retro: 'Retro',
  cso: 'CSO',
  'security-audit': 'Security audit',
  'design-review': 'Design review',
  'design-to-code': 'Design to code',
  'devex-audit': 'DevEx audit',
  'document-release': 'Document release',
  'release-check': 'Release check',
  'version-gate': 'Version gate',
  'pr-title-sync': 'PR title sync',
  'product-quality-lint': 'Product quality lint',
  'model-benchmark': 'Model benchmark',
}

const WORKFLOW_ALIASES: Record<string, AgentOpsWorkflowId> = {
  check: 'check-page',
  page: 'check-page',
  'check-page': 'check-page',
  funnel: 'test-funnel',
  test: 'test-funnel',
  'test-funnel': 'test-funnel',
  buy: 'buy-stuff',
  purchase: 'buy-stuff',
  shop: 'buy-stuff',
  groceries: 'buy-stuff',
  'buy-stuff': 'buy-stuff',
  research: 'research-site',
  'research-site': 'research-site',
  'research-website': 'research-site',
  extract: 'extract-data',
  scrape: 'extract-data',
  'extract-data': 'extract-data',
  monitor: 'monitor-page',
  watch: 'monitor-page',
  'monitor-page': 'monitor-page',
  portal: 'update-portal',
  operate: 'update-portal',
  'update-portal': 'update-portal',
  repro: 'support-repro',
  reproduce: 'support-repro',
  support: 'support-repro',
  'support-repro': 'support-repro',
  design: 'design-consultation',
  consult: 'design-consultation',
  variants: 'design-variants',
  'design-variants': 'design-variants',
  'design-to-code': 'design-to-code',
  devex: 'devex-audit',
  dx: 'devex-audit',
  'devex-audit': 'devex-audit',
  'devex-review': 'devex-review',
  'dx-review': 'devex-review',
  docs: 'document-release',
  document: 'document-release',
  'document-release': 'document-release',
  release: 'release-check',
  'release-check': 'release-check',
  readiness: 'release-check',
  version: 'version-gate',
  'version-gate': 'version-gate',
  title: 'pr-title-sync',
  'pr-title': 'pr-title-sync',
  'pr-title-sync': 'pr-title-sync',
  quality: 'product-quality-lint',
  lint: 'product-quality-lint',
  slop: 'product-quality-lint',
  jargon: 'product-quality-lint',
  'product-quality-lint': 'product-quality-lint',
}

export function parseAgentOpsChannelCommand(rawArg: string): AgentOpsChannelCommand | null {
  const [workflowToken, ...targetParts] = rawArg.trim().split(/\s+/).filter(Boolean)
  if (!workflowToken) return null

  const workflowId = resolveChannelWorkflowId(workflowToken)
  if (!workflowId) return null

  const target = targetParts.join(' ').trim()
  const normalizedWorkflowToken = workflowToken.toLowerCase()
  return {
    workflowId,
    target: target.length > 0 ? target : null,
    runMode: normalizedWorkflowToken === 'plan'
      ? 'plan_only'
      : workflowId === 'buy-stuff'
        ? 'handoff'
        : undefined,
    intent: normalizedWorkflowToken === 'research'
      ? 'knowledge_think'
      : normalizedWorkflowToken === 'plan'
        ? 'plan_only'
        : 'agent_ops',
  }
}

export function parseChannelNativeCommand(rawText: string): ChannelNativeCommand | null {
  const trimmed = rawText.trim()
  if (!trimmed) return null
  const [token, ...rest] = trimmed.split(/\s+/).filter(Boolean)
  const action = token?.toLowerCase()
  const body = rest.join(' ').trim()
  if (!action) return null

  if (action === 'search') return body ? { kind: 'global_search', query: body } : null
  if (action === 'remember') return body ? { kind: 'knowledge_remember', text: body } : null
  if (action === 'claims') return { kind: 'knowledge_claims', query: body || null }
  if (action === 'forget') return body ? { kind: 'knowledge_forget', id: body } : null

  const capabilityCommand = resolveCapabilityTemplateChannelCommand(trimmed)
  if (capabilityCommand) return { kind: 'capability_template', command: capabilityCommand }

  const command = parseAgentOpsChannelCommand(trimmed)
  return command ? { kind: 'agent_ops', command } : null
}

export function isAgentOpsChannelWorkflowToken(raw: string | null | undefined): boolean {
  return Boolean(raw && resolveChannelWorkflowId(raw))
}

export function normalizeAgentOpsChannelCommandArg(rawText: string | undefined): string | null {
  const trimmed = rawText?.trim() ?? ''
  if (!trimmed) return null

  const [action, ...rest] = trimmed.split(/\s+/).filter(Boolean)
  const normalizedAction = action?.toLowerCase()
  if (!normalizedAction) return null

  if ((AGENT_OPS_CHANNEL_COMMAND_NAMES as readonly string[]).includes(normalizedAction)) {
    return rest.join(' ').trim()
  }

  if (['search', 'remember', 'claims', 'forget'].includes(normalizedAction)) {
    return trimmed
  }

  if (isCapabilityTemplateChannelCommand(trimmed)) {
    return trimmed
  }

  return rest.length > 0 && isAgentOpsChannelWorkflowToken(normalizedAction) ? trimmed : null
}

export function buildAgentOpsChannelCommandUsage(channelLabel: string): string {
  const examples = [
    'ops review https://github.com/org/repo/pull/123',
    'ops qa https://preview.example.com',
    'check https://www.example.com',
    'buy weekly groceries under $120 from Carrefour',
    'research https://competitor.example.com',
    'plan release readiness for tomorrow',
    'search release blockers',
    'remember Buyer budget approvals require finance evidence',
    'claims pricing risk',
    'forget 11111111-1111-4111-8111-111111111111',
    'extract pricing from https://www.example.com/pricing',
    'monitor https://status.example.com',
    'ops release release/agent-ops',
    'ops quality release notes draft',
    'ops ship release/agent-ops',
    'ops retro last run',
    'whales watched wallet moved 2,100 ETH to Coinbase',
    'token LUCID liquidity fell and top holders increased',
    'markets probability moved from 41% to 57%',
    'portfolio review 42% concentration in one token',
    'copy draft a smart-wallet copy plan, do not execute',
    'web3 daily operating brief',
  ]
  const capabilityCommands = listCapabilityTemplateChannelCommands()
    .map((command) => `${command.command} (${command.templateName})`)
  return [
    `${channelLabel} Agent Ops`,
    'Launch the same Mission Control workflows from this channel.',
    '',
    'Usage:',
    ...examples.map((example) => `- ${example}`),
    '',
    `Available workflows: ${AGENT_OPS_WORKFLOW_IDS.map((id) => WORKFLOW_LABELS[id]).join(', ')}`,
    `Capability templates: ${capabilityCommands.join(', ')}`,
  ].join('\n')
}

export function listAgentOpsChannelWorkflowChoices(prefix = ''): AgentOpsChannelWorkflowChoice[] {
  const normalized = prefix.trim().toLowerCase()
  return AGENT_OPS_WORKFLOW_IDS
    .filter((id) => !normalized || id.includes(normalized) || WORKFLOW_LABELS[id].toLowerCase().includes(normalized))
    .slice(0, 25)
    .map((id) => ({
      name: WORKFLOW_LABELS[id],
      value: id,
    }))
}

export function listChannelNativeCommandChoices(prefix = ''): ChannelNativeCommandChoice[] {
  const normalized = prefix.trim().toLowerCase()
  const workflowChoices = listAgentOpsChannelWorkflowChoices(prefix)
  const capabilityChoices = listCapabilityTemplateChannelCommands()
    .filter((command) =>
      !normalized ||
      command.command.includes(normalized) ||
      command.templateName.toLowerCase().includes(normalized) ||
      command.templateKey.toLowerCase().includes(normalized),
    )
    .map((command) => ({
      name: `${command.command} - ${command.templateName}`.slice(0, 100),
      value: command.command,
    }))

  return [...capabilityChoices, ...workflowChoices].slice(0, 25)
}

export function buildAgentOpsChannelScope(input: {
  channelType: string
  surfaceId: string
  target: string | null
}): {
  type: 'channel' | 'url' | 'pull_request' | 'branch' | 'repository'
  ref: string
  label: string
  metadata: Record<string, unknown>
} {
  const target = input.target?.trim()
  if (target) {
    const lower = target.toLowerCase()
    if (/^https?:\/\//i.test(target)) {
      return {
        type: lower.includes('/pull/') || lower.includes('/pulls/') ? 'pull_request' : 'url',
        ref: target,
        label: target,
        metadata: { source: 'channel_command', channel_type: input.channelType, surface_id: input.surfaceId },
      }
    }
    if (/^(pr|pull)\s+#?\d+/i.test(target)) {
      return {
        type: 'pull_request',
        ref: target,
        label: target,
        metadata: { source: 'channel_command', channel_type: input.channelType, surface_id: input.surfaceId },
      }
    }
    if (/^(repo|repository)\s+/i.test(target)) {
      return {
        type: 'repository',
        ref: target.replace(/^(repo|repository)\s+/i, '').trim(),
        label: target,
        metadata: { source: 'channel_command', channel_type: input.channelType, surface_id: input.surfaceId },
      }
    }
    return {
      type: 'branch',
      ref: target,
      label: target,
      metadata: { source: 'channel_command', channel_type: input.channelType, surface_id: input.surfaceId },
    }
  }

  const ref = `${input.channelType}:${input.surfaceId}`
  return {
    type: 'channel',
    ref,
    label: ref,
    metadata: { source: 'channel_command', channel_type: input.channelType, surface_id: input.surfaceId },
  }
}

export function formatAgentOpsChannelLaunchReport(input: AgentOpsChannelLaunchReportInput): string {
  const teamOps = readRecord(input.run.metadata.team_ops)
  const specialists = Array.isArray(teamOps.specialists)
    ? teamOps.specialists.map(readSpecialistName).filter((name): name is string => Boolean(name))
    : []
  const compatibleRuntimes = readStringArray(teamOps.compatibleRuntimeProfiles)
  const partialRuntimes = readStringArray(teamOps.partialRuntimeProfiles)
  const dispatchTier = typeof teamOps.dispatchTier === 'string' ? teamOps.dispatchTier : 'unknown'
  const adaptiveDispatch = readRecord(teamOps.adaptiveDispatch)
  const adaptiveBaseTier = typeof adaptiveDispatch.baseTier === 'string' ? adaptiveDispatch.baseTier : null
  const adaptiveFinalTier = typeof adaptiveDispatch.finalTier === 'string' ? adaptiveDispatch.finalTier : null
  const skippedSpecialists = readDecisionNames(adaptiveDispatch.skippedSpecialists)
  const protectedSpecialists = readDecisionNames(adaptiveDispatch.protectedSpecialists)
  const channelLaunchStatus = readChannelLaunchStatus(teamOps.channelLaunchStatus)
  const runModePolicy = readRecord(input.run.metadata.run_mode_policy)
  const effectiveRunMode = typeof runModePolicy.effectiveMode === 'string'
    ? runModePolicy.effectiveMode
    : input.run.runMode
  const blockedReason = typeof input.run.metadata.blocked_reason === 'string'
    ? input.run.metadata.blocked_reason
    : input.run.errorMessage ?? null

  return [
    `${input.channelLabel} Agent Ops run ${input.run.status === 'blocked' ? 'blocked' : 'started'}`,
    `Workflow: ${WORKFLOW_LABELS[input.run.workflowId] ?? input.run.workflowId}`,
    `Run: ${input.run.id}`,
    `Status: ${input.run.status}`,
    `Mode: ${effectiveRunMode}`,
    `Dispatch: ${dispatchTier}`,
    adaptiveBaseTier && adaptiveFinalTier ? `Adaptive dispatch: ${adaptiveBaseTier} -> ${adaptiveFinalTier}` : null,
    specialists.length > 0 ? `Specialists: ${specialists.slice(0, 6).join(', ')}` : 'Specialists: none selected',
    skippedSpecialists.length > 0 ? `Skipped specialists: ${skippedSpecialists.slice(0, 6).join(', ')}` : null,
    protectedSpecialists.length > 0 ? `Protected specialists: ${protectedSpecialists.slice(0, 6).join(', ')}` : null,
    compatibleRuntimes.length > 0 ? `Compatible runtimes: ${compatibleRuntimes.join(', ')}` : 'Compatible runtimes: none reported',
    partialRuntimes.length > 0 ? `Partial runtime warnings: ${partialRuntimes.join(', ')}` : null,
    channelLaunchStatus ? `Channel status: ${channelLaunchStatus}` : null,
    blockedReason ? `Blocked reason: ${blockedReason}` : null,
  ].filter((line): line is string => Boolean(line)).join('\n')
}

function resolveChannelWorkflowId(raw: string): AgentOpsWorkflowId | null {
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'plan') return 'autoplan'
  const aliased = WORKFLOW_ALIASES[normalized]
  if (aliased) return aliased
  if ((AGENT_OPS_WORKFLOW_IDS as readonly string[]).includes(normalized)) {
    return normalized as AgentOpsWorkflowId
  }
  const match = AGENT_OPS_WORKFLOW_IDS.find((id) => WORKFLOW_LABELS[id].toLowerCase() === normalized)
  return match ?? null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

function readSpecialistName(value: unknown): string | null {
  const record = readRecord(value)
  return typeof record.name === 'string' && record.name.length > 0 ? record.name : null
}

function readChannelLaunchStatus(value: unknown): string | null {
  const statuses = Object.values(readRecord(value))
    .map(readRecord)
    .filter((status) => Object.keys(status).length > 0)
  if (statuses.length === 0) return null

  const status = statuses[0]
  const channelLabel = typeof status.channelLabel === 'string' && status.channelLabel.length > 0
    ? status.channelLabel
    : 'Channel'
  const launchStatus = typeof status.status === 'string' && status.status.length > 0
    ? status.status
    : 'started'
  const reportStatus = typeof status.reportStatus === 'string' && status.reportStatus.length > 0
    ? status.reportStatus
    : 'ready'

  const launchLabel = launchStatus === 'started' ? 'started' : launchStatus
  const responseLabel = reportStatus === 'ready' ? 'initial response ready' : `response ${reportStatus}`

  return `${channelLabel} launch ${launchLabel}, ${responseLabel}`
}

function readDecisionNames(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(readSpecialistName).filter((name): name is string => Boolean(name))
    : []
}
