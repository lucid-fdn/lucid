export const AGENT_OPS_PREFLIGHT_TARGETS = ['local', 'staging', 'production'] as const

export type AgentOpsProductionPreflightTarget = (typeof AGENT_OPS_PREFLIGHT_TARGETS)[number]

export interface AgentOpsProductionPreflightOptions {
  target?: AgentOpsProductionPreflightTarget
  includeLiveChecks?: boolean
  includeWorkerChecks?: boolean
}

export interface AgentOpsProductionPreflightStep {
  id: string
  label: string
  command: string
  args: string[]
  live: boolean
  destructive: boolean
  required: boolean
  description: string
}

export interface AgentOpsProductionPreflightPlan {
  target: AgentOpsProductionPreflightTarget
  steps: AgentOpsProductionPreflightStep[]
  manualPromotionChecks: string[]
  notes: string[]
}

const AGENT_OPS_CORE_TESTS = [
  'src/lib/agent-ops/__tests__',
  'src/lib/db/__tests__/agent-ops-product.test.ts',
  'src/app/api/agent-ops/overview/__tests__/route.test.ts',
  'src/app/api/agent-ops/runs/__tests__/route.test.ts',
  'src/app/api/agent-ops/workflows/__tests__/route.test.ts',
  'src/app/api/agent-ops/alerts/__tests__/route.test.ts',
  'src/app/api/agent-ops/external-host-packs/__tests__/route.test.ts',
  'src/app/api/agent-ops/quality-gates/__tests__/route.test.ts',
  'src/app/api/agent-ops/project-policy/__tests__/route.test.ts',
] as const

const AGENT_OPS_LINT_FILES = [
  'src/lib/agent-ops/operating-loop.ts',
  'src/lib/agent-ops/channel-native.ts',
  'src/lib/agent-ops/failure-ownership.ts',
  'src/lib/agent-ops/external-host-packs.ts',
  'src/lib/agent-ops/quality-gate-pack.ts',
  'src/lib/agent-ops/step-output.ts',
  'src/lib/agent-ops/production-preflight.ts',
  'src/lib/agent-ops/team-ops.ts',
  'src/lib/agent-ops/team-policy.ts',
  'src/lib/agent-ops/specialist-telemetry.ts',
  'src/lib/agent-ops/start.ts',
  'src/lib/agent-ops/ports.ts',
  'src/lib/db/agent-ops-product.ts',
  'src/lib/db/agent-ops-runtime-selector.ts',
  'src/lib/db/agent-ops-team-policy-gate.ts',
  'src/lib/db/agent-ops-channel-launch.ts',
  'src/app/api/agent-ops/overview/route.ts',
  'src/app/api/agent-ops/project-policy/route.ts',
  'src/app/api/agent-ops/runs/route.ts',
  'src/app/api/agent-ops/workflows/route.ts',
  'src/app/api/agent-ops/external-host-packs/route.ts',
  'src/app/api/agent-ops/external-host-packs/[hostId]/route.ts',
  'src/app/api/agent-ops/quality-gates/route.ts',
  'src/app/api/webhooks/discord/interactions/route.ts',
  'src/lib/discord/guild-commands.ts',
  'src/lib/discord/hosted-commands.ts',
  'src/app/api/webhooks/telegram/hosted/route.ts',
  'src/lib/telegram/bot-commands.ts',
  'src/lib/telegram/hosted-commands.ts',
  'src/lib/whatsapp/hosted-commands.ts',
  'src/app/(app)/[workspace-slug]/mission-control/agent-ops/agent-ops-client.tsx',
] as const

export function buildAgentOpsProductionPreflightPlan(
  options: AgentOpsProductionPreflightOptions = {},
): AgentOpsProductionPreflightPlan {
  const target = options.target ?? 'local'
  const includeLiveChecks = options.includeLiveChecks ?? false
  const includeWorkerChecks = options.includeWorkerChecks ?? true
  const steps: AgentOpsProductionPreflightStep[] = [
    {
      id: 'typecheck',
      label: 'Root typecheck',
      command: 'npm',
      args: ['run', 'typecheck'],
      live: false,
      destructive: false,
      required: true,
      description: 'Verifies the Next.js/control-plane TypeScript surface before promotion.',
    },
    {
      id: 'lint-agent-ops',
      label: 'Agent Ops lint',
      command: 'npm',
      args: ['run', 'lint', '--', ...AGENT_OPS_LINT_FILES.flatMap((file) => ['--file', file])],
      live: false,
      destructive: false,
      required: true,
      description: 'Keeps the Agent Ops API, DB projection, Team Ops, and Mission Control files lint-clean.',
    },
    {
      id: 'capability-docs',
      label: 'Capability docs freshness',
      command: 'npm',
      args: ['run', 'agent-ops:capability-docs:check'],
      live: false,
      destructive: false,
      required: true,
      description: 'Ensures generated runtime/channel/skill support docs match code.',
    },
    {
      id: 'host-pack-matrix-dry-run',
      label: 'External host pack matrix dry run',
      command: 'npm',
      args: ['run', 'agent-ops:host-pack:install', '--', '--host', 'all', '--root', '.'],
      live: false,
      destructive: false,
      required: true,
      description: 'Verifies generated external host packs, installer manifest hashes, safe install targets, and all-host CLI wiring without writing files.',
    },
    {
      id: 'agent-ops-tests',
      label: 'Agent Ops API/core tests',
      command: 'npm',
      args: ['run', 'test', '--', '--run', ...AGENT_OPS_CORE_TESTS],
      live: false,
      destructive: false,
      required: true,
      description: 'Covers workflows, routing, runtime selection, policy enforcement, channel launch/report, adaptive dispatch, production gates, overview projections, alerts, and rollout readiness.',
    },
    {
      id: 'channel-native-smoke',
      label: 'App channel-native smoke',
      command: 'npm',
      args: ['run', 'test:channels:smoke'],
      live: false,
      destructive: false,
      required: true,
      description: 'Exercises hosted Slack admin/default routes plus Telegram, Discord, WhatsApp, Teams, and iMessage Agent Ops command surfaces through shared channel contracts.',
    },
    {
      id: 'agent-ops-stress',
      label: 'Agent Ops stress and latency gate',
      command: 'npm',
      args: ['run', 'agent-ops:stress'],
      live: false,
      destructive: false,
      required: true,
      description: 'Exercises repeated launches, Browser QA normalization, overview refreshes, and alert dedupe.',
    },
    {
      id: 'web-app-smoke',
      label: 'Local web app smoke',
      command: 'npm',
      args: ['run', 'test:app-smoke:spawned'],
      live: false,
      destructive: false,
      required: true,
      description: 'Boots a local Next.js instance and verifies the authenticated project shell redirects and public login path before promotion.',
    },
  ]

  if (includeWorkerChecks) {
    steps.push(
      {
        id: 'worker-runtime-packages-build',
        label: 'Worker runtime package build',
        command: 'npm',
        args: ['run', 'worker:build-prereqs'],
        live: false,
        destructive: false,
        required: true,
        description: 'Builds ignored package dist artifacts required by worker TypeScript path mappings before compiling runtime code.',
      },
      {
        id: 'worker-build',
        label: 'Worker build',
        command: 'npm',
        args: ['--prefix', 'worker', 'run', 'build'],
        live: false,
        destructive: false,
        required: true,
        description: 'Verifies worker-side Agent Ops runtime code compiles before promotion.',
      },
      {
        id: 'worker-agent-ops-tests',
        label: 'Worker Agent Ops tests',
        command: 'npm',
        args: ['--prefix', 'worker', 'run', 'test', '--', '--run', 'src/agent-ops'],
        live: false,
        destructive: false,
        required: true,
        description: 'Verifies shared/dedicated worker Agent Ops runtime simulation paths.',
      },
      {
        id: 'worker-channel-smoke',
        label: 'Worker channel bridge smoke',
        command: 'npm',
        args: ['--prefix', 'worker', 'run', 'test:channels:smoke'],
        live: false,
        destructive: false,
        required: true,
        description: 'Verifies worker-side Slack, Discord, Teams, iMessage, and relay inbound channel bridges before promotion.',
      },
    )
  }

  if (includeLiveChecks) {
    steps.push(
      {
        id: 'supabase-migration-list',
        label: 'Linked Supabase migration status',
        command: 'supabase',
        args: ['migration', 'list'],
        live: true,
        destructive: false,
        required: true,
        description: 'Read-only check that the linked database sees the expected migration history.',
      },
      {
        id: 'supabase-db-lint',
        label: 'Linked Supabase advisor lint',
        command: 'supabase',
        args: ['db', 'lint', '--linked'],
        live: true,
        destructive: false,
        required: true,
        description: 'Read-only advisor check for RLS, policy, and function hardening before promotion.',
      },
      {
        id: 'agent-ops-prod-schema-smoke',
        label: 'Agent Ops production schema smoke',
        command: 'npm',
        args: ['run', 'agent-ops:prod-schema-smoke'],
        live: true,
        destructive: false,
        required: true,
        description: 'Read-only REST smoke that confirms required Agent Ops and Browser Operator tables exist in the target Supabase project.',
      },
    )
  }

  return {
    target,
    steps,
    manualPromotionChecks: buildManualPromotionChecks(target),
    notes: [
      'This preflight is intentionally non-destructive. It never applies migrations, deploys services, restarts workers, or mutates production data.',
      'Run live checks only after confirming the Supabase CLI is linked to the intended staging or production project.',
      'External host pack preflight uses dry-run mode; installing packs into a repo still requires explicit --write.',
      'Real promotion still requires an explicit human decision for migration push, deploy, and traffic monitoring.',
    ],
  }
}

function buildManualPromotionChecks(target: AgentOpsProductionPreflightTarget): string[] {
  const scope = target === 'local' ? 'target staging/prod' : target
  return [
    `Apply pending Agent Ops migrations to ${scope} only after reviewing the migration diff.`,
    `Run Agent Ops API/UI smoke tests against ${scope} environment variables.`,
    `Launch a policy-gated Agent Ops run and confirm adaptive dispatch, runtime compatibility, and blocked-state copy are visible in Mission Control.`,
    `Launch a channel-native Agent Ops run and confirm channel-native Agent Ops launch/report text matches Mission Control team_ops state.`,
    `Run host-pack doctor checks for any external agent host repos that should carry generated Lucid Agent Ops packs.`,
    `Confirm org-member reads work and cross-org reads are denied by RLS in ${scope}.`,
    `Confirm Agent Ops write paths are service-role or explicit API mediated, not direct client writes.`,
    `Trigger the same Agent Ops performance budget breach twice and confirm timeline/inbox dedupe keeps one alert per fingerprint.`,
    `Resolve the alert and confirm the project timeline records the resolution event and suppresses the same fingerprint.`,
  ]
}
