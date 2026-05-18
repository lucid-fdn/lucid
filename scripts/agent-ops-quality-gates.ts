#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import {
  AGENT_OPS_PREFLIGHT_TARGETS,
  buildAgentOpsQualityGatePack,
  renderAgentOpsQualityGatePackMarkdown,
  summarizeAgentOpsQualityGatePack,
  type AgentOpsQualityGatePack,
  type AgentOpsProductionPreflightTarget,
} from '../src/lib/agent-ops'

type OutputFormat = 'text' | 'json' | 'markdown'

interface CliOptions {
  target: AgentOpsProductionPreflightTarget
  includeLiveChecks: boolean
  includeWorkerChecks: boolean
  includeDiffHygiene: boolean
  includeRegistrySmoke: boolean
  dryRun: boolean
  format: OutputFormat
  only: Set<string>
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    target: 'local',
    includeLiveChecks: false,
    includeWorkerChecks: true,
    includeDiffHygiene: true,
    includeRegistrySmoke: true,
    dryRun: false,
    format: 'text',
    only: new Set(),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--target') {
      const next = argv[index + 1]
      if (!isTarget(next)) throw new Error(`Invalid --target "${next}". Expected one of: ${AGENT_OPS_PREFLIGHT_TARGETS.join(', ')}`)
      options.target = next
      index += 1
    } else if (arg === '--live') {
      options.includeLiveChecks = true
    } else if (arg === '--no-worker') {
      options.includeWorkerChecks = false
    } else if (arg === '--no-diff') {
      options.includeDiffHygiene = false
    } else if (arg === '--no-registry-smoke') {
      options.includeRegistrySmoke = false
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--format') {
      const next = argv[index + 1]
      if (!isOutputFormat(next)) throw new Error('Invalid --format. Expected one of: text, json, markdown')
      options.format = next
      index += 1
    } else if (arg === '--only') {
      const next = argv[index + 1]
      if (!next) throw new Error('--only requires a comma-separated gate id list')
      next.split(',').map((gateId) => gateId.trim()).filter(Boolean).forEach((gateId) => options.only.add(gateId))
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function main(): number {
  const options = parseArgs(process.argv.slice(2))
  const pack = buildAgentOpsQualityGatePack(options)
  const selectedPack = selectPackGates(pack, options.only)
  const gates = selectedPack.gates

  if (options.only.size > 0 && gates.length !== options.only.size) {
    const found = new Set(gates.map((gate) => gate.id))
    const missing = [...options.only].filter((gateId) => !found.has(gateId))
    throw new Error(`Unknown quality gate id(s): ${missing.join(', ')}`)
  }

  if (options.format !== 'text') {
    if (!options.dryRun) {
      throw new Error('--format json|markdown requires --dry-run so command logs do not corrupt structured output')
    }
    if (options.format === 'json') {
      console.log(JSON.stringify({
        schemaVersion: 1,
        target: selectedPack.target,
        summary: summarizeAgentOpsQualityGatePack(selectedPack),
        gates: selectedPack.gates,
        evidenceContract: selectedPack.evidenceContract,
        notes: selectedPack.notes,
      }, null, 2))
    } else {
      console.log(renderAgentOpsQualityGatePackMarkdown(selectedPack))
    }
    return 0
  }

  console.log(`Agent Ops quality gate pack (${selectedPack.target})`)
  console.log('')
  for (const note of selectedPack.notes) {
    console.log(`- ${note}`)
  }
  console.log('')

  for (const [index, gate] of gates.entries()) {
    const command = [gate.command.command, ...gate.command.args].join(' ')
    console.log(`${index + 1}. ${gate.label} [${gate.phase}]`)
    console.log(`   ${gate.description}`)
    console.log(`   Evidence: ${gate.evidence.join(', ')}`)
    console.log(`   $ ${command}`)
    if (options.dryRun) continue

    const result = spawnSync(gate.command.command, gate.command.args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    })
    if (result.status !== 0) {
      console.error(`\nAgent Ops quality gate failed at "${gate.id}".`)
      return result.status ?? 1
    }
    console.log('')
  }

  console.log('Agent Ops quality gate pack passed.')
  return 0
}

function printHelp(): void {
  console.log(`Agent Ops quality gate pack

Usage:
  npm run agent-ops:quality-gates -- --dry-run
  npm run agent-ops:quality-gates -- --only diff-hygiene,release-quality-registry-smoke
  npm run agent-ops:quality-gates -- --target staging --live --dry-run

Options:
  --target local|staging|production  Label the promotion target. Default: local.
  --live                            Include read-only linked Supabase gates.
  --no-worker                       Skip worker build/tests in this pack.
  --no-diff                         Skip git diff hygiene.
  --no-registry-smoke               Skip focused release-quality/eval registry smoke gates.
  --only id,id                      Run only selected gate ids.
  --dry-run                         Print gates without running commands.
  --format text|json|markdown       Output format. json/markdown require --dry-run.
`)
}

function selectPackGates(pack: AgentOpsQualityGatePack, only: Set<string>): AgentOpsQualityGatePack {
  if (only.size === 0) return pack
  const gates = pack.gates.filter((gate) => only.has(gate.id))
  return {
    ...pack,
    gates,
    requiredGateIds: gates.filter((gate) => gate.required).map((gate) => gate.id),
    liveGateIds: gates.filter((gate) => gate.live).map((gate) => gate.id),
    destructiveGateIds: gates.filter((gate) => gate.destructive).map((gate) => gate.id),
  }
}

function isOutputFormat(value: unknown): value is OutputFormat {
  return value === 'text' || value === 'json' || value === 'markdown'
}

function isTarget(value: unknown): value is AgentOpsProductionPreflightTarget {
  return typeof value === 'string' && AGENT_OPS_PREFLIGHT_TARGETS.includes(value as AgentOpsProductionPreflightTarget)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
