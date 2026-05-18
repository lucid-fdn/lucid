import { describe, expect, it } from 'vitest'

import {
  buildAgentOpsQualityGatePack,
  buildAgentOpsQualityGatePackReport,
  renderAgentOpsQualityGatePackMarkdown,
  summarizeAgentOpsQualityGatePack,
} from '../quality-gate-pack'

describe('Agent Ops quality gate pack', () => {
  it('wraps production preflight with CI-friendly quality gates instead of duplicating promotion logic', () => {
    const pack = buildAgentOpsQualityGatePack()

    expect(pack.schemaVersion).toBe(1)
    expect(pack.gates.map((gate) => gate.id)).toEqual(expect.arrayContaining([
      'diff-hygiene',
      'completion-matrix-smoke',
      'release-quality-registry-smoke',
      'eval-registry-smoke',
      'typecheck',
      'host-pack-matrix-dry-run',
      'agent-ops-tests',
      'channel-native-smoke',
      'agent-ops-stress',
      'web-app-smoke',
      'worker-runtime-packages-build',
      'worker-build',
      'worker-agent-ops-tests',
      'worker-channel-smoke',
    ]))
    expect(pack.gates.find((gate) => gate.id === 'typecheck')?.source).toBe('production_preflight')
    expect(pack.gates.find((gate) => gate.id === 'host-pack-matrix-dry-run')?.phase).toBe('generated_contracts')
    expect(pack.gates.find((gate) => gate.id === 'completion-matrix-smoke')?.evidence).toEqual(expect.arrayContaining([
      'completion:browser-procedure-registry',
      'completion:mission-control-quality-gates:quality_gate_pack',
    ]))
    expect(pack.gates.find((gate) => gate.id === 'diff-hygiene')?.command).toEqual({
      command: 'git',
      args: ['diff', '--check'],
    })
    expect(pack.destructiveGateIds).toEqual([])
  })

  it('keeps registry smoke evidence connected to existing release-quality and eval registries', () => {
    const pack = buildAgentOpsQualityGatePack()

    expect(pack.gates.find((gate) => gate.id === 'release-quality-registry-smoke')?.evidence).toEqual(expect.arrayContaining([
      'release_quality:stale-docs',
      'release_quality:ai-slop-patterns',
      'release_quality:version-drift',
    ]))
    expect(pack.gates.find((gate) => gate.id === 'eval-registry-smoke')?.evidence).toEqual(expect.arrayContaining([
      'model_benchmark:instruction-following',
      'channel_ux:streaming-visible',
      'memory_recall:cross-channel-continuity',
    ]))
    expect(pack.evidenceContract).toMatchObject({
      source_hygiene: expect.arrayContaining(['typescript_output', 'diff_check_output']),
      channel_readiness: expect.arrayContaining(['app_channel_smoke_output', 'local_web_smoke_output']),
      runtime_readiness: expect.arrayContaining(['worker_build_output']),
      live_readiness: expect.arrayContaining(['migration_status_output']),
    })
  })

  it('can model read-only live gates and workerless CI without changing the runtime contract', () => {
    const pack = buildAgentOpsQualityGatePack({
      target: 'staging',
      includeLiveChecks: true,
      includeWorkerChecks: false,
    })

    expect(pack.target).toBe('staging')
    expect(pack.gates.map((gate) => gate.id)).toEqual(expect.arrayContaining([
      'supabase-migration-list',
      'supabase-db-lint',
      'agent-ops-prod-schema-smoke',
    ]))
    expect(pack.gates.map((gate) => gate.id)).not.toContain('worker-build')
    expect(pack.liveGateIds).toEqual(['supabase-migration-list', 'supabase-db-lint', 'agent-ops-prod-schema-smoke'])
    expect(pack.gates.filter((gate) => gate.live).every((gate) => gate.destructive === false)).toBe(true)
  })

  it('allows focused pack construction for fast local smoke checks', () => {
    const pack = buildAgentOpsQualityGatePack({
      includeDiffHygiene: false,
      includeRegistrySmoke: false,
      includeWorkerChecks: false,
    })

    expect(pack.gates.map((gate) => gate.id)).not.toContain('diff-hygiene')
    expect(pack.gates.map((gate) => gate.id)).not.toContain('release-quality-registry-smoke')
    expect(pack.gates.map((gate) => gate.id)).not.toContain('worker-build')
    expect(pack.requiredGateIds).toEqual(pack.gates.map((gate) => gate.id))
  })

  it('builds a stable report summary for CI and Mission Control consumption', () => {
    const report = buildAgentOpsQualityGatePackReport({
      includeWorkerChecks: false,
    })

    expect(report.summary).toMatchObject({
      total: 12,
      required: 12,
      live: 0,
      destructive: 0,
    })
    expect(report.summary.byPhase.map((phase) => phase.phase)).toEqual([
      'source_hygiene',
      'generated_contracts',
      'release_quality',
      'evals',
      'channel_readiness',
      'stress_latency',
    ])
    expect(report.gates.map((gate) => gate.id)).toContain('agent-ops-stress')
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
  })

  it('renders a markdown operator summary without requiring command log scraping', () => {
    const pack = buildAgentOpsQualityGatePack({
      includeWorkerChecks: false,
    })
    const summary = summarizeAgentOpsQualityGatePack(pack)
    const markdown = renderAgentOpsQualityGatePackMarkdown(pack)

    expect(summary.destructive).toBe(0)
    expect(markdown).toContain('# Agent Ops Quality Gate Pack')
    expect(markdown).toContain('| Total gates | Required | Live | Destructive |')
    expect(markdown).toContain('| diff-hygiene | source_hygiene | yes | no | `git diff --check` |')
    expect(markdown).toContain('Production preflight remains the authoritative promotion sequence')
  })
})
