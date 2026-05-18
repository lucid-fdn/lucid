#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import {
  AGENT_OPS_PREFLIGHT_TARGETS,
  buildAgentOpsProductionPreflightPlan,
  type AgentOpsProductionPreflightTarget,
} from '../src/lib/agent-ops/production-preflight'

interface CliOptions {
  target: AgentOpsProductionPreflightTarget
  includeLiveChecks: boolean
  includeWorkerChecks: boolean
  dryRun: boolean
}

function parseArgs(argv: string[]): CliOptions {
  let target: AgentOpsProductionPreflightTarget = 'local'
  let includeLiveChecks = false
  let includeWorkerChecks = true
  let dryRun = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--target') {
      const next = argv[index + 1]
      if (!isTarget(next)) throw new Error(`Invalid --target "${next}". Expected one of: ${AGENT_OPS_PREFLIGHT_TARGETS.join(', ')}`)
      target = next
      index += 1
    } else if (arg === '--live') {
      includeLiveChecks = true
    } else if (arg === '--no-worker') {
      includeWorkerChecks = false
    } else if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return { target, includeLiveChecks, includeWorkerChecks, dryRun }
}

function main(): number {
  const options = parseArgs(process.argv.slice(2))
  const plan = buildAgentOpsProductionPreflightPlan(options)

  console.log(`Agent Ops production preflight (${plan.target})`)
  console.log('')
  for (const note of plan.notes) {
    console.log(`- ${note}`)
  }
  console.log('')

  for (const [index, step] of plan.steps.entries()) {
    const command = [step.command, ...step.args].join(' ')
    console.log(`${index + 1}. ${step.label}`)
    console.log(`   ${step.description}`)
    console.log(`   $ ${command}`)
    if (options.dryRun) continue

    const result = spawnSync(step.command, step.args, {
      stdio: 'inherit',
      shell: false,
      env: process.env,
    })
    if (result.status !== 0) {
      console.error(`\nPreflight failed at step "${step.id}".`)
      return result.status ?? 1
    }
    console.log('')
  }

  console.log('Manual promotion checks:')
  for (const check of plan.manualPromotionChecks) {
    console.log(`- ${check}`)
  }
  console.log('')
  console.log('Agent Ops production preflight passed.')
  return 0
}

function printHelp(): void {
  console.log(`Agent Ops production preflight

Usage:
  npm run agent-ops:prod-preflight
  npm run agent-ops:prod-preflight -- --target staging --live

Options:
  --target local|staging|production  Label the promotion target. Default: local.
  --live                            Add read-only linked Supabase checks.
  --no-worker                       Skip worker build/tests.
  --dry-run                         Print the plan without running commands.
`)
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
