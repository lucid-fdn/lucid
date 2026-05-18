import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import {
  AGENT_OPS_EXTERNAL_HOST_IDS,
  buildAgentOpsExternalHostInstallPlanMatrix,
  buildAgentOpsExternalHostInstallPlan,
  buildAgentOpsExternalHostInstallerManifest,
  inspectAgentOpsExternalHostInstalledState,
  renderAgentOpsExternalHostInstructions,
  selectAgentOpsExternalHostInstallerArtifact,
  summarizeAgentOpsExternalHostInstalledStates,
  verifyAgentOpsExternalHostInstallContent,
  type AgentOpsExternalHostId,
  type AgentOpsExternalHostInstallPlan,
  type AgentOpsExternalHostInstallerArtifact,
} from '../src/lib/agent-ops'

type HostSelection = AgentOpsExternalHostId | 'all'

interface CliOptions {
  hostId: HostSelection
  targetRoot: string
  baseUrl?: string
  write: boolean
  force: boolean
  check: boolean
}

function parseArgs(argv: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    targetRoot: process.cwd(),
    write: false,
    force: false,
    check: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--host') {
      if (!next || !isHostSelection(next)) throw new Error(`--host must be one of: ${[...AGENT_OPS_EXTERNAL_HOST_IDS, 'all'].join(', ')}`)
      options.hostId = next
      index += 1
      continue
    }
    if (arg === '--root') {
      if (!next) throw new Error('--root requires a path')
      options.targetRoot = next
      index += 1
      continue
    }
    if (arg === '--base-url') {
      if (!next) throw new Error('--base-url requires a URL')
      options.baseUrl = next
      index += 1
      continue
    }
    if (arg === '--write') {
      options.write = true
      continue
    }
    if (arg === '--check') {
      options.check = true
      continue
    }
    if (arg === '--force') {
      options.force = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.hostId) {
    throw new Error(`Missing --host. Choose one of: ${[...AGENT_OPS_EXTERNAL_HOST_IDS, 'all'].join(', ')}`)
  }

  return options as CliOptions
}

function isHostSelection(value: string): value is HostSelection {
  return value === 'all' || (AGENT_OPS_EXTERNAL_HOST_IDS as readonly string[]).includes(value)
}

function printHelp() {
  console.log([
    'Install a generated Lucid Agent Ops host pack.',
    '',
    'Usage:',
    '  npm run agent-ops:host-pack:install -- --host codex [--root .] [--write] [--force]',
    '  npm run agent-ops:host-pack:check -- --host all [--root .]',
    '',
    'Options:',
    '  --host      Host pack id: codex, openclaw, hermes, claude-code, cursor, opencode, or all',
    '  --root      Target repository root. Defaults to the current working directory.',
    '  --base-url  Optional Lucid Cloud base URL for manifest raw/json URLs.',
    '  --check     Read-only doctor mode. Exit non-zero if the pack is missing or stale.',
    '  --write     Actually write the file. Without this, the command is a dry run.',
    '  --force     Allow overwriting different existing content. Requires --write.',
  ].join('\n'))
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const manifest = buildAgentOpsExternalHostInstallerManifest({ baseUrl: options.baseUrl })
  const hostIds = options.hostId === 'all'
    ? buildAgentOpsExternalHostInstallPlanMatrix({
        targetRoot: resolve(options.targetRoot),
        manifest,
        dryRun: !options.write,
        overwrite: options.force,
      }).plans.map((plan) => plan.hostId)
    : [options.hostId]
  const results = hostIds.map((hostId) => processHostPack({
    options,
    hostId,
    manifest,
  }))
  const summary = summarizeAgentOpsExternalHostInstalledStates(results.map((result) => result.installedState))

  if (hostIds.length > 1) {
    console.log([
      'Host pack matrix summary:',
      `Total: ${summary.total}`,
      `Current: ${summary.current}`,
      `Missing: ${summary.missing}`,
      `Stale: ${summary.stale}`,
    ].join('\n'))
  }

  if (options.check && !summary.valid) {
    process.exitCode = 1
  }
}

function processHostPack(input: {
  options: CliOptions
  hostId: AgentOpsExternalHostId
  manifest: ReturnType<typeof buildAgentOpsExternalHostInstallerManifest>
}) {
  const { options, hostId, manifest } = input
  const artifact = selectAgentOpsExternalHostInstallerArtifact(manifest, hostId)
  const content = renderAgentOpsExternalHostInstructions({ hostId })
  const verification = verifyAgentOpsExternalHostInstallContent({ artifact, content })

  if (!verification.valid) {
    throw new Error(`Generated ${hostId} host pack failed manifest verification:\n${verification.errors.join('\n')}`)
  }

  const plan = buildAgentOpsExternalHostInstallPlan({
    hostId,
    targetRoot: resolve(options.targetRoot),
    manifest,
    dryRun: !options.write,
    overwrite: options.force,
  })

  const { existing, installedState } = inspectInstalledFile({ plan, artifact })
  const existingMatches = existing === content
  if (existing && !existingMatches && !options.force && !options.check && !plan.dryRun) {
    throw new Error(`Refusing to overwrite different content at ${plan.installPath}. Re-run with --force --write if intended.`)
  }

  printHostPackResult({
    plan,
    check: options.check,
    installedState,
    existingMatches,
  })

  let finalInstalledState = installedState
  if (!options.check && !plan.dryRun && !existingMatches) {
    mkdirSync(dirname(plan.installPath), { recursive: true })
    writeFileSync(plan.installPath, content, 'utf8')
    console.log(`Installed Lucid Agent Ops host pack at ${plan.installPath}`)
    finalInstalledState = inspectInstalledFile({ plan, artifact }).installedState
  }

  return { plan, installedState: finalInstalledState }
}

function inspectInstalledFile(input: {
  plan: AgentOpsExternalHostInstallPlan
  artifact: AgentOpsExternalHostInstallerArtifact
}) {
  const existing = existsSync(input.plan.installPath) ? readFileSync(input.plan.installPath, 'utf8') : null
  const installedState = inspectAgentOpsExternalHostInstalledState({
    artifact: input.artifact,
    existingContent: existing,
  })
  return { existing, installedState }
}

function printHostPackResult(input: {
  plan: AgentOpsExternalHostInstallPlan
  check: boolean
  installedState: ReturnType<typeof inspectAgentOpsExternalHostInstalledState>
  existingMatches: boolean
}) {
  const { plan, check, installedState, existingMatches } = input
  console.log([
    `Host pack: ${plan.label} (${plan.hostId})`,
    `Install target: ${plan.installTarget}`,
    `Install path: ${plan.installPath}`,
    `Content hash: ${plan.contentHash}`,
    `Mode: ${check ? 'check' : plan.dryRun ? 'dry-run' : 'write'}`,
    `Installed state: ${installedState.state}`,
    `State reason: ${installedState.reason}`,
    existingMatches ? 'Existing file already matches generated content.' : null,
    '',
  ].filter((line): line is string => line !== null).join('\n'))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
