import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import express, { type Request, type Response } from 'express'
import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai'
import type {
  MessageContext,
  MessageResponse,
  RunPacket,
  ToolExecutionResult,
} from '@lucid/agent-bridge'
import { LucidBridge } from '@lucid/agent-bridge'

const DEFAULT_RUNTIME_VERSION = 'lucid-hermes-runtime/0.1.0'
const DEFAULT_ENGINE_VERSION = 'hermes'
const DEFAULT_PORT = 3000
const DEFAULT_TIMEOUT_MS = 90_000

interface HermesAssistantConfig {
  id: string
  name: string
  system_prompt: string | null
}

interface HermesStreamRequest {
  assistantId: string
  message: string
  assistantConfig?: HermesAssistantConfig
}

export interface HermesRuntimeConfig {
  command: string
  args: string[]
  workdir?: string
  bridgeMode: 'observe' | 'full'
  runtimeId: string
  runtimeKey: string
  controlPlaneUrl: string
  engineVersion: string
  runtimeVersion: string
  port: number
  timeoutMs: number
  workerTriggerSecret?: string
  model?: string
  toolsets: string[]
  trustGateHeaders?: Record<string, string>
  hermesHome?: string
  migration?: {
    source: 'openclaw'
    preset: 'full' | 'user-data'
    dryRun: boolean
    overwrite: boolean
    sourcePath?: string
    workspaceTarget?: string
    skillConflict?: 'skip' | 'overwrite' | 'rename'
  }
}

export interface HermesTokenUsage {
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
}

export interface HermesPromptRunOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export interface HermesPromptResult {
  responseText: string
  tokenUsage: HermesTokenUsage
}

interface RuntimeLifecycleEvent {
  eventType: 'runtime_migration_started' | 'runtime_migration_completed' | 'runtime_migration_failed'
  severity: 'info' | 'warning' | 'error' | 'critical'
  payload: Record<string, unknown>
}

interface HermesToolCallEnvelope {
  type: 'tool_call'
  toolName: string
  toolArgs?: Record<string, unknown>
}

interface HermesFinalEnvelope {
  type: 'final'
  text: string
}

type HermesBridgeEnvelope = HermesToolCallEnvelope | HermesFinalEnvelope

interface ParsedToolExecutionOutput {
  error?: string
  approval_status?: 'denied' | 'expired'
}

interface ToolHistoryResultSummary {
  status: 'completed' | 'failed' | 'blocked'
  preview: string
}

interface HermesNativeToolExecutionResult {
  handled: boolean
  result?: ToolExecutionResult
}

type RuntimeFlavor = 'shared' | 'c1_managed' | 'c2a_autonomous'

const TOOL_BRIDGE_PROTOCOL = [
  'You may either answer directly or request exactly one Lucid platform tool.',
  'If you need a tool, respond with strict JSON only:',
  '{"type":"tool_call","toolName":"<tool_name>","toolArgs":{}}',
  'When you are ready to answer the user, respond with strict JSON only:',
  '{"type":"final","text":"<answer>"}',
  'Do not wrap JSON in markdown. Do not emit any extra commentary outside the JSON object.',
].join('\n')

const MAX_TOOL_ARGS_HISTORY_CHARS = 1_000
const MAX_TOOL_RESULT_HISTORY_CHARS = 2_000
const ALLOW_DIRECT_NATIVE_WRITES = process.env.HERMES_ALLOW_DIRECT_NATIVE_WRITES === 'true'

function normalizeRuntimeFlavor(value: string | undefined): RuntimeFlavor {
  return value === 'c1_managed' || value === 'c2a_autonomous' ? value : 'shared'
}

function buildRuntimeMutationPolicyPrompt(packet: Pick<RunPacket, 'assistantConfig'>): string | null {
  if (normalizeRuntimeFlavor(packet.assistantConfig.runtimeFlavor) !== 'shared') return null
  return [
    'This Hermes run is on shared multi-tenant compute.',
    'Hermes-native durable memory writes and skill mutations are not durably persisted here.',
    'Use mounted memory and imported/catalog skills as runtime inputs, not as proof of durable local Hermes state.',
  ].join('\n')
}

function requiredEnv(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function parseList(value?: string | undefined): string[] {
  if (!value?.trim()) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseHermesArgs(
  jsonValue?: string | undefined,
  plainValue?: string | undefined,
): string[] {
  if (jsonValue?.trim()) {
    const parsed = JSON.parse(jsonValue) as unknown
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      throw new Error('HERMES_ARGS_JSON must be a JSON array of strings')
    }
    return parsed
  }

  if (!plainValue?.trim()) return ['chat']
  return plainValue
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

export interface HermesPromptInput {
  assistantName?: string
  systemPrompt?: string | null
  recentMessages?: Array<{ role: 'user' | 'assistant'; content: string }>
  memoryInjection?: string[]
  boardMemories?: string[]
  conversationSummary?: string | null
  skillPrompt?: string
  toolPrompt?: string
  userMessage: string
}

export function resolveHermesRuntimeConfig(env: NodeJS.ProcessEnv = process.env): HermesRuntimeConfig {
  const bridgeMode = env.LUCID_BRIDGE_MODE?.trim() || 'observe'
  if (bridgeMode !== 'observe' && bridgeMode !== 'full') {
    throw new Error('Hermes runtime supports only LUCID_BRIDGE_MODE=observe|full')
  }

  const port = Number.parseInt(env.PORT || env.WORKER_PORT || `${DEFAULT_PORT}`, 10)
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port')
  }
  const timeoutMs = Number.parseInt(env.HERMES_TIMEOUT_MS || `${DEFAULT_TIMEOUT_MS}`, 10)
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new Error('HERMES_TIMEOUT_MS must be between 1000 and 600000')
  }

  return {
    command: env.HERMES_COMMAND?.trim() || 'hermes',
    args: parseHermesArgs(env.HERMES_ARGS_JSON, env.HERMES_ARGS),
    workdir: env.HERMES_WORKDIR?.trim() || undefined,
    bridgeMode,
    runtimeId: requiredEnv('LUCID_RUNTIME_ID', env),
    runtimeKey: requiredEnv('LUCID_RUNTIME_KEY', env),
    controlPlaneUrl: requiredEnv('LUCID_CONTROL_PLANE_URL', env),
    engineVersion: env.HERMES_ENGINE_VERSION?.trim() || DEFAULT_ENGINE_VERSION,
    runtimeVersion: env.HERMES_RUNTIME_VERSION?.trim() || DEFAULT_RUNTIME_VERSION,
    port,
    timeoutMs,
    workerTriggerSecret: env.WORKER_TRIGGER_SECRET?.trim() || undefined,
    model: env.HERMES_MODEL?.trim() || undefined,
    toolsets: parseList(env.HERMES_TOOLSETS),
    hermesHome: env.HERMES_HOME?.trim() || (env.HOME ? path.join(env.HOME, '.hermes') : undefined),
    migration: env.HERMES_MIGRATE_OPENCLAW === 'true'
      ? {
          source: 'openclaw',
          preset: env.HERMES_MIGRATE_PRESET === 'full' ? 'full' : 'user-data',
          dryRun: env.HERMES_MIGRATE_DRY_RUN === 'true',
          overwrite: env.HERMES_MIGRATE_OVERWRITE === 'true',
          sourcePath: env.HERMES_MIGRATE_SOURCE?.trim() || undefined,
          workspaceTarget: env.HERMES_MIGRATE_WORKSPACE_TARGET?.trim() || undefined,
          skillConflict:
            env.HERMES_MIGRATE_SKILL_CONFLICT === 'overwrite' ||
            env.HERMES_MIGRATE_SKILL_CONFLICT === 'rename'
              ? env.HERMES_MIGRATE_SKILL_CONFLICT
              : env.HERMES_MIGRATE_SKILL_CONFLICT === 'skip'
                ? 'skip'
                : undefined,
        }
      : undefined,
  }
}

function buildHermesMigrationArgs(config: HermesRuntimeConfig): string[] | null {
  if (!config.migration) return null

  const args = ['claw', 'migrate', '--preset', config.migration.preset]
  if (config.migration.dryRun) args.push('--dry-run')
  if (config.migration.overwrite) args.push('--overwrite')
  if (config.migration.sourcePath) args.push('--source', config.migration.sourcePath)
  if (config.migration.workspaceTarget) args.push('--workspace-target', config.migration.workspaceTarget)
  if (config.migration.skillConflict) args.push('--skill-conflict', config.migration.skillConflict)
  args.push('--yes')
  return args
}

function buildHermesChatArgs(
  config: HermesRuntimeConfig,
  prompt: string,
): string[] {
  const args = ['chat', '-q', prompt, '--quiet']

  if (config.model) {
    args.push('--model', config.model)
  }

  for (const toolset of config.toolsets) {
    args.push('--toolsets', toolset)
  }

  return args
}

export function buildPrompt(input: HermesPromptInput): string {
  const sections: string[] = []

  if (input.assistantName) {
    sections.push(`Assistant: ${input.assistantName}`)
  }

  if (input.systemPrompt?.trim()) {
    sections.push(`System instructions:\n${input.systemPrompt.trim()}`)
  }

  if (input.memoryInjection?.length) {
    sections.push(`Memories:\n${input.memoryInjection.join('\n')}`)
  }

  if (input.boardMemories?.length) {
    sections.push(`Organization knowledge:\n${input.boardMemories.join('\n')}`)
  }

  if (input.conversationSummary?.trim()) {
    sections.push(`Conversation summary:\n${input.conversationSummary.trim()}`)
  }

  if (input.skillPrompt?.trim()) {
    sections.push(input.skillPrompt.trim())
  }

  if (input.toolPrompt?.trim()) {
    sections.push(input.toolPrompt.trim())
  }

  if (input.recentMessages?.length) {
    sections.push(
      `Recent conversation:\n${input.recentMessages
        .map((message) => `${message.role}: ${message.content}`)
        .join('\n')}`,
    )
  }

  sections.push(`User message:\n${input.userMessage}`)
  return sections.join('\n\n')
}

export function buildRuntimeToolPrompt(packet: Pick<RunPacket, 'assistantConfig' | 'plugins'>): string {
  const sections: string[] = []
  const runtimeFlavor = normalizeRuntimeFlavor(packet.assistantConfig.runtimeFlavor)

  if (runtimeFlavor !== 'shared') {
    sections.push(
      [
        'Hermes native tools available on this runtime:',
        '- **memory**: propose a reviewable Hermes local memory candidate. Args: {"content":"...","target":"memory|user","mode":"append|replace"}',
        '- **skill_manage**: propose create/update/delete candidates for Hermes local skills. Args: {"action":"create|update|delete","slug":"skill-slug","content":"...","mode":"replace|append"}',
        '- **skill_manage_create** / **skill_manage_update** / **skill_manage_delete** are also supported aliases.',
        'Native filesystem mutations require candidate review unless HERMES_ALLOW_DIRECT_NATIVE_WRITES=true is explicitly set for an emergency legacy path.',
      ].join('\n'),
    )
  }

  if (packet.assistantConfig.enabledTools.length > 0) {
    sections.push(`Lucid-enabled tools: ${packet.assistantConfig.enabledTools.join(', ')}`)
  }

  if (packet.plugins.length > 0) {
    const pluginLines = packet.plugins.flatMap((plugin) =>
      plugin.tools.map((tool) => `- **${plugin.slug}__${tool.name}**: ${tool.description}`),
    )
    if (pluginLines.length > 0) {
      sections.push(`Activated plugin tools:\n${pluginLines.join('\n')}`)
    }
  }

  if (packet.assistantConfig.approvalRequiredTools.length > 0) {
    sections.push(
      `Approval-gated tools: ${packet.assistantConfig.approvalRequiredTools.join(', ')}. ` +
      'Lucid governance will pause and request approval before these actions execute.',
    )
  }

  if (sections.length === 0) return ''
  return `## Tooling\n${sections.join('\n\n')}`
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    const candidate = fenced[1].trim()
    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      return candidate
    }
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }

  return null
}

function parseBridgeEnvelope(text: string): HermesBridgeEnvelope | null {
  const json = extractJsonObject(text)
  if (!json) return null

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    if (parsed.type === 'tool_call' && typeof parsed.toolName === 'string') {
      return {
        type: 'tool_call',
        toolName: parsed.toolName,
        toolArgs:
          typeof parsed.toolArgs === 'object' && parsed.toolArgs != null
            ? (parsed.toolArgs as Record<string, unknown>)
            : {},
      }
    }

    if (parsed.type === 'final' && typeof parsed.text === 'string') {
      return {
        type: 'final',
        text: parsed.text,
      }
    }
  } catch {
    return null
  }

  return null
}

function parseToolExecutionOutput(output: string): ParsedToolExecutionOutput | null {
  const json = extractJsonObject(output)
  if (!json) return null

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    const error = typeof parsed.error === 'string' ? parsed.error : undefined
    const approvalStatus =
      parsed.approval_status === 'denied' || parsed.approval_status === 'expired'
        ? parsed.approval_status
        : undefined
    if (!error && !approvalStatus) {
      return null
    }
    return {
      error,
      approval_status: approvalStatus,
    }
  } catch {
    return null
  }
}

function trimForHistory(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`
}

function summarizeToolExecutionOutput(result: ToolExecutionResult): ToolHistoryResultSummary {
  const parsed = parseToolExecutionOutput(result.output)
  if (parsed?.approval_status) {
    return {
      status: 'blocked',
      preview: trimForHistory(parsed.error ?? result.output, MAX_TOOL_RESULT_HISTORY_CHARS),
    }
  }
  if (result.status === 'failed' || parsed?.error) {
    return {
      status: 'failed',
      preview: trimForHistory(parsed?.error ?? result.output, MAX_TOOL_RESULT_HISTORY_CHARS),
    }
  }
  return {
    status: 'completed',
    preview: trimForHistory(result.output, MAX_TOOL_RESULT_HISTORY_CHARS),
  }
}

function estimateTokenCount(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

function estimateCostUsd(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number,
): number {
  const lower = (model || '').toLowerCase()
  const rates = [
    { key: 'gpt-4o-mini', input: 0.15, output: 0.6 },
    { key: 'gpt-4o', input: 2.5, output: 10.0 },
    { key: 'gpt-4.1-mini', input: 0.4, output: 1.6 },
    { key: 'gpt-4.1', input: 2.0, output: 8.0 },
    { key: 'claude-3-haiku', input: 0.25, output: 1.25 },
    { key: 'claude-3-5-sonnet', input: 3.0, output: 15.0 },
    { key: 'default', input: 1.0, output: 3.0 },
  ] as const
  const rate = rates.find((entry) => lower.includes(entry.key)) ?? rates[rates.length - 1]
  return ((inputTokens / 1_000_000) * rate.input) + ((outputTokens / 1_000_000) * rate.output)
}

function trimOutput(text: string, maxChars = 4_000): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`
}

async function postRuntimeLifecycleEvent(
  config: HermesRuntimeConfig,
  event: RuntimeLifecycleEvent,
): Promise<void> {
  try {
    await fetch(`${config.controlPlaneUrl}/api/runtimes/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.runtimeKey}`,
      },
      body: JSON.stringify({
        events: [
          {
            eventType: event.eventType,
            severity: event.severity,
            payload: event.payload,
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    console.warn(
      '[hermes-runtime] failed to report lifecycle event',
      event.eventType,
      error instanceof Error ? error.message : error,
    )
  }
}

async function waitForSpawn(child: ReturnType<typeof spawn>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', () => resolve())
    child.once('error', (error) => reject(error))
  })
}

async function waitForExit(child: ReturnType<typeof spawn>): Promise<{
  code: number | null
  signal: NodeJS.Signals | null
}> {
  return new Promise((resolve, reject) => {
    child.once('error', (error) => reject(error))
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}

export async function runHermesPromptDetailed(
  config: HermesRuntimeConfig,
  prompt: string,
  options: HermesPromptRunOptions = {},
): Promise<HermesPromptResult> {
  const args = buildHermesChatArgs(config, prompt)

  return new Promise((resolve, reject) => {
    const child = spawn(config.command, args, {
      cwd: config.workdir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timeoutMs = options.timeoutMs ?? config.timeoutMs
    const timeoutId = setTimeout(() => {
      if (settled) return
      stderr += `Hermes timed out after ${timeoutMs}ms`
      try { child.kill('SIGTERM') } catch {}
      setTimeout(() => {
        if (!settled) {
          try { child.kill('SIGKILL') } catch {}
        }
      }, 2_000).unref()
    }, timeoutMs)

    const abortHandler = () => {
      if (settled) return
      stderr += 'Hermes run aborted'
      try { child.kill('SIGTERM') } catch {}
    }
    options.signal?.addEventListener('abort', abortHandler, { once: true })

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.once('error', (error) => {
      settled = true
      clearTimeout(timeoutId)
      options.signal?.removeEventListener('abort', abortHandler)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      settled = true
      clearTimeout(timeoutId)
      options.signal?.removeEventListener('abort', abortHandler)
      if (signal) {
        reject(new Error(stderr.trim() || `Hermes exited via signal ${signal}`))
        return
      }

      if ((code ?? 0) !== 0) {
        reject(new Error(stderr.trim() || `Hermes exited with code ${code}`))
        return
      }

      const response = stdout.trim()
      if (!response) {
        reject(new Error(stderr.trim() || 'Hermes returned an empty response'))
        return
      }

      const inputTokens = estimateTokenCount(prompt)
      const outputTokens = estimateTokenCount(response)
      resolve({
        responseText: response,
        tokenUsage: {
          inputTokens,
          outputTokens,
          estimatedCostUsd: estimateCostUsd(config.model, inputTokens, outputTokens),
        },
      })
    })
  })
}

async function maybeRunOpenClawMigration(config: HermesRuntimeConfig): Promise<void> {
  const migrationArgs = buildHermesMigrationArgs(config)
  if (!migrationArgs) return

  const startedAt = Date.now()
  const migrationMeta = {
    source: 'openclaw',
    preset: config.migration!.preset,
    dryRun: config.migration!.dryRun,
    overwrite: config.migration!.overwrite,
    sourcePathPresent: Boolean(config.migration!.sourcePath),
    workspaceTargetPresent: Boolean(config.migration!.workspaceTarget),
    skillConflict: config.migration!.skillConflict ?? null,
  }

  await postRuntimeLifecycleEvent(config, {
    eventType: 'runtime_migration_started',
    severity: 'info',
    payload: migrationMeta,
  })

  try {
    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(config.command, migrationArgs, {
        cwd: config.workdir,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''

      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.once('error', (error) => reject(error))
      child.once('exit', (code, signal) => {
        if (signal) {
          reject(new Error(trimOutput(stderr.trim() || `Hermes migration exited via signal ${signal}`)))
          return
        }
        if ((code ?? 0) !== 0) {
          reject(new Error(trimOutput(stderr.trim() || `Hermes migration exited with code ${code}`)))
          return
        }
        resolve({ stdout, stderr })
      })
    })

    const durationMs = Date.now() - startedAt
    await postRuntimeLifecycleEvent(config, {
      eventType: 'runtime_migration_completed',
      severity: 'info',
      payload: {
        ...migrationMeta,
        durationMs,
        stdoutPreview: result.stdout.trim() ? trimOutput(result.stdout.trim()) : undefined,
        stderrPreview: result.stderr.trim() ? trimOutput(result.stderr.trim()) : undefined,
      },
    })
  } catch (error) {
    await postRuntimeLifecycleEvent(config, {
      eventType: 'runtime_migration_failed',
      severity: 'error',
      payload: {
        ...migrationMeta,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
    })
    throw error
  }
}

export async function runHermesPrompt(
  config: HermesRuntimeConfig,
  prompt: string,
  options: HermesPromptRunOptions = {},
): Promise<string> {
  const result = await runHermesPromptDetailed(config, prompt, options)
  return result.responseText
}

function formatToolResult(result: ToolExecutionResult): string {
  return JSON.stringify(summarizeToolExecutionOutput(result))
}

function normalizeSkillSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function resolveHermesHome(config: HermesRuntimeConfig): string {
  if (config.hermesHome?.trim()) return config.hermesHome
  if (process.env.HOME?.trim()) return path.join(process.env.HOME, '.hermes')
  throw new Error('Hermes native mutation execution requires HERMES_HOME or HOME')
}

function resolveMemoryTargetFile(hermesHome: string, target: unknown): string {
  const normalized = typeof target === 'string' ? target.trim().toLowerCase() : 'memory'
  const fileName = normalized === 'user' || normalized === 'user.md' ? 'USER.md' : 'MEMORY.md'
  return path.join(hermesHome, 'memories', fileName)
}

async function writeMemoryFile(filePath: string, content: string, mode: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  if (mode === 'replace') {
    await writeFile(filePath, content.trimEnd() + '\n', 'utf8')
    return
  }

  let existing = ''
  try {
    existing = await readFile(filePath, 'utf8')
  } catch {}
  const next = existing.trimEnd()
    ? `${existing.trimEnd()}\n\n${content.trim()}`
    : content.trim()
  await writeFile(filePath, `${next}\n`, 'utf8')
}

async function writeSkillFile(
  skillPath: string,
  content: string,
  mode: unknown,
  allowCreate: boolean,
): Promise<void> {
  const filePath = path.join(skillPath, 'SKILL.md')
  let existing = ''
  let exists = false
  try {
    await stat(filePath)
    exists = true
    existing = await readFile(filePath, 'utf8')
  } catch {}

  if (!exists && !allowCreate) {
    throw new Error('Skill does not exist')
  }

  await mkdir(skillPath, { recursive: true })
  const next = mode === 'append' && existing.trimEnd()
    ? `${existing.trimEnd()}\n\n${content.trim()}`
    : content.trim()
  await writeFile(filePath, `${next}\n`, 'utf8')
}

function nativeMutationCandidateRequired(payload: Record<string, unknown>): HermesNativeToolExecutionResult {
  return {
    handled: true,
    result: {
      status: 'failed',
      output: JSON.stringify({
        ok: false,
        approval_status: 'candidate_required',
        error: 'Hermes native filesystem mutations must be proposed as reviewable candidates.',
        candidate: payload,
      }),
    },
  }
}

export async function executeHermesNativeTool(
  config: HermesRuntimeConfig,
  packet: RunPacket,
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<HermesNativeToolExecutionResult> {
  const runtimeFlavor = normalizeRuntimeFlavor(packet.assistantConfig.runtimeFlavor)
  if (runtimeFlavor === 'shared') {
    return {
      handled: true,
      result: {
        status: 'failed',
        output: JSON.stringify({
          error: 'Hermes native mutation is not available on shared compute.',
          approval_status: 'denied',
        }),
      },
    }
  }

  const hermesHome = resolveHermesHome(config)

  if (toolName === 'memory') {
    const content =
      typeof toolArgs.content === 'string' ? toolArgs.content
        : typeof toolArgs.text === 'string' ? toolArgs.text
          : null
    if (!content?.trim()) {
      return {
        handled: true,
        result: {
          status: 'failed',
          output: JSON.stringify({ error: 'Hermes memory tool requires non-empty "content".' }),
        },
      }
    }
    const filePath = resolveMemoryTargetFile(hermesHome, toolArgs.target)
    if (!ALLOW_DIRECT_NATIVE_WRITES) {
      return nativeMutationCandidateRequired({
        tool: 'memory',
        target: path.relative(hermesHome, filePath),
        mode: toolArgs.mode === 'replace' ? 'replace' : 'append',
        content,
      })
    }
    await writeMemoryFile(filePath, content, toolArgs.mode)
    return {
      handled: true,
      result: {
        status: 'completed',
        output: JSON.stringify({
          ok: true,
          tool: 'memory',
          target: path.basename(filePath),
          mode: toolArgs.mode === 'replace' ? 'replace' : 'append',
        }),
      },
    }
  }

  const normalizedSkillAction =
    toolName === 'skill_manage_create' ? 'create'
      : toolName === 'skill_manage_update' ? 'update'
        : toolName === 'skill_manage_delete' ? 'delete'
          : toolName === 'skill_manage' && typeof toolArgs.action === 'string' ? toolArgs.action.trim().toLowerCase()
            : null

  if (!normalizedSkillAction || !['create', 'update', 'delete'].includes(normalizedSkillAction)) {
    return { handled: false }
  }

  const slugSource =
    typeof toolArgs.slug === 'string' ? toolArgs.slug
      : typeof toolArgs.name === 'string' ? toolArgs.name
        : null
  const slug = slugSource ? normalizeSkillSlug(slugSource) : ''
  if (!slug) {
    return {
      handled: true,
      result: {
        status: 'failed',
        output: JSON.stringify({ error: 'Hermes skill mutation requires a valid "slug" or "name".' }),
      },
    }
  }

  const skillPath = path.join(hermesHome, 'skills', slug)
  if (normalizedSkillAction === 'delete') {
    if (!ALLOW_DIRECT_NATIVE_WRITES) {
      return nativeMutationCandidateRequired({
        tool: 'skill_manage',
        action: 'delete',
        target: path.relative(hermesHome, skillPath),
        slug,
      })
    }
    await rm(skillPath, { recursive: true, force: true })
    return {
      handled: true,
      result: {
        status: 'completed',
        output: JSON.stringify({ ok: true, tool: 'skill_manage', action: 'delete', slug }),
      },
    }
  }

  const content =
    typeof toolArgs.content === 'string' ? toolArgs.content
      : typeof toolArgs.body === 'string' ? toolArgs.body
        : null
  if (!content?.trim()) {
    return {
      handled: true,
      result: {
        status: 'failed',
        output: JSON.stringify({ error: `Hermes skill ${normalizedSkillAction} requires non-empty "content".` }),
      },
    }
  }

  if (!ALLOW_DIRECT_NATIVE_WRITES) {
    return nativeMutationCandidateRequired({
      tool: 'skill_manage',
      action: normalizedSkillAction,
      target: path.relative(hermesHome, path.join(skillPath, 'SKILL.md')),
      slug,
      mode: toolArgs.mode === 'append' ? 'append' : 'replace',
      content,
    })
  }

  await writeSkillFile(skillPath, content, toolArgs.mode, normalizedSkillAction === 'create')
  return {
    handled: true,
    result: {
      status: 'completed',
      output: JSON.stringify({
        ok: true,
        tool: 'skill_manage',
        action: normalizedSkillAction,
        slug,
        mode: toolArgs.mode === 'append' ? 'append' : 'replace',
      }),
    },
  }
}

async function runHermesPacketWithToolBridge(
  config: HermesRuntimeConfig,
  packet: RunPacket,
  ctx: MessageContext,
): Promise<MessageResponse> {
  const toolHistory: string[] = []
  let aggregateInputTokens = 0
  let aggregateOutputTokens = 0
  let aggregateCostUsd = 0
  const maxSteps = Math.max(1, packet.assistantConfig.enabledTools.length || 1)
  const mutationPolicyPrompt = buildRuntimeMutationPolicyPrompt(packet)

  for (let step = 0; step <= maxSteps; step++) {
    const prompt = buildPrompt({
      assistantName: packet.assistantConfig.name,
      systemPrompt: [
        packet.assistantConfig.systemPrompt?.trim(),
        mutationPolicyPrompt,
        TOOL_BRIDGE_PROTOCOL,
        toolHistory.length > 0 ? `Tool interaction history:\n${toolHistory.join('\n\n')}` : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
      recentMessages: packet.recentMessages,
      memoryInjection: packet.memoryInjection,
      boardMemories: packet.boardMemories,
      conversationSummary: packet.conversationSummary,
      toolPrompt: buildRuntimeToolPrompt(packet),
      userMessage: packet.userMessage.text,
    })

    const result = await runHermesPromptDetailed(
      {
        ...config,
        model: packet.assistantConfig.modelId || config.model,
      },
      prompt,
    )

    aggregateInputTokens += result.tokenUsage.inputTokens
    aggregateOutputTokens += result.tokenUsage.outputTokens
    aggregateCostUsd += result.tokenUsage.estimatedCostUsd

    const parsed = parseBridgeEnvelope(result.responseText)
    if (!parsed) {
      return {
        responseText: result.responseText,
        tokenUsage: {
          inputTokens: aggregateInputTokens,
          outputTokens: aggregateOutputTokens,
          estimatedCostUsd: aggregateCostUsd,
        },
      }
    }

    if (parsed.type === 'final') {
      return {
        responseText: parsed.text,
        tokenUsage: {
          inputTokens: aggregateInputTokens,
          outputTokens: aggregateOutputTokens,
          estimatedCostUsd: aggregateCostUsd,
        },
      }
    }

    const nativeToolResult = await executeHermesNativeTool(
      config,
      packet,
      parsed.toolName,
      parsed.toolArgs ?? {},
    )
    if (nativeToolResult.handled) {
      toolHistory.push(
        `Tool request ${step + 1}: ${trimForHistory(
          JSON.stringify({
            toolName: parsed.toolName,
            toolArgs: parsed.toolArgs ?? {},
          }),
          MAX_TOOL_ARGS_HISTORY_CHARS,
        )}\nTool result ${step + 1}: ${formatToolResult(nativeToolResult.result!)}`,
      )
      continue
    }

    const toolResult = await ctx.executeTool!({
      toolName: parsed.toolName,
      toolArgs: parsed.toolArgs ?? {},
    })

    const parsedToolOutput = parseToolExecutionOutput(toolResult.output)
    if (parsedToolOutput?.approval_status && parsedToolOutput.error) {
      return {
        responseText: parsedToolOutput.error,
        tokenUsage: {
          inputTokens: aggregateInputTokens,
          outputTokens: aggregateOutputTokens,
          estimatedCostUsd: aggregateCostUsd,
        },
      }
    }

    toolHistory.push(
      `Tool request ${step + 1}: ${trimForHistory(
        JSON.stringify({
          toolName: parsed.toolName,
          toolArgs: parsed.toolArgs ?? {},
        }),
        MAX_TOOL_ARGS_HISTORY_CHARS,
      )}\nTool result ${step + 1}: ${formatToolResult(toolResult)}`,
    )
  }

  return {
    responseText: 'I could not complete the tool workflow within the allowed number of steps.',
    tokenUsage: {
      inputTokens: aggregateInputTokens,
      outputTokens: aggregateOutputTokens,
      estimatedCostUsd: aggregateCostUsd,
    },
  }
}

async function runHermesPacket(
  config: HermesRuntimeConfig,
  packet: RunPacket,
  ctx?: MessageContext,
): Promise<MessageResponse> {
  if (ctx?.executeTool && packet.assistantConfig.enabledTools.length > 0) {
    return runHermesPacketWithToolBridge(config, packet, ctx)
  }

  const prompt = buildPrompt({
    assistantName: packet.assistantConfig.name,
    systemPrompt: [
      packet.assistantConfig.systemPrompt?.trim(),
      buildRuntimeMutationPolicyPrompt(packet),
    ].filter(Boolean).join('\n\n'),
    recentMessages: packet.recentMessages,
    memoryInjection: packet.memoryInjection,
    boardMemories: packet.boardMemories,
    conversationSummary: packet.conversationSummary,
    toolPrompt: buildRuntimeToolPrompt(packet),
    userMessage: packet.userMessage.text,
  })

  const result = await runHermesPromptDetailed({
    ...config,
    model: packet.assistantConfig.modelId || config.model,
  }, prompt)
  return {
    responseText: result.responseText,
    tokenUsage: result.tokenUsage,
  }
}

export function authorizeRequest(
  req: { headers: { authorization?: string | string[] } },
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret) return false
  const header = req.headers.authorization
  return typeof header === 'string' && header === `Bearer ${expectedSecret}`
}

async function startHermesObserveRuntime(config: HermesRuntimeConfig): Promise<void> {
  const bridge = new LucidBridge({
    runtimeId: config.runtimeId,
    runtimeKey: config.runtimeKey,
    controlPlaneUrl: config.controlPlaneUrl,
    mode: 'observe',
    engine: 'hermes',
    runtimeProtocol: 'lucid-runtime-v2',
    engineVersion: config.engineVersion,
    runtimeVersion: config.runtimeVersion,
  })

  const child = spawn(config.command, config.args, {
    cwd: config.workdir,
    env: process.env,
    stdio: 'inherit',
  })

  await waitForSpawn(child)
  await bridge.start()

  let shuttingDown = false
  const forwardSignal = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return
    shuttingDown = true
    child.kill(signal)
    await bridge.stop()
  }

  process.on('SIGINT', () => {
    void forwardSignal('SIGINT')
  })
  process.on('SIGTERM', () => {
    void forwardSignal('SIGTERM')
  })

  const result = await waitForExit(child)
  await bridge.stop()

  if (result.signal) {
    process.kill(process.pid, result.signal)
    return
  }

  process.exit(result.code ?? 0)
}

async function startHermesFullRuntime(config: HermesRuntimeConfig): Promise<void> {
  const bridge = new LucidBridge({
    runtimeId: config.runtimeId,
    runtimeKey: config.runtimeKey,
    controlPlaneUrl: config.controlPlaneUrl,
    mode: 'full',
    engine: 'hermes',
    runtimeProtocol: 'lucid-runtime-v2',
    engineVersion: config.engineVersion,
    runtimeVersion: config.runtimeVersion,
  })

  bridge.onMessage((packet, ctx) => runHermesPacket(config, packet, ctx))

  await bridge.start()

  const app = express()
  app.use(express.json({ limit: '2mb' }))

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      engine: 'hermes',
      runtimeId: config.runtimeId,
      mode: config.bridgeMode,
    })
  })

  app.post('/stream', async (req: Request, res: Response) => {
    if (!authorizeRequest(req, config.workerTriggerSecret)) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const body = req.body as HermesStreamRequest
    if (!body.assistantId || !body.message) {
      res.status(400).json({ error: 'Missing required fields (assistantId, message)' })
      return
    }

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const textId = crypto.randomUUID()
        writer.write({ type: 'text-start', id: textId })

        try {
          const prompt = buildPrompt({
            assistantName: body.assistantConfig?.name,
            systemPrompt: body.assistantConfig?.system_prompt,
            userMessage: body.message,
          })
          const result = await runHermesPromptDetailed(config, prompt)
          writer.write({ type: 'text-delta', id: textId, delta: result.responseText })
          writer.write({ type: 'text-end', id: textId })
        } catch (error) {
          writer.write({
            type: 'error',
            errorText: error instanceof Error ? error.message : String(error),
          })
        }
      },
    })

    pipeUIMessageStreamToResponse({ response: res, stream })
  })

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const instance = app.listen(config.port, '0.0.0.0', () => resolve(instance))
  })

  let stopping = false
  const shutdown = async () => {
    if (stopping) return
    stopping = true
    await bridge.stop()
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  process.on('SIGINT', () => {
    void shutdown()
  })
  process.on('SIGTERM', () => {
    void shutdown()
  })
}

export async function startHermesRuntime(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = resolveHermesRuntimeConfig(env)
  await maybeRunOpenClawMigration(config)

  if (config.bridgeMode === 'full') {
    await startHermesFullRuntime(config)
    return
  }

  await startHermesObserveRuntime(config)
}

const isDirectExecution =
  process.argv[1] != null && fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectExecution) {
  void startHermesRuntime().catch(async (error) => {
    console.error('[hermes-runtime] startup failed:', error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
