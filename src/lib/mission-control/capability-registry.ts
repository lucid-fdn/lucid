/**
 * Mission Control — Capability Registry
 *
 * Static array declaring capabilities with modes and plan requirements.
 * Only Phase 1-3 entries populated initially. Add entries as phases ship.
 */

import type { CapabilityEntry } from './capabilities'
import type {
  RuntimeCapabilityKey,
  RuntimeCapabilityRegistryEntry,
  RuntimeCapabilitySupport,
  RuntimeCapabilitySurface,
} from '@contracts/runtime-capabilities'

export const CAPABILITY_REGISTRY: CapabilityEntry[] = [
  // ─── Phase 1: Command Center + Approvals + Controls ───
  {
    id: 'core:command-center',
    label: 'Command Center',
    module: 'command-center',
    modes: ['saas', 'self-hosted', 'hybrid'],
  },
  {
    id: 'core:agents',
    label: 'Agent List',
    module: 'command-center',
    modes: ['saas', 'self-hosted', 'hybrid'],
  },
  {
    id: 'core:live-feed',
    label: 'Live Feed',
    module: 'command-center',
    modes: ['saas', 'self-hosted', 'hybrid'],
  },
  {
    id: 'core:approvals',
    label: 'Approvals',
    module: 'command-center',
    modes: ['saas', 'self-hosted', 'hybrid'],
  },
  {
    id: 'core:controls',
    label: 'Agent Controls',
    module: 'command-center',
    modes: ['saas', 'self-hosted', 'hybrid'],
  },

  // ─── Phase 2: Replay + Guardrails ───
  {
    id: 'core:replay',
    label: 'Run Replay',
    module: 'replay',
    modes: ['saas', 'self-hosted', 'hybrid'],
  },

  // Phase 3: Proof Receipts
  {
    id: 'advanced:proof-explorer',
    label: 'Proof Receipts',
    module: 'proof-explorer',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'pro',
  },

  // ─── Phase 4: Expanded Dashboard ───
  {
    id: 'standard:conversations',
    label: 'Conversations',
    module: 'conversations',
    modes: ['saas', 'self-hosted', 'hybrid'],
  },
  {
    id: 'standard:integrations',
    label: 'Integrations',
    module: 'integrations',
    modes: ['saas', 'self-hosted', 'hybrid'],
  },
  {
    id: 'standard:economics',
    label: 'Spend',
    module: 'economics',
    modes: ['saas', 'self-hosted', 'hybrid'],
  },
  {
    id: 'standard:system',
    label: 'System',
    module: 'system',
    modes: ['saas', 'self-hosted', 'hybrid'],
  },
  {
    id: 'advanced:health-score',
    label: 'Health Score',
    module: 'agents',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'pro',
  },
  {
    id: 'selfhosted:system-metrics',
    label: 'System Metrics',
    module: 'system',
    modes: ['self-hosted', 'hybrid'],
  },
  {
    id: 'selfhosted:worker-health',
    label: 'Worker Health',
    module: 'system',
    modes: ['self-hosted', 'hybrid'],
  },

  // ─── Phase 5: Intelligence + Optimizer + Remediation ───
  {
    id: 'advanced:conversation-intel',
    label: 'Conversation Intelligence',
    module: 'conversations',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'pro',
  },
  {
    id: 'advanced:cost-optimizer',
    label: 'Cost Optimizer',
    module: 'economics',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'pro',
  },
  {
    id: 'advanced:auto-remediation',
    label: 'Auto-Remediation',
    module: 'system',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'pro',
  },

  // ─── Agent Ops: durable workflow/evidence layer ───
  {
    id: 'advanced:agent-ops',
    label: 'Agent Ops',
    module: 'work-items',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'pro',
  },
  {
    id: 'advanced:eval-center',
    label: 'Eval Center',
    module: 'experiments',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'business',
  },
  {
    id: 'advanced:browser-qa',
    label: 'Browser Operator',
    module: 'replay',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'pro',
  },
  {
    id: 'advanced:browser-procedures',
    label: 'Browser Procedures',
    module: 'replay',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'pro',
  },
  {
    id: 'advanced:browser-trust-shield',
    label: 'Browser Trust Shield',
    module: 'replay',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'business',
  },
  {
    id: 'advanced:project-learnings',
    label: 'Project Learnings',
    module: 'work-items',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'pro',
  },
  {
    id: 'advanced:release-gates',
    label: 'Release Gates',
    module: 'work-items',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'business',
  },
  {
    id: 'advanced:product-quality',
    label: 'Product Quality Gates',
    module: 'work-items',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'business',
  },
  {
    id: 'advanced:security-posture',
    label: 'Security Posture',
    module: 'system',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'business',
  },

  // ─── Phase 7: Time-Travel ───
  {
    id: 'advanced:time-travel',
    label: 'Time-Travel Debugger',
    module: 'replay',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'business',
  },

  // ─── Phase 8: A/B Testing + Canvas ───
  {
    id: 'advanced:ab-testing',
    label: 'A/B Testing',
    module: 'experiments',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'business',
  },
  {
    id: 'advanced:canvas',
    label: 'Live Canvas',
    module: 'canvas',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'pro',
  },

  // ─── Runtime Tiers ───
  {
    id: 'runtime:dedicated',
    label: 'Dedicated Runtimes',
    module: 'system',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'pro',
  },
  {
    id: 'runtime:byo',
    label: 'BYO Runtimes',
    module: 'system',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'business',
  },

  // Orchestration
  {
    id: 'manage:orchestration',
    label: 'Workflow Templates',
    module: 'orchestration',
    modes: ['saas', 'self-hosted', 'hybrid'],
    minPlan: 'pro',
  },

  // ─── Human work items (Pulse + Nerve human integration) ───
  {
    id: 'standard:work-items',
    label: 'Work',
    module: 'work-items',
    modes: ['saas', 'self-hosted', 'hybrid'],
  },
]

type RuntimeCapabilityRegistryConfigEntry =
  Omit<RuntimeCapabilityRegistryEntry, 'reviewRequiredByDefault'> &
  Partial<Pick<RuntimeCapabilityRegistryEntry, 'reviewRequiredByDefault'>>

export const RUNTIME_CAPABILITY_REGISTRY: RuntimeCapabilityRegistryConfigEntry[] = [
  {
    key: 'agent_ops.run',
    label: 'Agent Ops execution',
    category: 'agent_ops',
    description: 'Launch and track executable Agent Ops runs through Lucid.',
  },
  {
    key: 'agent_ops.plan_only',
    label: 'Plan-only mode',
    category: 'agent_ops',
    description: 'Produce plans and reviewable work without taking mutations.',
  },
  {
    key: 'agent_ops.review_candidates',
    label: 'Reviewable candidates',
    category: 'agent_ops',
    description: 'Convert risky mutations into candidates that can be reviewed before apply.',
    reviewRequiredByDefault: true,
  },
  {
    key: 'browser.read',
    label: 'Browser inspection',
    category: 'browser',
    description: 'Open, inspect, and report on browser pages with provenance.',
  },
  {
    key: 'browser.mutate',
    label: 'Browser mutation',
    category: 'browser',
    description: 'Perform trusted browser actions behind policy and Trust Shield checks.',
    reviewRequiredByDefault: true,
  },
  {
    key: 'browser.trust_shield',
    label: 'Trust Shield',
    category: 'browser',
    description: 'Apply SSRF, prompt-injection, private-network, and host-policy checks.',
  },
  {
    key: 'browser.handoff',
    label: 'Browser handoff',
    category: 'browser',
    description: 'Hand active browser sessions to an operator or compatible runtime.',
  },
  {
    key: 'channels.native',
    label: 'Channel-native commands',
    category: 'channels',
    description: 'Normalize Slack, Discord, Telegram, WhatsApp, Teams, and iMessage commands.',
  },
  {
    key: 'engine_home.snapshot',
    label: 'Engine memory snapshots',
    category: 'engine_home',
    description: 'Read engine memory state through relative, reviewable snapshots.',
  },
  {
    key: 'engine_home.diff',
    label: 'Engine memory diffs',
    category: 'engine_home',
    description: 'Produce reviewable diffs for engine memory changes.',
  },
  {
    key: 'engine_home.archive',
    label: 'Engine memory archives',
    category: 'engine_home',
    description: 'Archive engine memory state without direct control-plane ownership.',
  },
  {
    key: 'engine_home.candidate',
    label: 'Engine memory candidates',
    category: 'engine_home',
    description: 'Propose memory, skill, and filesystem changes as candidates.',
    reviewRequiredByDefault: true,
  },
  {
    key: 'eval.cross_provider',
    label: 'Cross-provider eval receipts',
    category: 'evals',
    description: 'Judge output across multiple providers or deterministic judge classes and store receipts.',
  },
  {
    key: 'knowledge.read',
    label: 'Knowledge read',
    category: 'knowledge',
    description: 'Read Knowledge pages, claims, evidence, and context.',
  },
  {
    key: 'knowledge.write',
    label: 'Knowledge write',
    category: 'knowledge',
    description: 'Write evidence-backed Knowledge pages, claims, and imports.',
    reviewRequiredByDefault: true,
  },
  {
    key: 'knowledge.claims',
    label: 'Knowledge claims',
    category: 'knowledge',
    description: 'Create, list, supersede, resolve, explain, and govern claims.',
  },
  {
    key: 'knowledge.think',
    label: 'Knowledge Think',
    category: 'knowledge',
    description: 'Run evidence-aware research and synthesis over scoped Knowledge.',
  },
  {
    key: 'knowledge.forget',
    label: 'Knowledge forget',
    category: 'knowledge',
    description: 'Archive or suppress governed Knowledge records by id.',
    reviewRequiredByDefault: true,
  },
  {
    key: 'l2.project',
    label: 'Lucid-L2 projection',
    category: 'l2',
    description: 'Project commitments and proof references to optional Lucid-L2 identity/storage rails.',
  },
  {
    key: 'runtime.session',
    label: 'Runtime sessions',
    category: 'runtime',
    description: 'Expose runtime session ids, reuse policies, and lifecycle controls.',
  },
  {
    key: 'runtime.services',
    label: 'Runtime services',
    category: 'runtime',
    description: 'Expose runtime-owned services such as MCP, browser, or local app services.',
  },
  {
    key: 'runtime.native_channels',
    label: 'Runtime-native channels',
    category: 'runtime',
    description: 'Allow a runtime to own a native channel surface when policy permits it.',
  },
]

type RuntimeEngine = RuntimeCapabilitySurface['engine']
type RuntimeFlavor = RuntimeCapabilitySurface['runtimeFlavor']

export interface BuildRuntimeCapabilitySurfaceInput {
  engine: RuntimeEngine
  runtimeFlavor: RuntimeFlavor
  adapterType?: string | null
  adapterCapabilities?: RuntimeCapabilitySupport[]
  browserOperatorEnabled?: boolean
  l2Enabled?: boolean
}

export function buildRuntimeCapabilitySurface(input: BuildRuntimeCapabilitySurfaceInput): RuntimeCapabilitySurface {
  const base = new Map<RuntimeCapabilityKey, RuntimeCapabilitySupport>()
  for (const entry of RUNTIME_CAPABILITY_REGISTRY) {
    base.set(entry.key, {
      key: entry.key,
      status: defaultCapabilityStatus(entry.key, input),
      source: defaultCapabilitySource(entry.key),
      notes: defaultCapabilityNotes(entry.key, input),
      requiredReview: entry.reviewRequiredByDefault ?? false,
      requiredPolicyKeys: defaultCapabilityPolicyKeys(entry.key),
    })
  }

  for (const override of input.adapterCapabilities ?? []) {
    base.set(override.key, {
      ...base.get(override.key),
      ...override,
      notes: [
        ...(base.get(override.key)?.notes ?? []),
        ...override.notes,
      ],
    })
  }

  return {
    engine: input.engine,
    runtimeFlavor: input.runtimeFlavor,
    adapterType: input.adapterType ?? null,
    generatedAt: new Date().toISOString(),
    capabilities: [...base.values()],
  }
}

export function runtimeSupportsCapability(
  surface: RuntimeCapabilitySurface,
  capabilityKey: RuntimeCapabilityKey,
): boolean {
  const capability = surface.capabilities.find((item) => item.key === capabilityKey)
  return capability?.status === 'supported' || capability?.status === 'partial'
}

function defaultCapabilityStatus(
  key: RuntimeCapabilityKey,
  input: BuildRuntimeCapabilitySurfaceInput,
): RuntimeCapabilitySupport['status'] {
  if (key.startsWith('browser.')) {
    if (!input.browserOperatorEnabled) return 'unsupported'
    if (key === 'browser.mutate' && input.runtimeFlavor === 'shared') return 'partial'
    return 'supported'
  }
  if (key === 'runtime.native_channels') {
    return input.runtimeFlavor === 'c2a_autonomous' ? 'supported' : 'partial'
  }
  if (key === 'l2.project') return input.l2Enabled ? 'supported' : 'partial'
  if (key === 'engine_home.candidate') return 'supported'
  if (key === 'engine_home.diff' || key === 'engine_home.snapshot' || key === 'engine_home.archive') return 'supported'
  if (input.engine === 'hermes' && key === 'browser.handoff') return 'partial'
  return 'supported'
}

function defaultCapabilitySource(key: RuntimeCapabilityKey): RuntimeCapabilitySupport['source'] {
  if (key.startsWith('engine_home.')) return 'adapter'
  if (key.startsWith('browser.')) return 'lucid_core'
  if (key === 'runtime.native_channels' || key === 'runtime.services' || key === 'runtime.session') return 'runtime'
  return 'lucid_core'
}

function defaultCapabilityNotes(
  key: RuntimeCapabilityKey,
  input: BuildRuntimeCapabilitySurfaceInput,
): string[] {
  const notes: string[] = []
  if (key === 'browser.mutate' && input.runtimeFlavor === 'shared') {
    notes.push('Shared runtimes require Trust Shield and reviewable procedure gates for browser mutations.')
  }
  if (key === 'l2.project' && !input.l2Enabled) {
    notes.push('Lucid-L2/web3 identity is optional; local Knowledge and identity documents remain valid without it.')
  }
  if (key === 'engine_home.candidate') {
    notes.push('Direct control-plane ownership of runtime files is blocked; use relative paths, snapshots, diffs, archives, and candidates.')
  }
  return notes
}

function defaultCapabilityPolicyKeys(key: RuntimeCapabilityKey): string[] {
  if (key.startsWith('browser.')) return ['browser_access_policy', 'ssrf_policy']
  if (key.startsWith('engine_home.')) return ['engine_home_policy']
  if (key.startsWith('knowledge.')) return ['knowledge_scope_policy']
  if (key.startsWith('runtime.')) return ['runtime_policy']
  return []
}
