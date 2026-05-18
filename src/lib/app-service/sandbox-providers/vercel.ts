import { AppServiceError } from '../errors'
import { assertAppServiceStartupEnvReady } from '../startup-env'
import type { SandboxProvider, SandboxValidationRequest, SandboxValidationResult } from './types'

type VercelSandboxModule = {
  Sandbox: {
    create(options: {
      runtime?: string
      timeout?: number
      networkPolicy?: unknown
      env?: Record<string, string>
    }): Promise<{
      sandboxId?: string
      writeFiles(files: Array<{ path: string; content: Buffer; mode?: number }>): Promise<void>
      runCommand(input: {
        cmd: string
        args?: string[]
        cwd?: string
        env?: Record<string, string>
      }): Promise<{
        exitCode: number
        stdout(): Promise<string>
        stderr(): Promise<string>
      }>
      stop?(): Promise<void>
    }>
  }
}

async function importVercelSandbox(): Promise<VercelSandboxModule> {
  try {
    const importer = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>
    return await importer('@vercel/sandbox') as VercelSandboxModule
  } catch (error) {
    throw new AppServiceError(
      'provider_unavailable',
      '@vercel/sandbox is not installed or Vercel OIDC credentials are unavailable.',
      503,
      { retryable: true, details: { cause: error instanceof Error ? error.message : String(error) } },
    )
  }
}

function shouldUseMockSandbox(): boolean {
  return process.env.APP_SERVICE_PROVIDER_MODE === 'mock'
    || process.env.APP_SERVICE_SANDBOX_MODE === 'mock'
    || process.env.NODE_ENV === 'test'
}

function redactEnv(env: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.keys(env ?? {}).map((key) => [key, '[redacted]']))
}

export class VercelSandboxProvider implements SandboxProvider {
  readonly id = 'vercel_sandbox' as const

  async validate(request: SandboxValidationRequest): Promise<SandboxValidationResult> {
    if (shouldUseMockSandbox()) {
      return {
        provider: 'mock',
        passed: true,
        logs: [
          'Mock sandbox validation passed.',
          `Files: ${request.files.map((file) => file.path).join(', ') || '(none)'}`,
          `Commands: ${request.commands.map((command) => [command.cmd, ...command.args].join(' ')).join(' && ') || '(none)'}`,
        ],
        metadata: {
          mode: 'mock',
          env: redactEnv(request.env),
        },
      }
    }

    assertAppServiceStartupEnvReady()
    const { Sandbox } = await importVercelSandbox()
    const sandbox = await Sandbox.create({
      runtime: process.env.APP_SERVICE_SANDBOX_RUNTIME || 'node24',
      timeout: Number.parseInt(process.env.APP_SERVICE_SANDBOX_TIMEOUT_MS || '300000', 10),
      networkPolicy: request.networkPolicy ?? (process.env.APP_SERVICE_SANDBOX_NETWORK_POLICY || 'deny-all'),
      env: request.env,
    })

    const logs: string[] = [`Sandbox ${sandbox.sandboxId ?? '(unknown)'} created.`]

    try {
      if (request.files.length > 0) {
        await sandbox.writeFiles(
          request.files.map((file) => ({
            path: file.path,
            content: Buffer.from(file.content),
          })),
        )
        logs.push(`Wrote ${request.files.length} files.`)
      }

      for (const command of request.commands) {
        const printable = [command.cmd, ...command.args].join(' ')
        logs.push(`$ ${printable}`)
        const result = await sandbox.runCommand({
          cmd: command.cmd,
          args: command.args,
          cwd: command.cwd ?? '/vercel/sandbox',
          env: request.env,
        })
        const stdout = await result.stdout()
        const stderr = await result.stderr()
        if (stdout.trim()) logs.push(stdout.trim())
        if (stderr.trim()) logs.push(stderr.trim())
        if (result.exitCode !== 0) {
          return {
            provider: this.id,
            passed: false,
            logs,
            metadata: {
              sandbox_id: sandbox.sandboxId,
              failed_command: printable,
              exit_code: result.exitCode,
            },
          }
        }
      }

      return {
        provider: this.id,
        passed: true,
        logs,
        metadata: { sandbox_id: sandbox.sandboxId },
      }
    } finally {
      await sandbox.stop?.().catch(() => undefined)
    }
  }
}

export const vercelSandboxProvider = new VercelSandboxProvider()
