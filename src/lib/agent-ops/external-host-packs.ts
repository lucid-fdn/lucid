import {
  AGENT_OPS_CAPABILITY_SOURCE_VERSION,
  listAgentOpsBuiltinSkillSources,
  listAgentOpsProductCapabilities,
  listAgentOpsRuntimeProfiles,
} from './capability-source'
import {
  listBuiltInEvalScenarios,
} from './evals'
import { listReleaseQualityChecks } from './release-quality-gates'
import { listAgentOpsWorkflows } from './workflow-registry'
import { AGENT_OPS_OUTPUT_SECTIONS } from './workflow-types'

export const AGENT_OPS_EXTERNAL_HOST_PACK_VERSION = '2026-05-08.external-host-packs.v3'
export const AGENT_OPS_EXTERNAL_HOST_SOURCE_OF_TRUTH = 'Lucid Cloud / Mission Control'

export const AGENT_OPS_EXTERNAL_HOST_IDS = [
  'codex',
  'openclaw',
  'hermes',
  'claude-code',
  'cursor',
  'opencode',
] as const

export type AgentOpsExternalHostId = (typeof AGENT_OPS_EXTERNAL_HOST_IDS)[number]

export interface AgentOpsExternalHostPack {
  id: AgentOpsExternalHostId
  label: string
  hostFamily: 'coding_agent' | 'lucid_runtime' | 'ide_agent'
  installTarget: string
  fileName: string
  format: 'skill_markdown' | 'agent_instructions' | 'cursor_rule'
  supportedEngines: readonly string[]
  runtimeProfiles: readonly string[]
  description: string
  guardrails: readonly string[]
}

export interface AgentOpsExternalHostPackExport {
  version: string
  sourceVersion: string
  sourceOfTruth: string
  pack: AgentOpsExternalHostPack
  workflows: readonly {
    id: string
    slug: string
    name: string
    promise: string
    description: string
    executionMode: string
    requiredCapabilities: readonly string[]
    outputSections: readonly string[]
  }[]
  operatingContract: {
    outputSections: readonly string[]
    evidence: readonly string[]
    releaseQualityChecks: readonly string[]
    evalScenarios: readonly string[]
    runtimeProfiles: readonly string[]
    builtinSkills: readonly string[]
    capabilities: readonly string[]
  }
}

export interface AgentOpsExternalHostInstallerArtifact {
  hostId: AgentOpsExternalHostId
  label: string
  fileName: string
  installTarget: string
  format: AgentOpsExternalHostPack['format']
  contentType: string
  contentLength: number
  contentHash: string
  jsonUrl: string
  rawUrl: string
}

export interface AgentOpsExternalHostInstallerManifest {
  schemaVersion: 1
  version: string
  sourceVersion: string
  sourceOfTruth: string
  authority: 'lucid_cloud'
  baseUrl: string
  artifacts: readonly AgentOpsExternalHostInstallerArtifact[]
  rules: readonly string[]
}

const EXTERNAL_HOST_PACKS = Object.freeze([
  {
    id: 'codex',
    label: 'Codex',
    hostFamily: 'coding_agent',
    installTarget: '.agents/skills/lucid-agent-ops/SKILL.md',
    fileName: 'SKILL.md',
    format: 'skill_markdown',
    supportedEngines: ['openclaw', 'hermes', 'future'],
    runtimeProfiles: ['shared', 'c1_managed', 'c2a_autonomous'],
    description: 'Installable Codex skill for running Lucid Agent Ops methodology from a local coding-agent host.',
    guardrails: [
      'Use local tools for evidence gathering, but treat Lucid Cloud as the run ledger.',
      'Do not fork Agent Ops workflow definitions into local-only behavior.',
      'Record findings, evidence, risks, decisions, and next actions back to Mission Control.',
    ],
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    hostFamily: 'lucid_runtime',
    installTarget: '.openclaw/skills/lucid-agent-ops.md',
    fileName: 'lucid-agent-ops.md',
    format: 'agent_instructions',
    supportedEngines: ['openclaw'],
    runtimeProfiles: ['shared', 'c1_managed', 'c2a_autonomous'],
    description: 'OpenClaw runtime pack for shared, managed dedicated, and BYO Agent Ops execution.',
    guardrails: [
      'Use the Lucid runtime compatibility contract before choosing relay or runtime-native transport.',
      'Keep runtime-specific affordances behind the shared adapter, heartbeat, command, and EHV contracts.',
      'Never bypass Team Ops compatibility checks, TrustGate routing, or Mission Control mutation review.',
    ],
  },
  {
    id: 'hermes',
    label: 'Hermes',
    hostFamily: 'lucid_runtime',
    installTarget: '.hermes/skills/lucid-agent-ops.md',
    fileName: 'lucid-agent-ops.md',
    format: 'agent_instructions',
    supportedEngines: ['hermes'],
    runtimeProfiles: ['shared', 'c1_managed', 'c2a_autonomous'],
    description: 'Hermes runtime pack for shared, managed dedicated, and BYO Agent Ops execution with EHV/HHV state projection.',
    guardrails: [
      'Use relay or runtime-native transport only when the runtime compatibility contract allows it.',
      'Keep Hermes local-first home state portable through EHV/HHV snapshots, diffs, rollback, and Mission Control review.',
      'Never hide partial runtime warnings, probe failures, or management-command refusals from Mission Control.',
    ],
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    hostFamily: 'coding_agent',
    installTarget: '.claude/skills/lucid-agent-ops.md',
    fileName: 'lucid-agent-ops.md',
    format: 'agent_instructions',
    supportedEngines: ['future'],
    runtimeProfiles: ['shared'],
    description: 'Portable Claude Code instructions for following the Lucid Agent Ops operating contract.',
    guardrails: [
      'Use this as methodology and handoff guidance, not as an alternate runtime authority.',
      'Preserve the standard Agent Ops output sections on every workflow.',
      'Link evidence back to the Lucid run when a Lucid run id is available.',
    ],
  },
  {
    id: 'cursor',
    label: 'Cursor',
    hostFamily: 'ide_agent',
    installTarget: '.cursor/rules/lucid-agent-ops.mdc',
    fileName: 'lucid-agent-ops.mdc',
    format: 'cursor_rule',
    supportedEngines: ['future'],
    runtimeProfiles: ['shared'],
    description: 'Cursor rule pack for applying Lucid Agent Ops review, QA, ship, and release gates inside an IDE.',
    guardrails: [
      'Keep IDE assistance scoped to evidence collection and operator-facing summaries.',
      'Use Lucid workflows as the canonical names for review, QA, ship, canary, retro, and security work.',
      'Do not create hidden background workflows outside Lucid Cloud.',
    ],
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    hostFamily: 'coding_agent',
    installTarget: 'AGENTS.md',
    fileName: 'AGENTS.md',
    format: 'agent_instructions',
    supportedEngines: ['future'],
    runtimeProfiles: ['shared'],
    description: 'Generic AGENTS.md-compatible Agent Ops methodology pack for OpenCode-like future hosts.',
    guardrails: [
      'Use explicit workflow names and standard output sections.',
      'Ask before one-way safety decisions and expose reversible decisions in the final report.',
      'Keep local execution compatible with Lucid runtime and engine contracts.',
    ],
  },
] satisfies readonly AgentOpsExternalHostPack[])

function byId<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id))
}

function normalizeTitle(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function bullet(items: readonly string[]): string[] {
  return items.map((item) => `- ${item}`)
}

function compactList(items: readonly string[], limit: number): string[] {
  return items.length <= limit ? [...items] : [...items.slice(0, limit), `and ${items.length - limit} more`]
}

export function listAgentOpsExternalHostPacks(): AgentOpsExternalHostPack[] {
  return byId(EXTERNAL_HOST_PACKS)
}

export function getAgentOpsExternalHostPack(id: AgentOpsExternalHostId): AgentOpsExternalHostPack {
  const pack = EXTERNAL_HOST_PACKS.find((candidate) => candidate.id === id)
  if (!pack) {
    throw new Error(`Unknown Agent Ops external host pack: ${id}`)
  }
  return { ...pack }
}

export function buildAgentOpsExternalHostPack(input: {
  hostId: AgentOpsExternalHostId
}): AgentOpsExternalHostPackExport {
  const pack = getAgentOpsExternalHostPack(input.hostId)
  const workflows = listAgentOpsWorkflows().map((workflow) => ({
    id: workflow.id,
    slug: workflow.slug,
    name: workflow.name,
    promise: workflow.promise,
    description: workflow.description,
    executionMode: workflow.executionMode,
    requiredCapabilities: workflow.requiredCapabilities,
    outputSections: workflow.outputSections,
  }))
  const releaseQualityChecks = listReleaseQualityChecks().map((check) => check.id)
  const evalScenarios = listBuiltInEvalScenarios('model_benchmark').map((scenario) => scenario.slug)

  return Object.freeze({
    version: AGENT_OPS_EXTERNAL_HOST_PACK_VERSION,
    sourceVersion: AGENT_OPS_CAPABILITY_SOURCE_VERSION,
    sourceOfTruth: AGENT_OPS_EXTERNAL_HOST_SOURCE_OF_TRUTH,
    pack,
    workflows,
    operatingContract: {
      outputSections: AGENT_OPS_OUTPUT_SECTIONS,
      evidence: ['screenshots', 'logs', 'diffs', 'findings', 'approvals', 'eval scores', 'channel reports'],
      releaseQualityChecks,
      evalScenarios,
      runtimeProfiles: listAgentOpsRuntimeProfiles().map((profile) => profile.id),
      builtinSkills: listAgentOpsBuiltinSkillSources().map((skill) => skill.slug),
      capabilities: listAgentOpsProductCapabilities().map((capability) => capability.id),
    },
  })
}

export function buildAgentOpsExternalHostPackManifest() {
  return Object.freeze({
    version: AGENT_OPS_EXTERNAL_HOST_PACK_VERSION,
    sourceVersion: AGENT_OPS_CAPABILITY_SOURCE_VERSION,
    sourceOfTruth: AGENT_OPS_EXTERNAL_HOST_SOURCE_OF_TRUTH,
    packs: listAgentOpsExternalHostPacks().map((pack) => ({
      id: pack.id,
      label: pack.label,
      installTarget: pack.installTarget,
      format: pack.format,
      supportedEngines: pack.supportedEngines,
      runtimeProfiles: pack.runtimeProfiles,
    })),
  })
}

export function buildAgentOpsExternalHostInstallerManifest(input: {
  baseUrl?: string
} = {}): AgentOpsExternalHostInstallerManifest {
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const artifacts = listAgentOpsExternalHostPacks().map((pack) => {
    const instructions = renderAgentOpsExternalHostInstructions({ hostId: pack.id })
    return {
      hostId: pack.id,
      label: pack.label,
      fileName: pack.fileName,
      installTarget: pack.installTarget,
      format: pack.format,
      contentType: contentTypeForHostPack(pack.format),
      contentLength: new TextEncoder().encode(instructions).length,
      contentHash: hashAgentOpsExternalHostPackContent(instructions),
      jsonUrl: `${baseUrl}/api/agent-ops/external-host-packs/${pack.id}`,
      rawUrl: `${baseUrl}/api/agent-ops/external-host-packs/${pack.id}?format=raw`,
    } satisfies AgentOpsExternalHostInstallerArtifact
  })

  return Object.freeze({
    schemaVersion: 1,
    version: AGENT_OPS_EXTERNAL_HOST_PACK_VERSION,
    sourceVersion: AGENT_OPS_CAPABILITY_SOURCE_VERSION,
    sourceOfTruth: AGENT_OPS_EXTERNAL_HOST_SOURCE_OF_TRUTH,
    authority: 'lucid_cloud',
    baseUrl,
    artifacts,
    rules: Object.freeze([
      'Install artifacts are package UX only; Lucid Cloud remains the system of record.',
      'Installer clients should verify contentHash after fetching rawUrl.',
      'Installer clients must write only to installTarget and must not infer runtime behavior from host files.',
      'Workflow state, evidence, approvals, runtime compatibility, and channel status stay in Mission Control.',
    ]),
  })
}

export function validateAgentOpsExternalHostInstallerManifest(
  manifest: AgentOpsExternalHostInstallerManifest,
): { valid: true; errors: [] } | { valid: false; errors: string[] } {
  const errors: string[] = []
  const knownPacks = listAgentOpsExternalHostPacks()
  const knownIds = new Set(knownPacks.map((pack) => pack.id))
  const installTargets = new Set<string>()

  if (manifest.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1')
  }
  if (manifest.sourceOfTruth !== AGENT_OPS_EXTERNAL_HOST_SOURCE_OF_TRUTH) {
    errors.push('sourceOfTruth must be Lucid Cloud / Mission Control')
  }
  if (manifest.authority !== 'lucid_cloud') {
    errors.push('authority must be lucid_cloud')
  }
  if (manifest.artifacts.length !== knownPacks.length) {
    errors.push(`expected ${knownPacks.length} artifacts`)
  }

  for (const artifact of manifest.artifacts) {
    if (!knownIds.has(artifact.hostId)) {
      errors.push(`unknown hostId: ${artifact.hostId}`)
      continue
    }
    if (installTargets.has(artifact.installTarget)) {
      errors.push(`duplicate installTarget: ${artifact.installTarget}`)
    }
    installTargets.add(artifact.installTarget)

    const rendered = renderAgentOpsExternalHostInstructions({ hostId: artifact.hostId })
    if (artifact.contentHash !== hashAgentOpsExternalHostPackContent(rendered)) {
      errors.push(`contentHash mismatch for ${artifact.hostId}`)
    }
    if (artifact.contentLength !== new TextEncoder().encode(rendered).length) {
      errors.push(`contentLength mismatch for ${artifact.hostId}`)
    }
    if (!artifact.rawUrl.endsWith(`/api/agent-ops/external-host-packs/${artifact.hostId}?format=raw`)) {
      errors.push(`rawUrl mismatch for ${artifact.hostId}`)
    }
    if (!artifact.jsonUrl.endsWith(`/api/agent-ops/external-host-packs/${artifact.hostId}`)) {
      errors.push(`jsonUrl mismatch for ${artifact.hostId}`)
    }
  }

  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors }
}

export function renderAgentOpsExternalHostInstructions(input: {
  hostId: AgentOpsExternalHostId
}): string {
  const packExport = buildAgentOpsExternalHostPack(input)
  const { pack, operatingContract } = packExport
  const workflowLines = packExport.workflows.map((workflow) => (
    `- ${workflow.slug}: ${workflow.promise} Required capabilities: ${workflow.requiredCapabilities.join(', ')}.`
  ))
  const releaseLines = listReleaseQualityChecks().map((check) => (
    `- ${check.id}: ${check.promise}${check.required ? ' Required.' : ' Optional.'}`
  ))
  const evalLines = listBuiltInEvalScenarios('model_benchmark').map((scenario) => (
    `- ${scenario.slug}: ${scenario.assertion}`
  ))

  const body = [
    `# Lucid Agent Ops for ${pack.label}`,
    '',
    pack.description,
    '',
    '## Source Of Truth',
    '',
    `Lucid Cloud remains the system of record. Mission Control owns workflow state, run ids, evidence, findings, approvals, eval history, runtime compatibility, channel launch status, and provenance.`,
    '',
    'This host pack is install/package UX only. It gives external agents the same operating method, but it does not replace Lucid runtime dispatch, Team Ops policy, channel bridges, Browser Operator trust controls, or Mission Control.',
    '',
    '## Operating Contract',
    '',
    ...bullet([
      'Start from a named Lucid Agent Ops workflow whenever the task matches one.',
      `Always produce these sections: ${operatingContract.outputSections.map(normalizeTitle).join(', ')}.`,
      `Collect evidence through the host tools, then attach or summarize it back to ${AGENT_OPS_EXTERNAL_HOST_SOURCE_OF_TRUTH}.`,
      'Ask for one-way safety decisions before mutations, deploys, promotions, external sends, billing, auth, privacy, or data-migration actions.',
      'Do not fork workflow definitions into host-only behavior; use the generated pack as guidance and Lucid Cloud as authority.',
      'When runtime compatibility is partial, say so clearly and prefer the shared runtime instead of pretending parity.',
    ]),
    '',
    '## Workflows',
    '',
    ...workflowLines,
    '',
    '## Evidence Discipline',
    '',
    ...bullet(operatingContract.evidence),
    '',
    '## Knowledge, Context, And Pack Governance',
    '',
    ...bullet([
      'Use Workspace Brain, Lucid Knowledge, and shared operating context as the durable memory surface; do not create host-local memories as the source of truth.',
      'Brain runtime calls should go through the shared Brain/Knowledge contracts: query returns a bounded KnowledgePromptPacket plus resolved operating guidance, and remember writes through existing fact, guidance, document, and source stores.',
      'Brain Intake commits must use the canonical remember path; do not duplicate fact, context, source, or document persistence in host-local code.',
      'Knowledge Claims use evidence/explain/supersede/resolve/archive governance plus semantic fingerprints, cluster keys, embedding readiness, and Brain Ops semantic-conflict findings.',
      'Agent identity documents are agent-only: SOUL, USER, HEARTBEAT, MEMORY_POLICY, ACCESS_POLICY, TOOL_POLICY, CURRENT_CONTEXT.',
      'Workspace, project, team, agent, and user context uses shared records: thesis, signal, feedback, daily_intel, memory, decision, policy, risk, open_question.',
      'Commerce evidence should be linked as commerce_event provenance and can feed thesis, signal, feedback, Daily Intel, risk, or memory context records.',
      'Lucid Packs are setup UX with managed resource governance: reconcile managed resources, fork local edits when policy says fork_on_edit, and archive on uninstall.',
    ]),
    '',
    '## Release Quality Gates',
    '',
    ...releaseLines,
    '',
    '## Eval And Benchmark Discipline',
    '',
    ...evalLines,
    '',
    '## Runtime And Engine Fit',
    '',
    ...bullet([
      `Supported engines for this pack: ${pack.supportedEngines.join(', ')}.`,
      `Compatible runtime profiles: ${pack.runtimeProfiles.join(', ')}.`,
      `Known runtime profiles in Lucid: ${operatingContract.runtimeProfiles.join(', ')}.`,
      'External host packs must remain runtime and engine agnostic unless a host-specific instruction only describes how to call into Lucid.',
    ]),
    '',
    '## Host Guardrails',
    '',
    ...bullet(pack.guardrails),
    '',
    '## Built-In Lucid Capabilities To Respect',
    '',
    ...bullet(compactList(operatingContract.capabilities, 24)),
    '',
    '## Built-In Skill Sources',
    '',
    ...bullet(compactList(operatingContract.builtinSkills, 24)),
    '',
  ]

  if (pack.format === 'cursor_rule') {
    return [
      '---',
      `description: Lucid Agent Ops operating contract for ${pack.label}`,
      'alwaysApply: false',
      '---',
      '',
      ...body,
    ].join('\n')
  }

  return [
    '<!-- generated by scripts/generate-agent-ops-capability-docs.ts; do not edit by hand -->',
    '',
    ...body,
  ].join('\n')
}

export function contentTypeForHostPack(format: AgentOpsExternalHostPack['format']): string {
  if (format === 'cursor_rule') {
    return 'text/plain; charset=utf-8'
  }

  return 'text/markdown; charset=utf-8'
}

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? '').replace(/\/+$/, '')
}

export function hashAgentOpsExternalHostPackContent(content: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`
}
