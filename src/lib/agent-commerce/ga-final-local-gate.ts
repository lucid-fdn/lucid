import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  AgentCommerceGaReleaseDossierVerificationResultSchema,
  stableAgentCommerceReleaseBundleStringify,
  type AgentCommerceGaReleaseDossierVerificationResult,
} from './ga-release-bundle'

export const AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS = [
  {
    id: 'typecheck',
    command: 'NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck',
  },
  {
    id: 'agent_commerce_tests',
    command: 'npm run test -- src/lib/agent-commerce',
  },
  {
    id: 'ga_readiness',
    command: 'npm run agent-commerce:ga-readiness',
  },
  {
    id: 'provider_promotion',
    command: 'npm run agent-commerce:provider-promotion',
  },
  {
    id: 'rail_readiness',
    command: 'npm run agent-commerce:rail-readiness',
  },
  {
    id: 'dashboard',
    command: 'npm run agent-commerce:dashboard',
  },
  {
    id: 'l2_gates',
    command: 'npm run agent-commerce:l2-gates',
  },
  {
    id: 'stack_boundaries',
    command: 'npm run stack:boundaries',
  },
  {
    id: 'app_service_boundaries',
    command: 'npm run app-service:boundaries',
  },
] as const

const commandIds = AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS.map((command) => command.id) as [
  typeof AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS[number]['id'],
  ...Array<typeof AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS[number]['id']>,
]

export const AgentCommerceGaFinalLocalGateCommandIdSchema = z.enum(commandIds)

export type AgentCommerceGaFinalLocalGateCommandId = z.infer<
  typeof AgentCommerceGaFinalLocalGateCommandIdSchema
>

export const AgentCommerceGaFinalLocalGateBlockerSchema = z.enum([
  'release_dossier_verification_not_ready',
  'missing_required_command',
  'required_command_failed',
  'unexpected_command_result',
])

export type AgentCommerceGaFinalLocalGateBlocker = z.infer<
  typeof AgentCommerceGaFinalLocalGateBlockerSchema
>

export const AgentCommerceGaFinalLocalGateCommandResultSchema = z.object({
  id: AgentCommerceGaFinalLocalGateCommandIdSchema,
  command: z.string().min(1).max(500),
  exit_code: z.number().int().nullable(),
  passed: z.boolean(),
  duration_ms: z.number().int().nonnegative(),
  stdout_tail: z.string().max(12000).optional(),
  stderr_tail: z.string().max(12000).optional(),
})

export type AgentCommerceGaFinalLocalGateCommandResult = z.infer<
  typeof AgentCommerceGaFinalLocalGateCommandResultSchema
>

export const AgentCommerceGaFinalLocalGateSchema = z.object({
  schema_version: z.literal('agent-commerce-ga-final-local-gate:v1'),
  evaluated_at: z.string().datetime(),
  ready: z.boolean(),
  blockers: z.array(AgentCommerceGaFinalLocalGateBlockerSchema),
  release_dossier_verification_ready: z.boolean(),
  release_dossier_dossier_hash_valid: z.boolean(),
  release_dossier_markdown_matches: z.boolean(),
  required_command_ids: z.array(AgentCommerceGaFinalLocalGateCommandIdSchema),
  missing_command_ids: z.array(AgentCommerceGaFinalLocalGateCommandIdSchema),
  failed_command_ids: z.array(AgentCommerceGaFinalLocalGateCommandIdSchema),
  unexpected_command_ids: z.array(AgentCommerceGaFinalLocalGateCommandIdSchema),
  commands: z.array(AgentCommerceGaFinalLocalGateCommandResultSchema),
  final_gate_hash: z.string().regex(/^[a-f0-9]{64}$/),
})

export type AgentCommerceGaFinalLocalGate = z.infer<
  typeof AgentCommerceGaFinalLocalGateSchema
>

export interface AgentCommerceGaFinalLocalGateInput {
  dossierVerification: AgentCommerceGaReleaseDossierVerificationResult
  commands: AgentCommerceGaFinalLocalGateCommandResult[]
  evaluatedAt?: string
}

function uniqueSorted<T extends string>(items: Iterable<T>): T[] {
  return [...new Set(items)].sort()
}

function unsignedFinalLocalGate(
  gate: AgentCommerceGaFinalLocalGate,
): Omit<AgentCommerceGaFinalLocalGate, 'final_gate_hash'> {
  return {
    schema_version: gate.schema_version,
    evaluated_at: gate.evaluated_at,
    ready: gate.ready,
    blockers: gate.blockers,
    release_dossier_verification_ready: gate.release_dossier_verification_ready,
    release_dossier_dossier_hash_valid: gate.release_dossier_dossier_hash_valid,
    release_dossier_markdown_matches: gate.release_dossier_markdown_matches,
    required_command_ids: gate.required_command_ids,
    missing_command_ids: gate.missing_command_ids,
    failed_command_ids: gate.failed_command_ids,
    unexpected_command_ids: gate.unexpected_command_ids,
    commands: gate.commands,
  }
}

export function hashAgentCommerceGaFinalLocalGate(
  gateInput: AgentCommerceGaFinalLocalGate,
): string {
  const gate = AgentCommerceGaFinalLocalGateSchema.parse(gateInput)
  return createHash('sha256')
    .update(stableAgentCommerceReleaseBundleStringify(unsignedFinalLocalGate(gate)))
    .digest('hex')
}

export function createAgentCommerceGaFinalLocalGate(
  input: AgentCommerceGaFinalLocalGateInput,
): AgentCommerceGaFinalLocalGate {
  const dossierVerification = AgentCommerceGaReleaseDossierVerificationResultSchema.parse(input.dossierVerification)
  const commands = input.commands
    .map((command) => AgentCommerceGaFinalLocalGateCommandResultSchema.parse(command))
    .sort((left, right) => left.id.localeCompare(right.id))
  const expectedCommands = new Map(
    AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS.map((command) => [command.id, command.command]),
  )
  const suppliedCommandIds = new Set(commands.map((command) => command.id))
  const missingCommandIds = uniqueSorted(
    AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS
      .filter((command) => !suppliedCommandIds.has(command.id))
      .map((command) => command.id),
  )
  const failedCommandIds = uniqueSorted(
    commands
      .filter((command) => !command.passed || command.exit_code !== 0)
      .map((command) => command.id),
  )
  const unexpectedCommandIds = uniqueSorted(
    commands
      .filter((command) => expectedCommands.get(command.id) !== command.command)
      .map((command) => command.id),
  )
  const blockers: AgentCommerceGaFinalLocalGateBlocker[] = []

  if (!dossierVerification.ready) blockers.push('release_dossier_verification_not_ready')
  if (missingCommandIds.length > 0) blockers.push('missing_required_command')
  if (failedCommandIds.length > 0) blockers.push('required_command_failed')
  if (unexpectedCommandIds.length > 0) blockers.push('unexpected_command_result')

  const unsigned = {
    schema_version: 'agent-commerce-ga-final-local-gate:v1' as const,
    evaluated_at: input.evaluatedAt ?? new Date().toISOString(),
    ready: blockers.length === 0,
    blockers,
    release_dossier_verification_ready: dossierVerification.ready,
    release_dossier_dossier_hash_valid: dossierVerification.dossierHashValid,
    release_dossier_markdown_matches: dossierVerification.markdownMatches,
    required_command_ids: AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS.map((command) => command.id),
    missing_command_ids: missingCommandIds,
    failed_command_ids: failedCommandIds,
    unexpected_command_ids: unexpectedCommandIds,
    commands,
  }

  return AgentCommerceGaFinalLocalGateSchema.parse({
    ...unsigned,
    final_gate_hash: createHash('sha256')
      .update(stableAgentCommerceReleaseBundleStringify(unsigned))
      .digest('hex'),
  })
}
