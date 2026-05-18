#!/usr/bin/env tsx

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

interface CliConfig {
  baseUrl?: string
  token?: string
}

interface ParsedArgs {
  command: string[]
  flags: Record<string, string | boolean | string[]>
}

const CONFIG_PATH = path.join(process.cwd(), '.lucid', 'app-service.json')

export function parseAppServiceCliArgs(argv: string[]): ParsedArgs {
  const command: string[] = []
  const flags: ParsedArgs['flags'] = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      command.push(arg)
      continue
    }

    const key = arg.slice(2)
    const next = argv[index + 1]
    const value = !next || next.startsWith('--') ? true : next
    if (value !== true) index += 1

    if (key === 'capability' || key === 'tag') {
      const existing = flags[key]
      flags[key] = Array.isArray(existing)
        ? [...existing, String(value)]
        : existing
          ? [String(existing), String(value)]
          : [String(value)]
    } else {
      flags[key] = value
    }
  }

  return { command, flags }
}

function readConfig(): CliConfig {
  if (!existsSync(CONFIG_PATH)) return {}
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as CliConfig
}

function writeConfig(config: CliConfig): void {
  mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`)
}

function stringFlag(flags: ParsedArgs['flags'], key: string): string | undefined {
  const value = flags[key]
  return typeof value === 'string' ? value : undefined
}

function booleanFlag(flags: ParsedArgs['flags'], key: string): boolean {
  return flags[key] === true || flags[key] === 'true'
}

function arrayFlag(flags: ParsedArgs['flags'], key: string): string[] {
  const value = flags[key]
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return [value]
  return []
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required`)
  return value
}

function commandHelp(): string {
  return [
    'Lucid App Service CLI',
    '',
    'Commands:',
    '  login --base-url <url> --token <token>',
    '  catalog',
    '  benchmarks',
    '  create --org-id <uuid> --project-id <uuid> (--prompt <text> | --blueprint <slug>)',
    '  deploy --app-id <uuid> [--visibility unlisted|public] [--no-readiness]',
    '  upgrade plan --app-id <uuid> --blueprint <slug>',
    '  upgrade apply --app-id <uuid> --blueprint <slug>',
    '  registry install --slug <slug> --org-id <uuid> --project-id <uuid>',
    '  registry remix --slug <slug> --org-id <uuid> [--new-slug <slug>] [--name <name>]',
    '  token create --app-id <uuid> [--label <label>] [--capability chat]',
    '  token revoke --app-id <uuid> --token-id <uuid>',
    '  token rotate --app-id <uuid> --token-id <uuid>',
    '  origin list --app-id <uuid>',
    '  origin add --app-id <uuid> --origin <https://example.com>',
    '  origin remove --app-id <uuid> --origin-id <uuid>',
  ].join('\n')
}

class AppServiceCliHttp {
  private readonly baseUrl: URL
  private readonly token: string | undefined

  constructor(config: CliConfig) {
    const baseUrl = process.env.LUCID_URL ?? config.baseUrl ?? 'http://localhost:3000'
    this.baseUrl = new URL(baseUrl)
    this.token = process.env.LUCID_TOKEN ?? config.token
  }

  async get(pathname: string): Promise<unknown> {
    return this.request(pathname, { method: 'GET' })
  }

  async post(pathname: string, body?: unknown): Promise<unknown> {
    return this.request(pathname, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  async delete(pathname: string): Promise<unknown> {
    return this.request(pathname, { method: 'DELETE' })
  }

  private async request(pathname: string, init: RequestInit): Promise<unknown> {
    const headers = new Headers(init.headers)
    headers.set('accept', 'application/json')
    headers.set('content-type', 'application/json')
    if (this.token) headers.set('authorization', `Bearer ${this.token}`)

    const response = await fetch(new URL(pathname.replace(/^\//, ''), this.baseUrl.href.endsWith('/') ? this.baseUrl : `${this.baseUrl.href}/`), {
      ...init,
      headers,
    })
    const text = await response.text()
    const payload = text ? JSON.parse(text) : null
    if (!response.ok) {
      const message = payload?.error?.message ?? `Request failed with ${response.status}`
      throw new Error(message)
    }
    return payload
  }
}

export async function runAppServiceCli(argv: string[]): Promise<unknown> {
  const parsed = parseAppServiceCliArgs(argv)
  const [primary, secondary] = parsed.command

  if (!primary || primary === 'help' || primary === '--help') {
    return commandHelp()
  }

  if (primary === 'login') {
    const config = {
      baseUrl: required(stringFlag(parsed.flags, 'base-url'), '--base-url'),
      token: required(stringFlag(parsed.flags, 'token'), '--token'),
    }
    writeConfig(config)
    return { ok: true, config_path: CONFIG_PATH, base_url: config.baseUrl }
  }

  const http = new AppServiceCliHttp(readConfig())

  if (primary === 'catalog') {
    return http.get('/api/app-services/registry')
  }

  if (primary === 'benchmarks') {
    return http.get('/api/app-services/benchmarks')
  }

  if (primary === 'create') {
    const prompt = stringFlag(parsed.flags, 'prompt')
    const blueprintSlug = stringFlag(parsed.flags, 'blueprint')
    if (!prompt && !blueprintSlug) {
      throw new Error('--prompt or --blueprint is required')
    }
    return http.post('/api/app-services/generation-runs', {
      orgId: required(stringFlag(parsed.flags, 'org-id'), '--org-id'),
      projectId: required(stringFlag(parsed.flags, 'project-id'), '--project-id'),
      prompt,
      blueprintSlug,
    })
  }

  if (primary === 'deploy') {
    const appId = required(stringFlag(parsed.flags, 'app-id'), '--app-id')
    return http.post(`/api/app-services/${encodeURIComponent(appId)}/launch`, {
      visibility: stringFlag(parsed.flags, 'visibility'),
      requireReadiness: !booleanFlag(parsed.flags, 'no-readiness'),
    })
  }

  if (primary === 'upgrade' && (secondary === 'plan' || secondary === 'apply')) {
    const appId = required(stringFlag(parsed.flags, 'app-id'), '--app-id')
    const blueprintSlug = stringFlag(parsed.flags, 'blueprint')
    const blueprintId = stringFlag(parsed.flags, 'blueprint-id')
    if (!blueprintSlug && !blueprintId) {
      throw new Error('--blueprint or --blueprint-id is required')
    }
    return http.post(`/api/app-services/${encodeURIComponent(appId)}/upgrades/${secondary}`, {
      blueprintSlug,
      blueprintId,
      note: stringFlag(parsed.flags, 'note'),
    })
  }

  if (primary === 'registry' && secondary === 'install') {
    const slug = required(stringFlag(parsed.flags, 'slug'), '--slug')
    return http.post(`/api/app-services/registry/${encodeURIComponent(slug)}/install`, {
      orgId: required(stringFlag(parsed.flags, 'org-id'), '--org-id'),
      projectId: required(stringFlag(parsed.flags, 'project-id'), '--project-id'),
      idempotencyKey: stringFlag(parsed.flags, 'idempotency-key'),
      input: {},
    })
  }

  if (primary === 'registry' && secondary === 'remix') {
    const slug = required(stringFlag(parsed.flags, 'slug'), '--slug')
    return http.post(`/api/app-services/registry/${encodeURIComponent(slug)}/remix`, {
      orgId: required(stringFlag(parsed.flags, 'org-id'), '--org-id'),
      projectId: stringFlag(parsed.flags, 'project-id'),
      name: stringFlag(parsed.flags, 'name'),
      slug: stringFlag(parsed.flags, 'new-slug'),
      visibility: stringFlag(parsed.flags, 'visibility') ?? 'private',
      tags: arrayFlag(parsed.flags, 'tag'),
    })
  }

  if (primary === 'token' && secondary === 'create') {
    const appId = required(stringFlag(parsed.flags, 'app-id'), '--app-id')
    return http.post(`/api/app-runtime/v1/operator/apps/${encodeURIComponent(appId)}/tokens`, {
      label: stringFlag(parsed.flags, 'label'),
      capabilities: arrayFlag(parsed.flags, 'capability'),
      expires_at: stringFlag(parsed.flags, 'expires-at') ?? null,
    })
  }

  if (primary === 'token' && secondary === 'revoke') {
    const appId = required(stringFlag(parsed.flags, 'app-id'), '--app-id')
    const tokenId = required(stringFlag(parsed.flags, 'token-id'), '--token-id')
    return http.post(`/api/app-runtime/v1/operator/apps/${encodeURIComponent(appId)}/tokens/${encodeURIComponent(tokenId)}/revoke`, {})
  }

  if (primary === 'token' && secondary === 'rotate') {
    const appId = required(stringFlag(parsed.flags, 'app-id'), '--app-id')
    const tokenId = required(stringFlag(parsed.flags, 'token-id'), '--token-id')
    return http.post(`/api/app-runtime/v1/operator/apps/${encodeURIComponent(appId)}/tokens/${encodeURIComponent(tokenId)}/rotate`, {
      label: stringFlag(parsed.flags, 'label'),
      capabilities: arrayFlag(parsed.flags, 'capability'),
      expires_at: stringFlag(parsed.flags, 'expires-at') ?? null,
    })
  }

  if (primary === 'origin' && secondary === 'list') {
    const appId = required(stringFlag(parsed.flags, 'app-id'), '--app-id')
    return http.get(`/api/app-runtime/v1/operator/apps/${encodeURIComponent(appId)}/origins`)
  }

  if (primary === 'origin' && secondary === 'add') {
    const appId = required(stringFlag(parsed.flags, 'app-id'), '--app-id')
    return http.post(`/api/app-runtime/v1/operator/apps/${encodeURIComponent(appId)}/origins`, {
      origin: required(stringFlag(parsed.flags, 'origin'), '--origin'),
    })
  }

  if (primary === 'origin' && secondary === 'remove') {
    const appId = required(stringFlag(parsed.flags, 'app-id'), '--app-id')
    const originId = required(stringFlag(parsed.flags, 'origin-id'), '--origin-id')
    return http.delete(`/api/app-runtime/v1/operator/apps/${encodeURIComponent(appId)}/origins/${encodeURIComponent(originId)}`)
  }

  throw new Error(`Unknown command: ${parsed.command.join(' ')}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAppServiceCli(process.argv.slice(2))
    .then((result) => {
      if (typeof result === 'string') {
        console.log(result)
      } else {
        console.log(JSON.stringify(result, null, 2))
      }
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
