import { describe, expect, it } from 'vitest'
import {
  AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS,
  createAgentCommerceGaFinalLocalGate,
  hashAgentCommerceGaFinalLocalGate,
  type AgentCommerceGaFinalLocalGateCommandResult,
} from '../ga-final-local-gate'
import type { AgentCommerceGaReleaseDossierVerificationResult } from '../ga-release-bundle'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

function readyDossierVerification(
  overrides: Partial<AgentCommerceGaReleaseDossierVerificationResult> = {},
): AgentCommerceGaReleaseDossierVerificationResult {
  return {
    ready: true,
    dossierReady: true,
    dossierHashValid: true,
    dossierSelfConsistent: true,
    dossierBoundToIndex: true,
    artifactIndexReady: true,
    artifactIndexVerificationReady: true,
    markdownMatches: true,
    expectedDossierHash: HASH_A,
    actualDossierHash: HASH_A,
    expectedMarkdownSha256: HASH_B,
    actualMarkdownSha256: HASH_B,
    expectedBlockers: [],
    actualBlockers: [],
    dossierFieldMismatches: [],
    ...overrides,
  }
}

function passingCommands(): AgentCommerceGaFinalLocalGateCommandResult[] {
  return AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS.map((command) => ({
    id: command.id,
    command: command.command,
    exit_code: 0,
    passed: true,
    duration_ms: 100,
  }))
}

describe('Agent Commerce GA final local gate', () => {
  it('creates a ready final local gate from dossier verification and command results', () => {
    const gate = createAgentCommerceGaFinalLocalGate({
      dossierVerification: readyDossierVerification(),
      commands: passingCommands(),
      evaluatedAt: '2026-05-09T02:00:00.000Z',
    })

    expect(gate.ready).toBe(true)
    expect(gate.blockers).toEqual([])
    expect(gate.missing_command_ids).toEqual([])
    expect(gate.failed_command_ids).toEqual([])
    expect(gate.unexpected_command_ids).toEqual([])
    expect(gate.commands).toHaveLength(AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS.length)
    expect(gate.final_gate_hash).toBe(hashAgentCommerceGaFinalLocalGate(gate))
  })

  it('blocks final local gate on unready dossier, missing commands, failed commands, or command drift', () => {
    const commands = passingCommands()
    const first = commands[0]!
    const second = commands[1]!
    const missing = commands[2]!
    const remaining = commands.slice(3)
    const gate = createAgentCommerceGaFinalLocalGate({
      dossierVerification: readyDossierVerification({
        ready: false,
        markdownMatches: false,
      }),
      commands: [
        {
          ...first,
          command: 'npm run unexpected',
        },
        {
          ...second,
          exit_code: 1,
          passed: false,
        },
        ...remaining,
      ],
      evaluatedAt: '2026-05-09T02:00:00.000Z',
    })

    expect(gate.ready).toBe(false)
    expect(gate.blockers).toEqual(expect.arrayContaining([
      'release_dossier_verification_not_ready',
      'missing_required_command',
      'required_command_failed',
      'unexpected_command_result',
    ]))
    expect(gate.missing_command_ids).toEqual([missing.id])
    expect(gate.failed_command_ids).toEqual([second.id])
    expect(gate.unexpected_command_ids).toEqual([first.id])
  })
})
