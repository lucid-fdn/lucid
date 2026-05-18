import type { LucidStackId } from '@contracts/stack'

export type LucidStackStatus = 'active' | 'foundation' | 'planned' | 'deprecated'

export type LucidStackSurfaceKind =
  | 'contract'
  | 'api'
  | 'ui'
  | 'worker'
  | 'db'
  | 'package'
  | 'doc'
  | 'tool'
  | 'provider'
  | 'event'

export interface LucidStackSurface {
  kind: LucidStackSurfaceKind
  path: string
  description: string
}

export interface LucidStackDependency {
  stack: LucidStackId
  relationship: 'uses' | 'emits_to' | 'controls' | 'observes' | 'extends'
  description: string
}

export interface LucidStackDefinition {
  id: LucidStackId
  name: string
  status: LucidStackStatus
  summary: string
  owns: string[]
  does_not_own: string[]
  current_surfaces: LucidStackSurface[]
  integration_points: LucidStackDependency[]
  forbidden_dependencies: string[]
  backlog_refs: string[]
}

export const LUCID_STACK_DEFINITIONS: LucidStackDefinition[] = [
  {
    id: 'commerce',
    name: 'Agent Commerce',
    status: 'foundation',
    summary: 'Provider-neutral commerce control plane for agent spend, seller grants, machine payments, policy, approval, ledger, and reconciliation.',
    owns: [
      'commerce intent and spend request contracts',
      'rail policy routing',
      'commerce policy evaluation',
      'provider-neutral payment adapter contracts',
      'machine-payment proof claim semantics',
      'commerce ledger and reconciliation model',
    ],
    does_not_own: [
      'raw provider credentials',
      'human subscription checkout',
      'runtime engine execution loops',
      'general org membership or authentication',
    ],
    current_surfaces: [
      { kind: 'contract', path: 'contracts/agent-commerce.ts', description: 'Provider-neutral commerce schemas.' },
      { kind: 'provider', path: 'src/lib/agent-commerce/', description: 'Commerce provider registry, policy, and adapter skeletons.' },
      { kind: 'doc', path: 'docs/stacks/commerce.md', description: 'Commerce stack boundary and integration contract.' },
    ],
    integration_points: [
      { stack: 'trust', relationship: 'uses', description: 'Approvals, identity, policy enforcement, and secrets.' },
      { stack: 'agentops', relationship: 'emits_to', description: 'Spend lifecycle events, provider state changes, and reconciliation alerts.' },
      { stack: 'runtime', relationship: 'extends', description: 'Engine-neutral commerce tools exposed to agents.' },
      { stack: 'providers', relationship: 'uses', description: 'Stripe, x402, crypto, and manual rail adapters.' },
    ],
    forbidden_dependencies: [
      'worker runtime tools must not import provider SDKs directly',
      'provider object models must not become core Lucid commerce contracts',
      'Lucid-L2 money-moving routes must not be exposed before P0 gates are closed',
    ],
    backlog_refs: ['AGENT-COMMERCE-P0', 'STACK-P0'],
  },
  {
    id: 'agentops',
    name: 'AgentOps',
    status: 'foundation',
    summary: 'Trace, event, health, cost, approval, and remediation substrate shared by Mission Control, runtimes, app services, and commerce.',
    owns: [
      'trace identifiers and feed semantics',
      'health and cost telemetry',
      'operator-visible event normalization',
      'incident and remediation signal contracts',
    ],
    does_not_own: [
      'operator page layout',
      'agent runtime execution',
      'provider-specific webhook parsing',
    ],
    current_surfaces: [
      { kind: 'event', path: 'contracts/events.ts', description: 'Shared event shapes.' },
      { kind: 'package', path: 'packages/agent-bridge/', description: 'BYO runtime telemetry, approval, and heartbeat bridge.' },
      { kind: 'api', path: 'src/lib/app-service/runtime-gateway/agentops.ts', description: 'App-scoped AgentOps gateway surface.' },
      { kind: 'doc', path: 'docs/stacks/agentops.md', description: 'AgentOps stack boundary.' },
    ],
    integration_points: [
      { stack: 'mission_control', relationship: 'observes', description: 'Mission Control renders AgentOps data and actions.' },
      { stack: 'runtime', relationship: 'uses', description: 'Runtimes emit heartbeats, costs, approvals, and tool events.' },
      { stack: 'commerce', relationship: 'observes', description: 'Commerce emits spend and reconciliation lifecycle events.' },
    ],
    forbidden_dependencies: [
      'AgentOps must not own business execution side effects',
      'AgentOps events must not leak provider secrets or raw credentials',
    ],
    backlog_refs: ['STACK-P0', 'AGENTOPS-P1'],
  },
  {
    id: 'mission_control',
    name: 'Mission Control',
    status: 'active',
    summary: 'Operator cockpit for supervising agents, teams, approvals, runtime health, remediation, and operational proof.',
    owns: [
      'operator UX and control surfaces',
      'approval resolution UI',
      'runtime and agent supervision workflows',
      'project-scoped operational navigation',
    ],
    does_not_own: [
      'runtime engine internals',
      'provider-specific commerce execution',
      'raw event storage contracts',
    ],
    current_surfaces: [
      { kind: 'ui', path: 'src/app/(app)/[workspace-slug]/mission-control/', description: 'Legacy-compatible Mission Control routes.' },
      { kind: 'api', path: 'src/app/api/mission-control/', description: 'Mission Control API route family.' },
      { kind: 'doc', path: 'docs/stacks/mission-control.md', description: 'Mission Control stack boundary.' },
    ],
    integration_points: [
      { stack: 'agentops', relationship: 'uses', description: 'Reads telemetry, feed, health, and trace data.' },
      { stack: 'trust', relationship: 'controls', description: 'Resolves approvals and operator permissions.' },
      { stack: 'commerce', relationship: 'controls', description: 'Displays and resolves spend approval workflows.' },
    ],
    forbidden_dependencies: [
      'new operational UI should target project routes first',
      'Mission Control UI must not call provider SDKs',
    ],
    backlog_refs: ['STACK-P0', 'MISSION-CONTROL-P1'],
  },
  {
    id: 'teams',
    name: 'Teams',
    status: 'active',
    summary: 'Composable multi-agent actor graph, currently backed by crew contracts and tables while user-facing product copy moves to Teams.',
    owns: [
      'team topology and membership',
      'team run lifecycle',
      'coordinator semantics',
      'team template deployment target',
    ],
    does_not_own: [
      'single-agent configuration',
      'general workflow DAG planning',
      'agent runtime internals',
    ],
    current_surfaces: [
      { kind: 'contract', path: 'contracts/crew.ts', description: 'Current crew-backed Team topology and run contracts, including Team aliases.' },
      { kind: 'api', path: 'src/app/api/crews/', description: 'Current crew-backed Team APIs.' },
      { kind: 'db', path: 'src/lib/db/crews.ts', description: 'Crew persistence helpers and Team-named compatibility façades.' },
      { kind: 'tool', path: 'src/lib/teams/read-model.ts', description: 'Team read-model summaries over crew-backed data.' },
      { kind: 'worker', path: 'worker/src/agent/runtime-tools/crew-context.ts', description: 'Runtime team context and coordinator completion tool.' },
      { kind: 'doc', path: 'docs/stacks/teams.md', description: 'Teams stack boundary and migration guardrails.' },
    ],
    integration_points: [
      { stack: 'templates', relationship: 'uses', description: 'Team templates instantiate members and topology.' },
      { stack: 'runtime', relationship: 'extends', description: 'Team context is injected into agent runtimes.' },
      { stack: 'agentops', relationship: 'emits_to', description: 'Team run events appear in the operational feed.' },
    ],
    forbidden_dependencies: [
      'do not rename crew tables/routes broadly until a dedicated migration is planned',
      'team topology checks must not silently bypass security-sensitive boundaries',
    ],
    backlog_refs: ['STACK-P0', 'TEAMS-P1'],
  },
  {
    id: 'templates',
    name: 'Templates / Assemblies',
    status: 'active',
    summary: 'Deployable assembly format for agents, teams, apps, workflows, memory schema, approvals, integrations, eval packs, and commerce policy.',
    owns: [
      'template catalog contracts',
      'deployment parameter rendering',
      'agent and team assembly specs',
      'future assembly-level policy declarations',
    ],
    does_not_own: [
      'runtime execution',
      'provider OAuth connection storage',
      'post-deployment operator UX',
    ],
    current_surfaces: [
      { kind: 'contract', path: 'contracts/template.ts', description: 'Agent and team template contracts.' },
      { kind: 'api', path: 'src/app/api/dags/templates/', description: 'DAG template API surface.' },
      { kind: 'doc', path: 'docs/stacks/templates.md', description: 'Templates as Lucid assemblies.' },
    ],
    integration_points: [
      { stack: 'teams', relationship: 'controls', description: 'Can instantiate team topology.' },
      { stack: 'app_service', relationship: 'extends', description: 'App Service specs bind agents, teams, workflows, and frontend blocks.' },
      { stack: 'commerce', relationship: 'extends', description: 'Future templates can declare commerce policies and paid endpoints.' },
    ],
    forbidden_dependencies: [
      'templates must not store raw secrets',
      'templates must not bypass approval or policy gates during deployment',
    ],
    backlog_refs: ['STACK-P0', 'TEMPLATES-P1'],
  },
  {
    id: 'runtime',
    name: 'Runtime',
    status: 'active',
    summary: 'Engine-neutral execution layer for OpenClaw, Hermes, shared worker, dedicated runtime, and BYO runtime integrations.',
    owns: [
      'runtime protocols and heartbeats',
      'agent tool execution boundary',
      'engine adapters',
      'dedicated runtime connection semantics',
      'engine home virtualization contracts and package foundation',
    ],
    does_not_own: [
      'operator UI',
      'provider SDK side effects',
      'commerce ledger state',
    ],
    current_surfaces: [
      { kind: 'worker', path: 'worker/src/agent/', description: 'Worker-side agent loop, tools, engines, and runtime adapters.' },
      { kind: 'package', path: 'packages/agent-bridge/', description: 'BYO runtime bridge SDK.' },
      { kind: 'contract', path: 'contracts/engine-home.ts', description: 'Engine Home Virtualization snapshot, diff, archive, commit, and rollback contract.' },
      { kind: 'package', path: 'packages/engine-home/', description: 'EHV filesystem helpers for safe snapshots, diffs, archives, hydration, and layout classification.' },
      { kind: 'doc', path: 'docs/stacks/runtime.md', description: 'Runtime stack boundary.' },
      { kind: 'doc', path: 'docs/platform/mission-control/engine-home-virtualization.md', description: 'Operator-facing EHV architecture notes.' },
    ],
    integration_points: [
      { stack: 'agentops', relationship: 'emits_to', description: 'Reports heartbeats, events, costs, and approvals.' },
      { stack: 'trust', relationship: 'uses', description: 'Uses approvals and scoped runtime keys.' },
      { stack: 'commerce', relationship: 'extends', description: 'Runs commerce tools through internal APIs.' },
    ],
    forbidden_dependencies: [
      'runtime tools must call internal Lucid APIs rather than provider SDKs for sensitive side effects',
      'engine-specific objects must not leak into shared contracts',
      'runtime-local home files must not bypass EHV path safety and snapshot contracts when crossing runtime boundaries',
    ],
    backlog_refs: ['STACK-P0', 'RUNTIME-P1'],
  },
  {
    id: 'app_service',
    name: 'App Service',
    status: 'foundation',
    summary: 'Generated and hosted agent-service apps that consume Lucid capabilities through public/operator runtime gateways.',
    owns: [
      'app service specs',
      'public app runtime API contracts',
      'operator runtime gateways',
      'frontend generation safety boundaries',
    ],
    does_not_own: [
      'core Mission Control route family',
      'agent runtime engine internals',
      'raw provider credentials',
    ],
    current_surfaces: [
      { kind: 'contract', path: 'contracts/app-service.ts', description: 'App Service Foundry contracts.' },
      { kind: 'contract', path: 'contracts/app-runtime.ts', description: 'Public and operator app runtime contracts.' },
      { kind: 'api', path: 'src/app/api/app-runtime/', description: 'App runtime API route family.' },
      { kind: 'doc', path: 'docs/stacks/app-service.md', description: 'App Service stack boundary.' },
    ],
    integration_points: [
      { stack: 'templates', relationship: 'uses', description: 'App specs bind templates, agents, teams, workflows, and frontend blocks.' },
      { stack: 'agentops', relationship: 'uses', description: 'Operator app runtime exposes app-scoped AgentOps.' },
      { stack: 'commerce', relationship: 'extends', description: 'Generated apps can expose paid actions through Commerce.' },
    ],
    forbidden_dependencies: [
      'generated apps must not call forbidden Lucid internal route families directly',
      'generated frontend manifests must not contain secrets or internal IDs',
    ],
    backlog_refs: ['STACK-P0', 'APP-SERVICE-P1'],
  },
  {
    id: 'trust',
    name: 'Trust',
    status: 'active',
    summary: 'Authentication, authorization, approvals, policy, secrets, credentials, entitlement, and safety gates shared across stacks.',
    owns: [
      'identity and org membership checks',
      'approval gates',
      'policy enforcement helpers',
      'secret reference boundaries',
      'runtime key and internal HMAC validation',
    ],
    does_not_own: [
      'provider-specific business workflows',
      'operator page layout',
      'agent planning semantics',
    ],
    current_surfaces: [
      { kind: 'api', path: 'src/lib/auth/', description: 'Provider-agnostic authentication adapter.' },
      { kind: 'api', path: 'src/lib/mission-control/approval-gate.ts', description: 'Mission Control approval gate logic.' },
      { kind: 'doc', path: 'docs/stacks/trust.md', description: 'Trust stack boundary.' },
    ],
    integration_points: [
      { stack: 'commerce', relationship: 'controls', description: 'Approves spend and protects provider credentials.' },
      { stack: 'runtime', relationship: 'controls', description: 'Validates runtime identity and approval-required tools.' },
      { stack: 'app_service', relationship: 'controls', description: 'Protects operator runtime APIs and generated app boundaries.' },
    ],
    forbidden_dependencies: [
      'policy-sensitive mutations must not accept caller-supplied identity as authority',
      'secrets must be referenced, not returned through public APIs',
    ],
    backlog_refs: ['STACK-P0', 'TRUST-P1'],
  },
  {
    id: 'data',
    name: 'Data',
    status: 'active',
    summary: 'Database, migrations, events, memory, queues, locks, ledgers, and durable state that back every product stack.',
    owns: [
      'schema evolution patterns',
      'idempotency and locks',
      'event persistence',
      'memory and retrieval data contracts',
      'ledger storage primitives',
    ],
    does_not_own: [
      'business policy decisions',
      'operator UX',
      'provider-specific SDK mapping',
    ],
    current_surfaces: [
      { kind: 'db', path: 'supabase/migrations/', description: 'Canonical incremental database migrations.' },
      { kind: 'db', path: 'docker/bootstrap/000_base_schema.sql', description: 'Docker-first self-hosted base schema.' },
      { kind: 'doc', path: 'docs/stacks/data.md', description: 'Data stack boundary.' },
    ],
    integration_points: [
      { stack: 'commerce', relationship: 'uses', description: 'Commerce needs ledger, idempotency, proof claim, and event tables.' },
      { stack: 'agentops', relationship: 'uses', description: 'AgentOps needs durable event and telemetry storage.' },
      { stack: 'runtime', relationship: 'uses', description: 'Runtime uses queues, leases, locks, memory, and run state.' },
    ],
    forbidden_dependencies: [
      'data migrations must not silently weaken RLS or ownership checks',
      'idempotency and proof claim paths must fail closed on storage errors',
    ],
    backlog_refs: ['STACK-P0', 'DATA-P1'],
  },
  {
    id: 'providers',
    name: 'Providers',
    status: 'active',
    summary: 'Swappable external-provider adapters for models, auth, billing, storage, observability, integrations, deployment, and commerce rails.',
    owns: [
      'provider-specific SDK mapping',
      'provider lifecycle health',
      'provider feature manifests',
      'provider-specific webhook normalization',
    ],
    does_not_own: [
      'core Lucid domain models',
      'runtime engine protocol',
      'operator approval decisions',
    ],
    current_surfaces: [
      { kind: 'provider', path: 'src/lib/payments/', description: 'Human checkout payment provider abstraction.' },
      { kind: 'provider', path: 'src/lib/agent-commerce/providers/', description: 'Agent Commerce provider manifests and adapters.' },
      { kind: 'provider', path: 'packages/lucid-adapters/', description: 'Provider adapter package surface.' },
      { kind: 'doc', path: 'docs/stacks/providers.md', description: 'Providers stack boundary.' },
    ],
    integration_points: [
      { stack: 'commerce', relationship: 'uses', description: 'Commerce executes through provider-neutral rail adapters.' },
      { stack: 'trust', relationship: 'uses', description: 'Provider credentials stay behind trust and secret references.' },
      { stack: 'app_service', relationship: 'extends', description: 'App Service uses providers for generation, deployment, frontend, and sandbox targets.' },
    ],
    forbidden_dependencies: [
      'provider-specific IDs must not become required cross-stack identifiers',
      'provider adapters must not bypass Lucid policy or approval gates',
    ],
    backlog_refs: ['STACK-P0', 'PROVIDERS-P1'],
  },
]

export function getLucidStackDefinition(stackId: LucidStackId): LucidStackDefinition {
  const definition = LUCID_STACK_DEFINITIONS.find((stack) => stack.id === stackId)
  if (!definition) {
    throw new Error(`Unknown Lucid stack: ${stackId}`)
  }
  return definition
}
