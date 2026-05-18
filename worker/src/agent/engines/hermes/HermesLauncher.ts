import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'
import { load as parseYaml, dump as dumpYaml } from 'js-yaml'
import type {
  HermesPromptResult,
  HermesRuntimeConfig,
} from '@lucid/hermes-runtime'
import { getWorkerLucidProviderConfig } from '../../../ai/lucid-provider-config.js'

export interface HermesLaunchOptions {
  args: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  stdin?: string
  timeoutMs?: number
  signal?: AbortSignal
}

export interface HermesLaunchResult {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export class HermesProcessError extends Error {
  constructor(
    message: string,
    readonly result: HermesLaunchResult,
  ) {
    super(message)
    this.name = 'HermesProcessError'
  }
}

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_STDERR_PREVIEW_CHARS = 240

function trimPreview(text: string): string {
  const normalized = text.trim()
  if (normalized.length <= MAX_STDERR_PREVIEW_CHARS) return normalized
  return `${normalized.slice(0, MAX_STDERR_PREVIEW_CHARS)}...`
}

function trimVersionLabel(text: string): string {
  return trimPreview(text).split('\n')[0] ?? 'available'
}

function summarizeHermesArgs(args: unknown): unknown {
  if (!Array.isArray(args)) return args
  const stringArgs = args.filter((arg): arg is string => typeof arg === 'string')
  const modelFlagIndex = stringArgs.findIndex((arg) => arg === '--model' || arg === '-m')
  const toolsetCount = stringArgs.filter((arg) => arg === '--toolsets').length
  return {
    command: stringArgs[0] ?? 'hermes',
    count: stringArgs.length,
    model: modelFlagIndex >= 0 ? stringArgs[modelFlagIndex + 1] : undefined,
    toolsetCount,
  }
}

function sanitizeLaunchPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'args') {
      sanitized[key] = summarizeHermesArgs(value)
      continue
    }
    if (/path|home|url/i.test(key)) {
      sanitized[key] = value ? 'configured' : value
      continue
    }
    if (/stderrPreview/i.test(key)) {
      sanitized[key] = value ? 'redacted' : value
      continue
    }
    sanitized[key] = value
  }
  return sanitized
}

function logHermesLaunch(
  event: string,
  payload: Record<string, unknown>,
): void {
  console.log('[hermes:launcher]', event, sanitizeLaunchPayload(payload))
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

function trimEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function ensureV1Suffix(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '')
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`
}

function resolveTargetUrl(req: IncomingMessage, targetBaseUrl: string): string {
  const base = new URL(ensureV1Suffix(targetBaseUrl))
  const requestPath = req.url || '/'
  return `${base.origin}${requestPath.startsWith('/') ? requestPath : `/${requestPath}`}`
}

function buildForwardHeaders(
  req: IncomingMessage,
  apiKey: string,
  trustGateHeaders: Record<string, string>,
  hasJsonBodyOverride = false,
): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue
    const lower = key.toLowerCase()
    if (['host', 'connection', 'content-length', 'authorization'].includes(lower)) continue
    headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }
  headers.set('authorization', `Bearer ${apiKey}`)
  if (hasJsonBodyOverride) {
    headers.set('content-type', 'application/json')
  }
  for (const [key, value] of Object.entries(trustGateHeaders)) {
    const trimmed = value.trim()
    if (trimmed) headers.set(key, trimmed)
  }
  return headers
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function shouldInjectChatModel(req: IncomingMessage): boolean {
  return (req.url || '').toLowerCase().includes('/chat/completions')
}

function withDefaultChatModel(
  body: Buffer,
  defaultModel: string | undefined,
): { body: Buffer; jsonOverride: boolean } {
  if (!defaultModel || body.length === 0) return { body, jsonOverride: false }
  try {
    const parsed = JSON.parse(body.toString('utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { body, jsonOverride: false }
    }
    const payload = parsed as Record<string, unknown>
    if (typeof payload.model === 'string' && payload.model.trim()) {
      return { body, jsonOverride: false }
    }
    return {
      body: Buffer.from(JSON.stringify({ ...payload, model: defaultModel })),
      jsonOverride: true,
    }
  } catch {
    return { body, jsonOverride: false }
  }
}

async function proxyTrustGateRequest(
  req: IncomingMessage,
  res: ServerResponse,
  targetBaseUrl: string,
  apiKey: string,
  trustGateHeaders: Record<string, string>,
  defaultModel: string | undefined,
): Promise<void> {
  try {
    const method = req.method || 'GET'
    const hasBody = !['GET', 'HEAD'].includes(method.toUpperCase())
    const rawBody = hasBody ? await readRequestBody(req) : undefined
    const bodyOverride = rawBody && shouldInjectChatModel(req)
      ? withDefaultChatModel(rawBody, defaultModel)
      : { body: rawBody, jsonOverride: false }
    const upstream = await fetch(resolveTargetUrl(req, targetBaseUrl), {
      method,
      headers: buildForwardHeaders(req, apiKey, trustGateHeaders, bodyOverride.jsonOverride),
      body: hasBody ? bodyOverride.body : undefined,
    } as RequestInit)

    res.statusCode = upstream.status
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding') {
        res.setHeader(key, value)
      }
    })
    if (!upstream.body) {
      res.end()
      return
    }
    Readable.fromWeb(upstream.body as unknown as ReadableStream).pipe(res)
  } catch {
    if (!res.headersSent) {
      res.statusCode = 502
      res.setHeader('content-type', 'application/json')
    }
    res.end(JSON.stringify({ error: { message: 'Lucid TrustGate bridge request failed' } }))
  }
}

async function startTrustGateHeaderProxy(
  targetBaseUrl: string,
  apiKey: string,
  trustGateHeaders: Record<string, string> | undefined,
  defaultModel: string | undefined,
): Promise<{ baseUrl: string; close: () => Promise<void> } | null> {
  if (!targetBaseUrl || !apiKey || !trustGateHeaders || Object.keys(trustGateHeaders).length === 0) {
    return null
  }

  const server = createServer((req, res) => {
    void proxyTrustGateRequest(req, res, targetBaseUrl, apiKey, trustGateHeaders, defaultModel)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    return null
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

function resolveHermesHome(env: NodeJS.ProcessEnv): string | null {
  const explicitHermesHome = trimEnvValue(env.HERMES_HOME)
  if (explicitHermesHome) return explicitHermesHome

  const homeDir =
    trimEnvValue(env.HOME)
    ?? trimEnvValue(env.USERPROFILE)
    ?? (trimEnvValue(env.HOMEDRIVE) && trimEnvValue(env.HOMEPATH)
      ? `${trimEnvValue(env.HOMEDRIVE)}${trimEnvValue(env.HOMEPATH)}`
      : undefined)

  return homeDir ? path.join(homeDir, '.hermes') : null
}

function buildHermesProcessEnv(
  config: HermesRuntimeConfig | undefined,
  env: NodeJS.ProcessEnv | undefined,
): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = {
    ...process.env,
    ...env,
  }

  const lucidProviderConfig = getWorkerLucidProviderConfig({
    LUCID_API_BASE_URL: trimEnvValue(merged.LUCID_API_BASE_URL),
    LUCID_API_KEY: trimEnvValue(merged.LUCID_API_KEY),
  })
  const explicitOpenAIBaseUrl =
    trimEnvValue(env?.OPENAI_BASE_URL)
    ?? trimEnvValue(env?.OPENAI_API_BASE)
  const explicitOpenAIApiKey = trimEnvValue(env?.OPENAI_API_KEY)
  const lucidBaseUrl = explicitOpenAIBaseUrl ?? lucidProviderConfig.baseUrl
  const lucidApiKey = explicitOpenAIApiKey ?? lucidProviderConfig.apiKey

  if (lucidBaseUrl) {
    merged.OPENAI_BASE_URL = ensureV1Suffix(lucidBaseUrl)
  }
  if (lucidBaseUrl) {
    merged.OPENAI_API_BASE = ensureV1Suffix(lucidBaseUrl)
  }
  if (lucidApiKey) {
    merged.OPENAI_API_KEY = lucidApiKey
  }
  if (!trimEnvValue(merged.LLM_MODEL) && config?.model) {
    merged.LLM_MODEL = config.model
  }
  const hermesHome = resolveHermesHome(merged)
  if (hermesHome && !trimEnvValue(merged.HERMES_HOME)) {
    merged.HERMES_HOME = hermesHome
  }

  return merged
}

function buildChatArgs(config: HermesRuntimeConfig, prompt: string): string[] {
  const args = ['chat', '-q', prompt, '--quiet']

  if (config.model) {
    args.push('--model', config.model)
  }

  for (const toolset of config.toolsets) {
    args.push('--toolsets', toolset)
  }

  return args
}

export class HermesLauncher {
  readonly executablePath: string

  constructor(explicitPath?: string) {
    this.executablePath = explicitPath?.trim()
      || process.env.HERMES_BIN_PATH?.trim()
      || process.env.HERMES_COMMAND?.trim()
      || 'hermes'
  }

  private async ensureRuntimeConfig(env: NodeJS.ProcessEnv): Promise<void> {
    const lucidBaseUrl = trimEnvValue(env.OPENAI_BASE_URL)
      ?? trimEnvValue(env.OPENAI_API_BASE)
      ?? trimEnvValue(env.LUCID_API_BASE_URL)
    if (!lucidBaseUrl) return

    const hermesHome = resolveHermesHome(env)
    if (!hermesHome) return

    const configPath = path.join(hermesHome, 'config.yaml')
    await mkdir(hermesHome, { recursive: true })

    let config: Record<string, unknown> = {}
    try {
      const raw = await readFile(configPath, 'utf8')
      const parsed = parseYaml(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        config = { ...parsed as Record<string, unknown> }
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') throw error
    }

    const normalizedBaseUrl = ensureV1Suffix(lucidBaseUrl)
    const nextModel = {
      ...(typeof config.model === 'object' && config.model && !Array.isArray(config.model)
        ? config.model as Record<string, unknown>
        : {}),
      provider: 'custom',
      base_url: normalizedBaseUrl,
    }

    const currentModel = config.model as Record<string, unknown> | undefined
    const currentProvider = typeof currentModel?.provider === 'string' ? currentModel.provider : undefined
    const currentBaseUrl = typeof currentModel?.base_url === 'string' ? currentModel.base_url : undefined
    if (currentProvider === 'custom' && currentBaseUrl === normalizedBaseUrl) {
      return
    }

    const nextConfig = {
      ...config,
      model: nextModel,
    }

    await writeFile(configPath, dumpYaml(nextConfig, { noRefs: true, lineWidth: 120 }), 'utf8')
    logHermesLaunch('config:updated', {
      hermesHome,
      configPath,
      provider: 'custom',
      baseUrl: normalizedBaseUrl,
    })
  }

  async verifyInstalled(): Promise<void> {
    const startedAt = Date.now()
    logHermesLaunch('verify:start', {
      executablePath: this.executablePath,
    })
    if (this.executablePath !== 'hermes') {
      await access(this.executablePath, constants.X_OK)
    }

    const result = await this.run({
      args: ['--version'],
      timeoutMs: 10_000,
    })

    if (result.timedOut) {
      logHermesLaunch('verify:timeout', {
        executablePath: this.executablePath,
        durationMs: Date.now() - startedAt,
      })
      throw new HermesProcessError('Hermes verification timed out', result)
    }

    if ((result.exitCode ?? 1) !== 0) {
      logHermesLaunch('verify:failed', {
        executablePath: this.executablePath,
        exitCode: result.exitCode,
        durationMs: Date.now() - startedAt,
        stderrPreview: trimPreview(result.stderr),
      })
      throw new HermesProcessError(
        `Hermes is unavailable (exit=${result.exitCode ?? 'null'})${result.stderr ? `: ${result.stderr.trim()}` : ''}`,
        result,
      )
    }

    logHermesLaunch('verify:ok', {
      executablePath: this.executablePath,
      durationMs: Date.now() - startedAt,
      version: trimVersionLabel(result.stdout),
    })
  }

  async run(options: HermesLaunchOptions): Promise<HermesLaunchResult> {
    const {
      args,
      cwd,
      env,
      stdin,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      signal,
    } = options

    return await new Promise<HermesLaunchResult>((resolve, reject) => {
      const startedAt = Date.now()
      const child = spawn(this.executablePath, args, {
        cwd,
        env: buildHermesProcessEnv(undefined, env),
        stdio: 'pipe',
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false
      let settled = false

      const finish = (result: HermesLaunchResult) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(result)
      }

      const fail = (error: Error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }

      const timeoutId = setTimeout(() => {
        timedOut = true
        stderr += `Hermes timed out after ${timeoutMs}ms`
        try {
          child.kill('SIGKILL')
        } catch {
          // ignore
        }
      }, timeoutMs)

      const abortHandler = () => {
        stderr += 'Hermes run aborted'
        try {
          child.kill('SIGTERM')
        } catch {
          // ignore
        }
      }

      const cleanup = () => {
        clearTimeout(timeoutId)
        signal?.removeEventListener('abort', abortHandler)
      }

      signal?.addEventListener('abort', abortHandler, { once: true })

      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString()
      })

      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('error', (error) => {
        logHermesLaunch('run:spawn_error', {
          executablePath: this.executablePath,
          args,
          durationMs: Date.now() - startedAt,
          error: String(error),
        })
        fail(new Error(`Failed to start Hermes process: ${String(error)}`))
      })

      child.on('close', (exitCode) => {
        logHermesLaunch('run:close', {
          executablePath: this.executablePath,
          args,
          exitCode,
          timedOut,
          durationMs: Date.now() - startedAt,
          stderrPreview: stderr ? trimPreview(stderr) : undefined,
        })
        finish({
          exitCode,
          stdout,
          stderr,
          timedOut,
        })
      })

      if (stdin) {
        child.stdin?.write(stdin)
      }
      child.stdin?.end()
    })
  }

  async runPrompt(
    config: HermesRuntimeConfig,
    prompt: string,
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<HermesPromptResult> {
    const startedAt = Date.now()
    const processEnv = buildHermesProcessEnv(config, undefined)
    const lucidProviderConfig = getWorkerLucidProviderConfig({
      LUCID_API_BASE_URL: trimEnvValue(processEnv.LUCID_API_BASE_URL),
      LUCID_API_KEY: trimEnvValue(processEnv.LUCID_API_KEY),
    })
    const trustGateProxy = await startTrustGateHeaderProxy(
      lucidProviderConfig.baseUrl ?? '',
      lucidProviderConfig.apiKey ?? '',
      config.trustGateHeaders,
      config.model,
    )
    if (trustGateProxy) {
      const proxyBaseUrl = ensureV1Suffix(trustGateProxy.baseUrl)
      processEnv.OPENAI_BASE_URL = proxyBaseUrl
      processEnv.OPENAI_API_BASE = proxyBaseUrl
      processEnv.OPENAI_API_KEY = lucidProviderConfig.apiKey ?? processEnv.OPENAI_API_KEY ?? 'lucid-runtime'
    }

    let result: HermesLaunchResult
    try {
      await this.ensureRuntimeConfig(processEnv)
      result = await this.run({
        args: buildChatArgs(config, prompt),
        cwd: config.workdir,
        env: processEnv,
        timeoutMs: options.timeoutMs ?? config.timeoutMs,
        signal: options.signal,
      })
    } finally {
      await trustGateProxy?.close()
    }

    if (result.timedOut) {
      logHermesLaunch('prompt:timeout', {
        executablePath: this.executablePath,
        model: config.model,
        durationMs: Date.now() - startedAt,
      })
      throw new HermesProcessError(result.stderr.trim() || 'Hermes execution timed out', result)
    }

    if ((result.exitCode ?? 1) !== 0) {
      logHermesLaunch('prompt:failed', {
        executablePath: this.executablePath,
        model: config.model,
        exitCode: result.exitCode,
        durationMs: Date.now() - startedAt,
        stderrPreview: trimPreview(result.stderr),
      })
      throw new HermesProcessError(
        result.stderr.trim() || `Hermes exited with code ${result.exitCode}`,
        result,
      )
    }

    const response = result.stdout.trim()
    if (!response) {
      throw new HermesProcessError(result.stderr.trim() || 'Hermes returned an empty response', result)
    }

    const inputTokens = estimateTokenCount(prompt)
    const outputTokens = estimateTokenCount(response)
    logHermesLaunch('prompt:ok', {
      executablePath: this.executablePath,
      model: config.model,
      durationMs: Date.now() - startedAt,
      inputTokens,
      outputTokens,
    })
    return {
      responseText: response,
      tokenUsage: {
        inputTokens,
        outputTokens,
        estimatedCostUsd: estimateCostUsd(config.model, inputTokens, outputTokens),
      },
    }
  }
}
