import { AGENT_OPS_WORKFLOWS } from './workflow-registry'
import type {
  AgentOpsCapabilityRequirement,
  AgentOpsWorkflowDefinition,
} from './workflow-types'

export const AGENT_OPS_CAPABILITY_SOURCE_VERSION = '2026-05-07.agent-ops.v4'

export type AgentOpsEngineId = 'lucid' | 'openclaw' | 'hermes' | 'future'
export type AgentOpsRuntimeProfileId = 'shared' | 'c1_managed' | 'c2a_autonomous'
export type AgentOpsChannelId =
  | 'web'
  | 'discord'
  | 'telegram'
  | 'slack'
  | 'msteams'
  | 'whatsapp'
  | 'imessage'
export type AgentOpsSupportLevel = 'supported' | 'partial' | 'deferred' | 'not_supported' | 'not_applicable'

export interface AgentOpsCapabilityNamespace {
  prefix: `${string}:`
  label: string
  owner: 'mission_control' | 'agent_ops' | 'runtime' | 'channel' | 'memory' | 'eval' | 'tool' | 'skill'
  description: string
}

export interface AgentOpsProductCapability {
  id: AgentOpsCapabilityRequirement
  label: string
  source: 'mission_control' | 'agent_ops'
  description: string
}

export interface AgentOpsRuntimeProfile {
  id: AgentOpsRuntimeProfileId
  label: string
  deploymentModel: 'shared_compute' | 'managed_dedicated' | 'autonomous_dedicated'
  supportedEngines: readonly AgentOpsEngineId[]
  pulseContract: 'direct_consumer' | 'control_plane_relay' | 'native_optional'
  channelOwnership: ReadonlyArray<'lucid_relay' | 'runtime_native'>
  browserQa: AgentOpsSupportLevel
  memory: AgentOpsSupportLevel
  projectLearnings: AgentOpsSupportLevel
  notes: string
}

export interface AgentOpsChannelCapability {
  id: AgentOpsChannelId
  label: string
  hosted: AgentOpsSupportLevel
  managedOutbound: AgentOpsSupportLevel
  runtimeNative: AgentOpsSupportLevel
  agentSwitching: AgentOpsSupportLevel
  aliasesAndDefaults: AgentOpsSupportLevel
  streamingUx: AgentOpsSupportLevel
  mediaAndVoice: AgentOpsSupportLevel
  sourceDoc: string
  notes: string
}

export interface AgentOpsBuiltinSkillSource {
  slug: string
  name: string
  loadPolicy: 'always' | 'wallet_enabled' | 'trading_enabled' | 'integration_plugin_installed'
  engineSupport: readonly AgentOpsEngineId[]
  runtimeProfiles: readonly AgentOpsRuntimeProfileId[]
  sourceRef: string
  purpose: string
}

const CAPABILITY_NAMESPACES = Object.freeze([
  {
    prefix: 'core:',
    label: 'Core platform',
    owner: 'mission_control',
    description: 'Always-on Mission Control and replay capabilities.',
  },
  {
    prefix: 'standard:',
    label: 'Standard product',
    owner: 'mission_control',
    description: 'Standard Lucid modules available across supported deployment modes.',
  },
  {
    prefix: 'advanced:',
    label: 'Advanced product',
    owner: 'mission_control',
    description: 'Plan-gated Agent Ops, Browser Operator, eval, release, and security modules.',
  },
  {
    prefix: 'manage:',
    label: 'Managed orchestration',
    owner: 'mission_control',
    description: 'DAG and operator-controlled orchestration capabilities.',
  },
  {
    prefix: 'runtime:',
    label: 'Runtime model',
    owner: 'runtime',
    description: 'Runtime flavor, isolation, and ownership requirements.',
  },
  {
    prefix: 'channel:',
    label: 'Channel surface',
    owner: 'channel',
    description: 'Channel-specific transport, media, and interaction requirements.',
  },
  {
    prefix: 'tool:',
    label: 'Tooling',
    owner: 'tool',
    description: 'Tool access requirements such as browser control or repository reads.',
  },
  {
    prefix: 'memory:',
    label: 'Memory',
    owner: 'memory',
    description: 'Project, assistant, board, or semantic memory requirements.',
  },
  {
    prefix: 'eval:',
    label: 'Eval',
    owner: 'eval',
    description: 'Eval-center and regression-scoring requirements.',
  },
  {
    prefix: 'skill:',
    label: 'Skill',
    owner: 'skill',
    description: 'Prompt skill package requirements.',
  },
  {
    prefix: 'browser:',
    label: 'Browser procedures',
    owner: 'agent_ops',
    description: 'Browser Operator procedure, host playbook, live-session, handoff, and trust-shield requirements.',
  },
  {
    prefix: 'design:',
    label: 'Design intelligence',
    owner: 'agent_ops',
    description: 'Design review and taste-profile requirements used by Agent Ops design workflows.',
  },
  {
    prefix: 'decision:',
    label: 'Decision pacing',
    owner: 'agent_ops',
    description: 'Decision pacing, silent decision, and interruption-control requirements.',
  },
]) satisfies readonly AgentOpsCapabilityNamespace[]

const PRODUCT_CAPABILITIES = Object.freeze([
  {
    id: 'advanced:agent-ops',
    label: 'Agent Ops',
    source: 'mission_control',
    description: 'Workflow, evidence, finding, approval, and run projection surface.',
  },
  {
    id: 'advanced:browser-qa',
    label: 'Browser Operator',
    source: 'mission_control',
    description: 'Shared browser observe/test/extract/operate capability through the provider/gateway contract.',
  },
  {
    id: 'advanced:browser-procedures',
    label: 'Browser Procedures',
    source: 'mission_control',
    description: 'Reusable, host-scoped Browser Operator playbooks learned from runs and governed by trust state.',
  },
  {
    id: 'advanced:browser-trust-shield',
    label: 'Browser Trust Shield',
    source: 'mission_control',
    description: 'Approval, fixture, and provenance controls for replaying browser procedures safely across runtimes.',
  },
  {
    id: 'advanced:eval-center',
    label: 'Eval Center',
    source: 'mission_control',
    description: 'Scenario scoring and regression history for workflows, models, runtimes, and channels.',
  },
  {
    id: 'advanced:project-learnings',
    label: 'Project Learnings',
    source: 'mission_control',
    description: 'Project memory and decision preferences injected through the shared memory seam.',
  },
  {
    id: 'advanced:release-gates',
    label: 'Release Gates',
    source: 'mission_control',
    description: 'Human approval and release-readiness gating for ship/canary workflows.',
  },
  {
    id: 'advanced:product-quality',
    label: 'Product Quality Gates',
    source: 'mission_control',
    description: 'Release, docs, PR title, version, screenshot, regression-test, jargon, and AI-slop quality gates.',
  },
  {
    id: 'eval:quality-gate-pack',
    label: 'Quality Gate Pack',
    source: 'agent_ops',
    description: 'CI-friendly gate manifest for production preflight, release-quality, eval, host-pack, runtime, stress, and diff hygiene checks.',
  },
  {
    id: 'advanced:security-posture',
    label: 'Security Posture',
    source: 'mission_control',
    description: 'Security review, trust guard, and prompt-injection attempt observability.',
  },
  {
    id: 'manage:orchestration',
    label: 'DAG Orchestration',
    source: 'mission_control',
    description: 'Nerve/Pulse-backed multi-step Agent Ops execution.',
  },
  {
    id: 'core:approvals',
    label: 'Approvals',
    source: 'mission_control',
    description: 'Operator approval gates shared by workflows and runtimes.',
  },
  {
    id: 'core:replay',
    label: 'Run Replay',
    source: 'mission_control',
    description: 'Replayable run and evidence history.',
  },
  {
    id: 'standard:system',
    label: 'System',
    source: 'mission_control',
    description: 'System health and runtime observability support.',
  },
  {
    id: 'tool:browser',
    label: 'Browser Tooling',
    source: 'agent_ops',
    description: 'Browser-control provider access without coupling workflows to a concrete browser engine.',
  },
  {
    id: 'tool:repo.read',
    label: 'Repository Read',
    source: 'agent_ops',
    description: 'Read-only repository or diff access for investigation and review workflows.',
  },
  {
    id: 'memory:project',
    label: 'Project Memory',
    source: 'agent_ops',
    description: 'Bounded project learning and decision-preference recall.',
  },
]) satisfies readonly AgentOpsProductCapability[]

const RUNTIME_PROFILES = Object.freeze([
  {
    id: 'shared',
    label: 'Shared',
    deploymentModel: 'shared_compute',
    supportedEngines: ['lucid', 'openclaw', 'hermes', 'future'],
    pulseContract: 'direct_consumer',
    channelOwnership: ['lucid_relay'],
    browserQa: 'partial',
    memory: 'supported',
    projectLearnings: 'supported',
    notes: 'Shared compute consumes Pulse directly and must use gateway-backed browser control rather than launching local browsers in-process.',
  },
  {
    id: 'c1_managed',
    label: 'C1 Managed Dedicated',
    deploymentModel: 'managed_dedicated',
    supportedEngines: ['openclaw', 'hermes', 'future'],
    pulseContract: 'native_optional',
    channelOwnership: ['lucid_relay', 'runtime_native'],
    browserQa: 'supported',
    memory: 'supported',
    projectLearnings: 'supported',
    notes: 'Lucid-operated dedicated runtimes can use relay or runtime-native transport where supported while preserving Lucid-owned governance, approvals, evidence, memory injection, and sanitized operator visibility.',
  },
  {
    id: 'c2a_autonomous',
    label: 'C2A Autonomous Dedicated',
    deploymentModel: 'autonomous_dedicated',
    supportedEngines: ['openclaw', 'hermes', 'future'],
    pulseContract: 'native_optional',
    channelOwnership: ['lucid_relay', 'runtime_native'],
    browserQa: 'supported',
    memory: 'supported',
    projectLearnings: 'supported',
    notes: 'BYO runtimes can use relay or runtime-native behavior where the adapter supports it; Lucid receives heartbeat, probe, command, evidence, and EHV state through the shared contract.',
  },
]) satisfies readonly AgentOpsRuntimeProfile[]

const CHANNEL_CAPABILITIES = Object.freeze([
  {
    id: 'web',
    label: 'Web',
    hosted: 'supported',
    managedOutbound: 'not_applicable',
    runtimeNative: 'not_applicable',
    agentSwitching: 'supported',
    aliasesAndDefaults: 'supported',
    streamingUx: 'supported',
    mediaAndVoice: 'partial',
    sourceDoc: 'docs/channels/support-matrix.md',
    notes: 'First-party web is the richest UI for pickers, evidence, approvals, and replay.',
  },
  {
    id: 'discord',
    label: 'Discord',
    hosted: 'supported',
    managedOutbound: 'supported',
    runtimeNative: 'supported',
    agentSwitching: 'supported',
    aliasesAndDefaults: 'supported',
    streamingUx: 'supported',
    mediaAndVoice: 'supported',
    sourceDoc: 'docs/channels/support-matrix.md',
    notes: 'Hosted commands, guild defaults, voice replies, transcription, and streamed/edit-in-place UX are active.',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    hosted: 'supported',
    managedOutbound: 'supported',
    runtimeNative: 'deferred',
    agentSwitching: 'supported',
    aliasesAndDefaults: 'partial',
    streamingUx: 'partial',
    mediaAndVoice: 'supported',
    sourceDoc: 'docs/channels/support-matrix.md',
    notes: 'Hosted chat UX and dynamic reply targeting are live; generalized unbound-chat surface defaults remain limited.',
  },
  {
    id: 'slack',
    label: 'Slack',
    hosted: 'supported',
    managedOutbound: 'supported',
    runtimeNative: 'supported',
    agentSwitching: 'supported',
    aliasesAndDefaults: 'supported',
    streamingUx: 'partial',
    mediaAndVoice: 'partial',
    sourceDoc: 'docs/channels/support-matrix.md',
    notes: 'Explicit bind, workspace defaults, aliases, App Home, modal pickers, and thread preservation are supported.',
  },
  {
    id: 'msteams',
    label: 'Microsoft Teams',
    hosted: 'supported',
    managedOutbound: 'supported',
    runtimeNative: 'supported',
    agentSwitching: 'supported',
    aliasesAndDefaults: 'supported',
    streamingUx: 'partial',
    mediaAndVoice: 'partial',
    sourceDoc: 'docs/channels/support-matrix.md',
    notes: 'Tenant defaults, per-conversation overrides, Agent Ops commands, and service URL persistence are supported.',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    hosted: 'supported',
    managedOutbound: 'supported',
    runtimeNative: 'not_supported',
    agentSwitching: 'supported',
    aliasesAndDefaults: 'supported',
    streamingUx: 'not_supported',
    mediaAndVoice: 'supported',
    sourceDoc: 'docs/channels/support-matrix.md',
    notes: 'Meta Cloud API remains the transport; hosted defaults, aliases, voice notes, transcription, and voice replies are active.',
  },
  {
    id: 'imessage',
    label: 'iMessage',
    hosted: 'supported',
    managedOutbound: 'supported',
    runtimeNative: 'not_supported',
    agentSwitching: 'supported',
    aliasesAndDefaults: 'supported',
    streamingUx: 'not_supported',
    mediaAndVoice: 'partial',
    sourceDoc: 'docs/channels/support-matrix.md',
    notes: 'Hosted provider-plane routing, defaults, aliases, Agent Ops commands, provider heartbeat, and dispatch queue are supported.',
  },
]) satisfies readonly AgentOpsChannelCapability[]

const BUILTIN_SKILL_SOURCES = Object.freeze([
  {
    slug: 'lucid-market-intelligence',
    name: 'Lucid Market Intelligence',
    loadPolicy: 'always',
    engineSupport: ['openclaw', 'hermes', 'future'],
    runtimeProfiles: ['shared', 'c1_managed', 'c2a_autonomous'],
    sourceRef: 'agent-skills:builtin-skills',
    purpose: 'Market context, risk framing, and research guidance for trading and crypto-aware assistants.',
  },
  {
    slug: 'lucid-integration-workflow',
    name: 'Lucid Integration Workflow',
    loadPolicy: 'integration_plugin_installed',
    engineSupport: ['openclaw', 'hermes', 'future'],
    runtimeProfiles: ['shared', 'c1_managed', 'c2a_autonomous'],
    sourceRef: 'agent-skills:builtin-skills',
    purpose: 'Generated integration guidance assembled from installed provider playbooks.',
  },
  {
    slug: 'lucid-swap-direction',
    name: 'Lucid Swap Direction',
    loadPolicy: 'wallet_enabled',
    engineSupport: ['openclaw', 'hermes', 'future'],
    runtimeProfiles: ['shared', 'c1_managed', 'c2a_autonomous'],
    sourceRef: 'agent-skills:builtin-skills',
    purpose: 'Routes wallet, swap, funding, portfolio, and transaction intents to the right Web3 capability.',
  },
  {
    slug: 'lucid-swap-execution',
    name: 'Lucid Swap Execution',
    loadPolicy: 'trading_enabled',
    engineSupport: ['openclaw', 'hermes', 'future'],
    runtimeProfiles: ['shared', 'c1_managed', 'c2a_autonomous'],
    sourceRef: 'agent-skills:builtin-skills',
    purpose: 'Trading-mode execution guidance for swaps, quotes, confirmations, and risk controls.',
  },
  {
    slug: 'lucid-cross-chain-funding',
    name: 'Lucid Cross-Chain Funding',
    loadPolicy: 'trading_enabled',
    engineSupport: ['openclaw', 'hermes', 'future'],
    runtimeProfiles: ['shared', 'c1_managed', 'c2a_autonomous'],
    sourceRef: 'agent-skills:builtin-skills',
    purpose: 'Cross-chain funding and bridging guidance for agents with trading capabilities enabled.',
  },
  {
    slug: 'web3-reader',
    name: 'Web3 Reader',
    loadPolicy: 'wallet_enabled',
    engineSupport: ['openclaw', 'hermes', 'future'],
    runtimeProfiles: ['shared', 'c1_managed', 'c2a_autonomous'],
    sourceRef: 'agent-skills:builtin-skills',
    purpose: 'Read-only wallet, portfolio, token, and on-chain research guidance.',
  },
]) satisfies readonly AgentOpsBuiltinSkillSource[]

function byId<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id))
}

function bySlug<T extends { slug: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.slug.localeCompare(b.slug))
}

export function listAgentOpsCapabilityNamespaces(): AgentOpsCapabilityNamespace[] {
  return [...CAPABILITY_NAMESPACES]
}

export function listAgentOpsProductCapabilities(): AgentOpsProductCapability[] {
  return byId(PRODUCT_CAPABILITIES)
}

export function listAgentOpsRuntimeProfiles(): AgentOpsRuntimeProfile[] {
  return byId(RUNTIME_PROFILES)
}

export function listAgentOpsChannelCapabilities(): AgentOpsChannelCapability[] {
  return byId(CHANNEL_CAPABILITIES)
}

export function listAgentOpsBuiltinSkillSources(): AgentOpsBuiltinSkillSource[] {
  return bySlug(BUILTIN_SKILL_SOURCES)
}

export function isKnownAgentOpsCapabilityRequirement(requirement: AgentOpsCapabilityRequirement): boolean {
  if (PRODUCT_CAPABILITIES.some((capability) => capability.id === requirement)) {
    return true
  }

  return CAPABILITY_NAMESPACES.some((namespace) => requirement.startsWith(namespace.prefix))
}

export function getUnknownWorkflowCapabilityRequirements(
  workflows: readonly AgentOpsWorkflowDefinition[] = AGENT_OPS_WORKFLOWS,
): AgentOpsCapabilityRequirement[] {
  const requirements = new Set<AgentOpsCapabilityRequirement>()

  for (const workflow of workflows) {
    for (const requirement of workflow.requiredCapabilities) {
      if (!isKnownAgentOpsCapabilityRequirement(requirement)) {
        requirements.add(requirement)
      }
    }
  }

  return [...requirements].sort()
}

export function buildAgentOpsCapabilitySourceSnapshot() {
  return Object.freeze({
    version: AGENT_OPS_CAPABILITY_SOURCE_VERSION,
    namespaces: listAgentOpsCapabilityNamespaces(),
    productCapabilities: listAgentOpsProductCapabilities(),
    runtimeProfiles: listAgentOpsRuntimeProfiles(),
    channelCapabilities: listAgentOpsChannelCapabilities(),
    builtinSkills: listAgentOpsBuiltinSkillSources(),
  })
}
