import {
  listAgentOpsChannelCapabilities,
  listAgentOpsRuntimeProfiles,
  type AgentOpsChannelCapability,
  type AgentOpsChannelId,
  type AgentOpsEngineId,
  type AgentOpsRuntimeProfile,
  type AgentOpsRuntimeProfileId,
  type AgentOpsSupportLevel,
} from './capability-source'
import {
  REVIEW_ARMY_SPECIALISTS,
  type ReviewSpecialist,
} from './review-army'
import type {
  AgentOpsSpecialistTelemetrySummary,
} from './specialist-telemetry'
import type { RuntimeNativeCapability } from '@contracts/runtime-capability'
import type {
  AgentOpsTeamPolicyGateEvaluation,
} from './team-policy'
import type {
  AgentOpsCapabilityRequirement,
  AgentOpsEvidenceType,
  AgentOpsRuntimeModeRequirement,
  AgentOpsWorkflowDefinition,
} from './workflow-types'

export const TEAM_OPS_DISPATCH_TIERS = [
  'simple',
  'medium',
  'heavy',
  'full',
  'plan',
] as const

export type TeamOpsDispatchTier = (typeof TEAM_OPS_DISPATCH_TIERS)[number]

export type TeamOpsSpecialistCategory =
  | ReviewSpecialist['category']
  | 'browser_qa'
  | 'release'
  | 'retro'
  | 'docs'
  | 'model'
  | 'quality'

export interface TeamOpsSpecialistProfile {
  slug: string
  name: string
  category: TeamOpsSpecialistCategory
  requiredCapabilities: readonly AgentOpsCapabilityRequirement[]
  evidenceTypes: readonly AgentOpsEvidenceType[]
  critical: boolean
  description: string
}

export interface TeamOpsRuntimeCandidate {
  id?: string
  label?: string
  profileId: AgentOpsRuntimeProfileId
  engine?: AgentOpsEngineId
  nativeCapabilities?: readonly Pick<
    RuntimeNativeCapability,
    'id' | 'kind' | 'label' | 'availability' | 'supportLevel'
  >[]
  unavailable?: boolean
}

export interface TeamOpsCapabilityCheck {
  capability: AgentOpsCapabilityRequirement
  supported: boolean
  supportLevel: AgentOpsSupportLevel | 'supported'
  reason: string
}

export interface TeamOpsRuntimeCompatibility {
  profile: AgentOpsRuntimeProfile
  candidate: TeamOpsRuntimeCandidate | null
  compatible: boolean
  supportLevel: 'supported' | 'partial' | 'not_supported'
  missingCapabilities: AgentOpsCapabilityRequirement[]
  partialCapabilities: AgentOpsCapabilityRequirement[]
  checks: TeamOpsCapabilityCheck[]
  notes: string[]
}

export interface TeamOpsDispatchPlan {
  workflowId: AgentOpsWorkflowDefinition['id']
  tier: TeamOpsDispatchTier
  reason: string
  requiredCapabilities: readonly AgentOpsCapabilityRequirement[]
  specialists: readonly TeamOpsSpecialistProfile[]
  runtimeCompatibility: readonly TeamOpsRuntimeCompatibility[]
  adaptiveDispatch: TeamOpsAdaptiveDispatchSummary
}

export interface TeamOpsChannelLaunchCompatibility {
  channel: AgentOpsChannelCapability
  launchSupported: boolean
  reportSupported: boolean
  notes: string[]
}

export interface TeamOpsAdaptiveDispatchContext {
  teamPolicyEvaluation?: AgentOpsTeamPolicyGateEvaluation | null
  specialistTelemetry?: readonly AgentOpsSpecialistTelemetrySummary[] | null
}

export interface TeamOpsAdaptiveSpecialistDecision {
  slug: string
  name: string
  reason: string
}

export interface TeamOpsAdaptiveDispatchSummary {
  enabled: boolean
  baseTier: TeamOpsDispatchTier
  finalTier: TeamOpsDispatchTier
  policySignals: readonly string[]
  telemetrySignals: readonly string[]
  skippedSpecialists: readonly TeamOpsAdaptiveSpecialistDecision[]
  protectedSpecialists: readonly TeamOpsAdaptiveSpecialistDecision[]
}

const RUNTIME_MODE_BY_PROFILE = Object.freeze({
  shared: ['shared'],
  c1_managed: ['dedicated', 'managed_dedicated'],
  c2a_autonomous: ['dedicated', 'autonomous_dedicated', 'runtime_native'],
} satisfies Record<AgentOpsRuntimeProfileId, readonly AgentOpsRuntimeModeRequirement[]>)

const EXTRA_SPECIALISTS = Object.freeze([
  {
    slug: 'browser-qa',
    name: 'Browser QA Specialist',
    category: 'browser_qa',
    requiredCapabilities: ['advanced:browser-qa', 'tool:browser'],
    evidenceTypes: ['screenshot', 'console_log', 'network_log', 'perf_metric', 'review_finding'],
    critical: false,
    description: 'Verifies live UI behavior through the shared Browser QA capability contract.',
  },
  {
    slug: 'release',
    name: 'Release Specialist',
    category: 'release',
    requiredCapabilities: ['advanced:release-gates', 'core:approvals'],
    evidenceTypes: ['deploy_url', 'approval', 'test_result', 'log_excerpt'],
    critical: true,
    description: 'Checks release gates, changelog/version readiness, approvals, and rollback evidence.',
  },
  {
    slug: 'canary-observer',
    name: 'Canary Observer',
    category: 'release',
    requiredCapabilities: ['advanced:release-gates', 'advanced:agent-ops'],
    evidenceTypes: ['deploy_url', 'perf_metric', 'trace', 'log_excerpt'],
    critical: true,
    description: 'Watches a release candidate for runtime errors, performance regressions, and rollback signals.',
  },
  {
    slug: 'retro-facilitator',
    name: 'Retro Facilitator',
    category: 'retro',
    requiredCapabilities: ['advanced:project-learnings', 'memory:project'],
    evidenceTypes: ['transcript', 'memory_hit', 'review_finding'],
    critical: false,
    description: 'Turns run evidence into team learnings, ownership, and follow-up actions.',
  },
  {
    slug: 'docs-release',
    name: 'Docs Release Specialist',
    category: 'docs',
    requiredCapabilities: ['advanced:agent-ops'],
    evidenceTypes: ['screenshot', 'approval', 'review_finding'],
    critical: false,
    description: 'Checks release docs, rendered artifacts, copy/paste safety, and publish approval.',
  },
  {
    slug: 'product-quality',
    name: 'Product Quality Specialist',
    category: 'quality',
    requiredCapabilities: ['advanced:product-quality', 'advanced:agent-ops'],
    evidenceTypes: ['review_finding', 'screenshot', 'transcript', 'test_result'],
    critical: false,
    description: 'Checks jargon, AI slop, screenshots, regression-test evidence, version drift, and release-note drift.',
  },
  {
    slug: 'model-benchmark',
    name: 'Model Benchmark Specialist',
    category: 'model',
    requiredCapabilities: ['advanced:eval-center', 'eval:model'],
    evidenceTypes: ['model_benchmark', 'perf_metric', 'trace'],
    critical: false,
    description: 'Compares model/runtime quality, cost, latency, and instruction-following evidence.',
  },
] satisfies readonly TeamOpsSpecialistProfile[])

export const TEAM_OPS_SPECIALIST_PROFILES = Object.freeze([
  ...REVIEW_ARMY_SPECIALISTS.map((specialist) => ({
    slug: specialist.slug,
    name: specialist.name,
    category: specialist.category,
    requiredCapabilities: specialist.requiredCapabilities as AgentOpsCapabilityRequirement[],
    evidenceTypes: ['diff', 'review_finding'] as AgentOpsEvidenceType[],
    critical: ['security', 'migration', 'red_team'].includes(specialist.category),
    description: specialist.prompt,
  })),
  ...EXTRA_SPECIALISTS,
] satisfies readonly TeamOpsSpecialistProfile[])

export function listTeamOpsSpecialistProfiles(): TeamOpsSpecialistProfile[] {
  return [...TEAM_OPS_SPECIALIST_PROFILES].sort((a, b) => a.slug.localeCompare(b.slug))
}

export function selectTeamOpsSpecialists(
  workflow: AgentOpsWorkflowDefinition,
  context: TeamOpsAdaptiveDispatchContext = {},
): TeamOpsSpecialistProfile[] {
  return resolveAdaptiveSpecialistSelection(workflow, context).specialists
}

function selectBaseTeamOpsSpecialists(workflow: AgentOpsWorkflowDefinition): TeamOpsSpecialistProfile[] {
  const slugs = new Set<string>()
  const reviewArmy = workflow.metadata.review_army

  if (isReviewArmyMetadata(reviewArmy)) {
    for (const slug of reviewArmy.specialists) {
      slugs.add(slug)
    }
  }

  if (workflow.requiredCapabilities.includes('advanced:browser-qa') || workflow.requiredCapabilities.includes('tool:browser')) {
    slugs.add('browser-qa')
  }

  if (workflow.id === 'ship') {
    slugs.add('release')
  }

  if (workflow.id === 'canary') {
    slugs.add('canary-observer')
  }

  if (workflow.id === 'retro') {
    slugs.add('retro-facilitator')
  }

  if (workflow.id === 'document-release') {
    slugs.add('docs-release')
  }

  if (
    workflow.id === 'devex-review'
    || workflow.id === 'devex-audit'
  ) {
    slugs.add('devex')
  }

  if (
    workflow.id === 'release-check'
    || workflow.id === 'version-gate'
    || workflow.id === 'pr-title-sync'
  ) {
    slugs.add('release')
    slugs.add('product-quality')
  }

  if (workflow.id === 'product-quality-lint') {
    slugs.add('product-quality')
  }

  if (workflow.id === 'model-benchmark') {
    slugs.add('model-benchmark')
  }

  const profiles = listTeamOpsSpecialistProfiles()
  return [...slugs].map((slug) => {
    const profile = profiles.find((candidate) => candidate.slug === slug)
    if (!profile) {
      throw new Error(`Unknown Team Ops specialist profile: ${slug}`)
    }
    return profile
  })
}

export function chooseTeamOpsDispatchTier(
  workflow: AgentOpsWorkflowDefinition,
  context: TeamOpsAdaptiveDispatchContext = {},
): {
  tier: TeamOpsDispatchTier
  reason: string
} {
  const baseSpecialists = selectBaseTeamOpsSpecialists(workflow)
  const base = chooseBaseTeamOpsDispatchTier(workflow, baseSpecialists)
  const adaptive = resolveAdaptiveDispatch({
    workflow,
    context,
    baseTier: base.tier,
    baseSpecialists,
  })

  return {
    tier: adaptive.finalTier,
    reason: buildAdaptiveDispatchReason(base.reason, adaptive),
  }
}

function chooseBaseTeamOpsDispatchTier(
  workflow: AgentOpsWorkflowDefinition,
  specialists: readonly TeamOpsSpecialistProfile[],
): { tier: TeamOpsDispatchTier; reason: string } {
  if (workflow.id === 'autoplan') {
    return { tier: 'plan', reason: 'Autoplan is a planning workflow and should default to the planning lane.' }
  }

  if (workflow.requiredCapabilities.includes('advanced:browser-qa')) {
    return { tier: 'full', reason: 'Browser QA requires evidence capture and replay through the full Agent Ops path.' }
  }

  if (workflow.safetyMode === 'approval_gated') {
    return { tier: 'full', reason: 'Approval-gated workflows need durable evidence, approvals, and Mission Control state.' }
  }

  if (workflow.executionMode === 'dag') {
    return { tier: specialists.length > 2 ? 'heavy' : 'full', reason: 'DAG workflows need coordinated multi-step execution.' }
  }

  if (specialists.length > 1) {
    return { tier: 'heavy', reason: 'Multiple specialists are selected for this workflow.' }
  }

  if (workflow.requiredCapabilities.some((capability) => capability.startsWith('tool:') || capability.startsWith('memory:'))) {
    return { tier: 'medium', reason: 'The workflow needs shared tools or memory but not full DAG orchestration.' }
  }

  return { tier: 'simple', reason: 'The workflow can run as one bounded Agent Ops turn.' }
}

export function evaluateTeamOpsRuntimeCompatibility(input: {
  workflow: AgentOpsWorkflowDefinition
  candidates?: readonly TeamOpsRuntimeCandidate[]
}): TeamOpsRuntimeCompatibility[] {
  const profiles = listAgentOpsRuntimeProfiles()
  const candidates = input.candidates
    ? [...input.candidates]
    : profiles.map((profile) => ({ profileId: profile.id }) satisfies TeamOpsRuntimeCandidate)

  return candidates.map((candidate) => {
    const profile = profiles.find((item) => item.id === candidate.profileId)
    if (!profile) {
      throw new Error(`Unknown Agent Ops runtime profile: ${candidate.profileId}`)
    }
    return evaluateRuntimeProfile(input.workflow, profile, candidate)
  })
}

export function buildTeamOpsDispatchPlan(input: {
  workflow: AgentOpsWorkflowDefinition
  candidates?: readonly TeamOpsRuntimeCandidate[]
  teamPolicyEvaluation?: AgentOpsTeamPolicyGateEvaluation | null
  specialistTelemetry?: readonly AgentOpsSpecialistTelemetrySummary[] | null
}): TeamOpsDispatchPlan {
  const context = {
    teamPolicyEvaluation: input.teamPolicyEvaluation,
    specialistTelemetry: input.specialistTelemetry,
  }
  const baseSpecialists = selectBaseTeamOpsSpecialists(input.workflow)
  const base = chooseBaseTeamOpsDispatchTier(input.workflow, baseSpecialists)
  const adaptiveDispatch = resolveAdaptiveDispatch({
    workflow: input.workflow,
    context,
    baseTier: base.tier,
    baseSpecialists,
  })
  return Object.freeze({
    workflowId: input.workflow.id,
    tier: adaptiveDispatch.finalTier,
    reason: buildAdaptiveDispatchReason(base.reason, adaptiveDispatch),
    requiredCapabilities: Object.freeze([...input.workflow.requiredCapabilities]),
    specialists: Object.freeze(resolveAdaptiveSpecialistSelection(input.workflow, context).specialists),
    runtimeCompatibility: Object.freeze(evaluateTeamOpsRuntimeCompatibility(input)),
    adaptiveDispatch: freezeAdaptiveDispatchSummary(adaptiveDispatch),
  })
}

export function buildAgentOpsWorkflowTeamOpsProjection(
  workflow: AgentOpsWorkflowDefinition,
  options: {
    candidates?: readonly TeamOpsRuntimeCandidate[]
    teamPolicyEvaluation?: AgentOpsTeamPolicyGateEvaluation | null
    specialistTelemetry?: readonly AgentOpsSpecialistTelemetrySummary[] | null
  } = {},
) {
  const dispatch = buildTeamOpsDispatchPlan({
    workflow,
    candidates: options.candidates,
    teamPolicyEvaluation: options.teamPolicyEvaluation,
    specialistTelemetry: options.specialistTelemetry,
  })
  const channelCompatibility = listAgentOpsChannelCapabilities().map((channel) => {
    const compatibility = evaluateTeamOpsChannelLaunchCompatibility({ workflow, channelId: channel.id })
    return {
      channelId: compatibility.channel.id,
      label: compatibility.channel.label,
      launchSupported: compatibility.launchSupported,
      reportSupported: compatibility.reportSupported,
      notes: compatibility.notes,
    }
  })
  return Object.freeze({
    dispatchTier: dispatch.tier,
    dispatchReason: dispatch.reason,
    specialists: dispatch.specialists.map((specialist) => ({
      slug: specialist.slug,
      name: specialist.name,
      category: specialist.category,
      requiredCapabilities: specialist.requiredCapabilities,
      evidenceTypes: specialist.evidenceTypes,
      critical: specialist.critical,
    })),
    compatibleRuntimeProfiles: dispatch.runtimeCompatibility
      .filter((runtime) => runtime.compatible)
      .map((runtime) => runtime.profile.id),
    partialRuntimeProfiles: dispatch.runtimeCompatibility
      .filter((runtime) => runtime.supportLevel === 'partial')
      .map((runtime) => runtime.profile.id),
    missingRuntimeProfiles: dispatch.runtimeCompatibility
      .filter((runtime) => !runtime.compatible)
      .map((runtime) => ({
        profileId: runtime.profile.id,
        missingCapabilities: runtime.missingCapabilities,
      })),
    adaptiveDispatch: dispatch.adaptiveDispatch,
    channelCompatibility,
  })
}

export function evaluateTeamOpsChannelLaunchCompatibility(input: {
  workflow: AgentOpsWorkflowDefinition
  channelId: AgentOpsChannelId
}): TeamOpsChannelLaunchCompatibility {
  const channel = listAgentOpsChannelCapabilities().find((candidate) => candidate.id === input.channelId)
  if (!channel) {
    throw new Error(`Unknown Agent Ops channel: ${input.channelId}`)
  }

  const notes: string[] = []
  const launchSupported = channel.hosted === 'supported' || channel.runtimeNative === 'supported'
  const reportSupported = channel.managedOutbound === 'supported' || channel.hosted === 'supported'

  if (input.workflow.requiredCapabilities.includes('channel:streaming') && channel.streamingUx !== 'supported') {
    notes.push(`${channel.label} does not fully support streamed Agent Ops progress yet.`)
  }

  if (
    input.workflow.requiredCapabilities.some((capability) => capability === 'channel:voice' || capability === 'channel:transcription')
    && channel.mediaAndVoice !== 'supported'
  ) {
    notes.push(`${channel.label} has partial or unavailable media/voice support.`)
  }

  if (!launchSupported) {
    notes.push(`${channel.label} cannot launch this workflow through a native or hosted channel adapter yet.`)
  }

  if (!reportSupported) {
    notes.push(`${channel.label} cannot report Agent Ops results through the shared outbound path yet.`)
  }

  return Object.freeze({
    channel,
    launchSupported,
    reportSupported,
    notes,
  })
}

function resolveAdaptiveSpecialistSelection(
  workflow: AgentOpsWorkflowDefinition,
  context: TeamOpsAdaptiveDispatchContext,
): {
  specialists: TeamOpsSpecialistProfile[]
  skippedSpecialists: TeamOpsAdaptiveSpecialistDecision[]
  protectedSpecialists: TeamOpsAdaptiveSpecialistDecision[]
  telemetrySignals: string[]
} {
  const baseSpecialists = selectBaseTeamOpsSpecialists(workflow)
  if (baseSpecialists.length === 0) {
    return {
      specialists: [],
      skippedSpecialists: [],
      protectedSpecialists: [],
      telemetrySignals: [],
    }
  }

  const telemetryBySlug = buildTelemetryBySlug(context.specialistTelemetry)
  const requiredCapabilities = new Set<string>(workflow.requiredCapabilities)
  const skipped = new Set<string>()
  const skippedSpecialists: TeamOpsAdaptiveSpecialistDecision[] = []
  const protectedSpecialists: TeamOpsAdaptiveSpecialistDecision[] = []
  const telemetrySignals: string[] = []

  for (const specialist of baseSpecialists) {
    if (isProtectedTeamOpsSpecialist(specialist)) {
      protectedSpecialists.push({
        slug: specialist.slug,
        name: specialist.name,
        reason: 'Guardrail specialist cannot be skipped by adaptive dispatch.',
      })
    }

    const telemetry = telemetryBySlug.get(specialist.slug)
    if (!telemetry) continue

    if (telemetry.signal === 'high_value') {
      telemetrySignals.push(`${specialist.name} is high-value based on accepted/fixed findings.`)
    }

    if (
      telemetry.signal === 'needs_tuning'
      && !isProtectedTeamOpsSpecialist(specialist)
      && !ownsRequiredWorkflowCapability(specialist, requiredCapabilities)
      && baseSpecialists.length - skipped.size > 1
    ) {
      skipped.add(specialist.slug)
      skippedSpecialists.push({
        slug: specialist.slug,
        name: specialist.name,
        reason: telemetry.recommendation,
      })
      telemetrySignals.push(`${specialist.name} is temporarily skipped because telemetry says it needs tuning.`)
    }
  }

  const specialists = baseSpecialists.filter((specialist) => !skipped.has(specialist.slug))
  return {
    specialists: specialists.length > 0 ? specialists : baseSpecialists,
    skippedSpecialists,
    protectedSpecialists,
    telemetrySignals,
  }
}

function resolveAdaptiveDispatch(input: {
  workflow: AgentOpsWorkflowDefinition
  context: TeamOpsAdaptiveDispatchContext
  baseTier: TeamOpsDispatchTier
  baseSpecialists: readonly TeamOpsSpecialistProfile[]
}): TeamOpsAdaptiveDispatchSummary {
  const selection = resolveAdaptiveSpecialistSelection(input.workflow, input.context)
  const policySignals = collectTeamPolicyDispatchSignals(input.context.teamPolicyEvaluation)
  const telemetrySignals = [...selection.telemetrySignals]
  const protectedSpecialists = selection.protectedSpecialists
  let finalTier = input.baseTier

  if (finalTier !== 'plan') {
    if (policySignals.some((signal) => signal.includes('Required'))) {
      finalTier = maxDispatchTier(finalTier, 'full')
    } else if (policySignals.length > 0) {
      finalTier = maxDispatchTier(finalTier, 'heavy')
    }

    if (protectedSpecialists.length > 0) {
      finalTier = maxDispatchTier(finalTier, 'heavy')
    }

    const highValueSelected = selection.specialists.some((specialist) =>
      input.context.specialistTelemetry?.some((summary) =>
        summary.slug === specialist.slug && summary.signal === 'high_value',
      ),
    )
    if (highValueSelected && input.baseTier !== 'full') {
      finalTier = maxDispatchTier(finalTier, nextDispatchTier(input.baseTier))
    }

    if (
      selection.skippedSpecialists.length > 0
      && policySignals.length === 0
      && protectedSpecialists.length === 0
      && input.baseTier !== 'simple'
      && input.baseTier !== 'full'
    ) {
      finalTier = minDispatchTier(finalTier, previousDispatchTier(input.baseTier))
    }
  }

  return {
    enabled: Boolean(input.context.teamPolicyEvaluation || input.context.specialistTelemetry?.length),
    baseTier: input.baseTier,
    finalTier,
    policySignals,
    telemetrySignals,
    skippedSpecialists: selection.skippedSpecialists,
    protectedSpecialists,
  }
}

function collectTeamPolicyDispatchSignals(
  evaluation: AgentOpsTeamPolicyGateEvaluation | null | undefined,
): string[] {
  if (!evaluation) return []
  const signals: string[] = []
  const missingRequired = evaluation.required.filter((item) => !item.satisfied)
  const missingRecommended = evaluation.recommended.filter((item) => !item.satisfied)

  if (missingRequired.length > 0) {
    signals.push(`Required workflow evidence is missing or stale: ${missingRequired.map((item) => item.workflowId).join(', ')}.`)
  }

  if (missingRecommended.length > 0) {
    signals.push(`Recommended workflow evidence is missing or stale: ${missingRecommended.map((item) => item.workflowId).join(', ')}.`)
  }

  if (evaluation.targetGates.length > 0) {
    signals.push(`Policy gate target: ${evaluation.targetGates.join(', ')}.`)
  }

  return signals
}

function buildAdaptiveDispatchReason(
  baseReason: string,
  adaptive: TeamOpsAdaptiveDispatchSummary,
): string {
  const notes = [
    ...adaptive.policySignals,
    ...adaptive.telemetrySignals,
    ...adaptive.protectedSpecialists.map((specialist) => `${specialist.name} is protected.`),
  ]
  if (adaptive.baseTier !== adaptive.finalTier) {
    notes.unshift(`Adaptive dispatch changed tier from ${adaptive.baseTier} to ${adaptive.finalTier}.`)
  }
  return notes.length > 0 ? `${baseReason} ${notes.join(' ')}` : baseReason
}

function freezeAdaptiveDispatchSummary(summary: TeamOpsAdaptiveDispatchSummary): TeamOpsAdaptiveDispatchSummary {
  return Object.freeze({
    enabled: summary.enabled,
    baseTier: summary.baseTier,
    finalTier: summary.finalTier,
    policySignals: Object.freeze([...summary.policySignals]),
    telemetrySignals: Object.freeze([...summary.telemetrySignals]),
    skippedSpecialists: Object.freeze(summary.skippedSpecialists.map((item) => Object.freeze({ ...item }))),
    protectedSpecialists: Object.freeze(summary.protectedSpecialists.map((item) => Object.freeze({ ...item }))),
  })
}

function buildTelemetryBySlug(
  telemetry: readonly AgentOpsSpecialistTelemetrySummary[] | null | undefined,
): Map<string, AgentOpsSpecialistTelemetrySummary> {
  return new Map((telemetry ?? []).map((summary) => [summary.slug, summary]))
}

function isProtectedTeamOpsSpecialist(specialist: TeamOpsSpecialistProfile): boolean {
  if (specialist.critical) return true
  const haystack = `${specialist.slug} ${specialist.name} ${specialist.category}`.toLowerCase()
  return [
    'security',
    'migration',
    'data-migration',
    'auth',
    'authentication',
    'authorization',
    'billing',
    'payment',
    'privacy',
    'pii',
  ].some((term) => haystack.includes(term))
}

function ownsRequiredWorkflowCapability(
  specialist: TeamOpsSpecialistProfile,
  requiredCapabilities: ReadonlySet<string>,
): boolean {
  return specialist.requiredCapabilities.some((capability) =>
    capability !== 'tool:repo.read' && requiredCapabilities.has(capability),
  )
}

function maxDispatchTier(left: TeamOpsDispatchTier, right: TeamOpsDispatchTier): TeamOpsDispatchTier {
  return dispatchTierRank(left) >= dispatchTierRank(right) ? left : right
}

function minDispatchTier(left: TeamOpsDispatchTier, right: TeamOpsDispatchTier): TeamOpsDispatchTier {
  return dispatchTierRank(left) <= dispatchTierRank(right) ? left : right
}

function nextDispatchTier(tier: TeamOpsDispatchTier): TeamOpsDispatchTier {
  if (tier === 'simple') return 'medium'
  if (tier === 'medium') return 'heavy'
  return 'full'
}

function previousDispatchTier(tier: TeamOpsDispatchTier): TeamOpsDispatchTier {
  if (tier === 'full') return 'heavy'
  if (tier === 'heavy') return 'medium'
  return 'simple'
}

function dispatchTierRank(tier: TeamOpsDispatchTier): number {
  if (tier === 'plan') return 1
  return {
    simple: 0,
    medium: 1,
    heavy: 2,
    full: 3,
  }[tier]
}

function evaluateRuntimeProfile(
  workflow: AgentOpsWorkflowDefinition,
  profile: AgentOpsRuntimeProfile,
  candidate: TeamOpsRuntimeCandidate | null,
): TeamOpsRuntimeCompatibility {
  const checks = workflow.requiredCapabilities.map((capability) => checkCapabilitySupport(workflow, profile, capability, candidate))
  const notes: string[] = []

  if (candidate?.unavailable) {
    notes.push('Runtime candidate is currently unavailable.')
  }

  if (candidate?.engine && !profile.supportedEngines.includes(candidate.engine)) {
    checks.push({
      capability: `runtime:${candidate.engine}`,
      supported: false,
      supportLevel: 'not_supported',
      reason: `${candidate.engine} is not supported by ${profile.label}.`,
    })
  }

  if (workflow.compatibleRuntimeModes.length > 0) {
    const profileModes: readonly AgentOpsRuntimeModeRequirement[] = RUNTIME_MODE_BY_PROFILE[profile.id]
    const matchesMode = workflow.compatibleRuntimeModes.some((mode) => profileModes.includes(mode))
    if (!matchesMode) {
      checks.push({
        capability: `runtime:${workflow.compatibleRuntimeModes.join('|')}`,
        supported: false,
        supportLevel: 'not_supported',
        reason: `${profile.label} does not match the workflow runtime-mode policy.`,
      })
    }
  }

  const missingCapabilities = checks
    .filter((check) => !check.supported)
    .map((check) => check.capability)
  const partialCapabilities = checks
    .filter((check) => check.supported && check.supportLevel === 'partial')
    .map((check) => check.capability)
  const compatible = !candidate?.unavailable && missingCapabilities.length === 0
  const supportLevel = !compatible ? 'not_supported' : partialCapabilities.length > 0 ? 'partial' : 'supported'

  if (profile.browserQa === 'partial' && workflow.requiredCapabilities.includes('advanced:browser-qa')) {
    notes.push(profile.notes)
  }

  return Object.freeze({
    profile,
    candidate,
    compatible,
    supportLevel,
    missingCapabilities,
    partialCapabilities,
    checks,
    notes,
  })
}

function checkCapabilitySupport(
  workflow: AgentOpsWorkflowDefinition,
  profile: AgentOpsRuntimeProfile,
  capability: AgentOpsCapabilityRequirement,
  candidate: TeamOpsRuntimeCandidate | null,
): TeamOpsCapabilityCheck {
  if (capability.startsWith('native:') || capability.startsWith('engine:')) {
    return checkNativeRuntimeCapability(capability, profile, candidate)
  }

  if (capability === 'advanced:browser-qa' || capability === 'tool:browser') {
    return {
      capability,
      supported: profile.browserQa === 'supported' || profile.browserQa === 'partial',
      supportLevel: profile.browserQa,
      reason: profile.browserQa === 'supported'
        ? `${profile.label} supports browser QA through the runtime/browser provider contract.`
        : profile.browserQa === 'partial'
          ? `${profile.label} requires gateway-backed browser control for Browser QA.`
          : `${profile.label} does not support Browser QA.`,
    }
  }

  if (capability === 'memory:project') {
    return supportLevelCheck(capability, profile.projectLearnings, `${profile.label} project learning support is ${profile.projectLearnings}.`)
  }

  if (capability.startsWith('memory:')) {
    return supportLevelCheck(capability, profile.memory, `${profile.label} memory support is ${profile.memory}.`)
  }

  if (capability === 'manage:orchestration') {
    return {
      capability,
      supported: true,
      supportLevel: 'supported',
      reason: `${profile.label} participates in the Pulse/Nerve Agent Ops orchestration contract.`,
    }
  }

  if (capability.startsWith('runtime:')) {
    return checkRuntimeModeSupport(capability, profile)
  }

  if (capability.startsWith('channel:')) {
    return {
      capability,
      supported: true,
      supportLevel: 'supported',
      reason: 'Channel capabilities are resolved by channel launch/report adapters, not engine-specific workflow code.',
    }
  }

  if (capability.startsWith('eval:')) {
    return {
      capability,
      supported: true,
      supportLevel: 'supported',
      reason: 'Eval capabilities are product projections and stay runtime/provider neutral.',
    }
  }

  if (capability.startsWith('tool:')) {
    return {
      capability,
      supported: true,
      supportLevel: 'supported',
      reason: `${capability} is resolved through shared tool contracts for ${workflow.id}.`,
    }
  }

  return {
    capability,
    supported: true,
    supportLevel: 'supported',
    reason: `${capability} is a product capability above the runtime adapter seam.`,
  }
}

function checkNativeRuntimeCapability(
  capability: AgentOpsCapabilityRequirement,
  profile: AgentOpsRuntimeProfile,
  candidate: TeamOpsRuntimeCandidate | null,
): TeamOpsCapabilityCheck {
  const required = capability.replace(/^(native|engine):/, '')
  const nativeCapability = candidate?.nativeCapabilities?.find((item) =>
    item.id === required
    || item.id.endsWith(`.${required}`)
    || item.kind === required,
  )

  if (!nativeCapability) {
    return {
      capability,
      supported: false,
      supportLevel: 'not_supported',
      reason: candidate
        ? `${candidate.label ?? candidate.id ?? profile.label} has not advertised ${required}.`
        : `${profile.label} needs a live runtime capability report for ${required}.`,
    }
  }

  const supported =
    nativeCapability.availability === 'available'
    || nativeCapability.availability === 'limited'
  return {
    capability,
    supported,
    supportLevel: nativeCapability.availability === 'limited' ? 'partial' : supported ? 'supported' : 'not_supported',
    reason: supported
      ? `${nativeCapability.label} is advertised by ${candidate?.label ?? profile.label}.`
      : `${nativeCapability.label} is advertised but ${nativeCapability.availability}.`,
  }
}

function supportLevelCheck(
  capability: AgentOpsCapabilityRequirement,
  supportLevel: AgentOpsSupportLevel,
  reason: string,
): TeamOpsCapabilityCheck {
  return {
    capability,
    supported: supportLevel === 'supported' || supportLevel === 'partial',
    supportLevel,
    reason,
  }
}

function checkRuntimeModeSupport(
  capability: AgentOpsCapabilityRequirement,
  profile: AgentOpsRuntimeProfile,
): TeamOpsCapabilityCheck {
  const requiredMode = capability.replace(/^runtime:/, '') as AgentOpsRuntimeModeRequirement
  const modes: readonly AgentOpsRuntimeModeRequirement[] = RUNTIME_MODE_BY_PROFILE[profile.id]
  return {
    capability,
    supported: modes.includes(requiredMode),
    supportLevel: modes.includes(requiredMode) ? 'supported' : 'not_supported',
    reason: modes.includes(requiredMode)
      ? `${profile.label} satisfies ${capability}.`
      : `${profile.label} does not satisfy ${capability}.`,
  }
}

function isReviewArmyMetadata(value: unknown): value is { specialists: string[] } {
  if (!value || typeof value !== 'object') return false
  const specialists = (value as { specialists?: unknown }).specialists
  return Array.isArray(specialists) && specialists.every((item) => typeof item === 'string')
}
