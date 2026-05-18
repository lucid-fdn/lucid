import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS,
  createAgentCommerceGaFinalLocalGate,
  type AgentCommerceGaFinalLocalGateCommandResult,
} from '../src/lib/agent-commerce/ga-final-local-gate'
import {
  AgentCommerceGaReleaseDossierVerificationResultSchema,
} from '../src/lib/agent-commerce/ga-release-bundle'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase())
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error(`${name} is required to run the Agent Commerce GA final local gate.`)
  return trimmed
}

function absolutePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)
}

function tail(value: string): string {
  return value.length > 12000 ? value.slice(-12000) : value
}

function readJsonFile(filePath: string, envName: string): unknown {
  const absolute = absolutePath(filePath)
  if (!existsSync(absolute)) throw new Error(`${envName} does not exist: ${filePath}`)
  return JSON.parse(readFileSync(absolute, 'utf8'))
}

function runCommand(
  id: AgentCommerceGaFinalLocalGateCommandResult['id'],
  command: string,
): AgentCommerceGaFinalLocalGateCommandResult {
  const startedAt = Date.now()
  console.error(`Running ${id}: ${command}`)
  const result = spawnSync(command, {
    cwd: repoRoot,
    env: process.env,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  const durationMs = Date.now() - startedAt

  return {
    id,
    command,
    exit_code: result.status,
    passed: result.status === 0,
    duration_ms: durationMs,
    stdout_tail: tail(result.stdout ?? ''),
    stderr_tail: tail(result.stderr ?? ''),
  }
}

const dossierVerificationFile = required(
  process.env.AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_FILE,
  'AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_FILE',
)
const commandResults = AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_COMMANDS.map((command) => {
  return runCommand(command.id, command.command)
})
const gate = createAgentCommerceGaFinalLocalGate({
  dossierVerification: AgentCommerceGaReleaseDossierVerificationResultSchema.parse(
    readJsonFile(dossierVerificationFile, 'AGENT_COMMERCE_GA_RELEASE_DOSSIER_VERIFY_FILE'),
  ),
  commands: commandResults,
  evaluatedAt: process.env.AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_EVALUATED_AT?.trim() || undefined,
})

const json = `${JSON.stringify(gate, null, 2)}\n`
const output = process.env.AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_OUTPUT?.trim()

if (output) {
  const absolute = absolutePath(output)
  mkdirSync(path.dirname(absolute), { recursive: true })
  writeFileSync(absolute, json)
  console.error(`Wrote Agent Commerce GA final local gate to ${path.relative(repoRoot, absolute)}`)
} else {
  process.stdout.write(json)
}

if (!gate.ready) {
  console.error('Agent Commerce GA final local gate is not ready:')
  console.error(`- blockers=${gate.blockers.join(',') || 'none'}`)
  console.error(`- missing commands=${gate.missing_command_ids.join(',') || 'none'}`)
  console.error(`- failed commands=${gate.failed_command_ids.join(',') || 'none'}`)
  console.error(`- unexpected commands=${gate.unexpected_command_ids.join(',') || 'none'}`)
}

if (truthy(process.env.AGENT_COMMERCE_GA_FINAL_LOCAL_GATE_REQUIRE_READY) && !gate.ready) {
  process.exit(1)
}
