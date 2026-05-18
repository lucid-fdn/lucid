/**
 * CLI API — Pure functions for bridge CLI commands.
 *
 * No process.exit(), no UI, no side effects. Returns result types.
 * Uses fetch directly (not RestClient — CLI uses JWT auth, not runtime API key).
 */

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

export interface CliError {
  ok: false
  error: string
  hint?: string
}

export type CliResult<T> = T | CliError

export function isOk<T extends { ok: true }>(r: CliResult<T>): r is T {
  return (r as any).ok === true
}

export function isErr<T>(r: CliResult<T>): r is CliError {
  return (r as any).ok === false
}

// ---------------------------------------------------------------------------
// Runtime Info (matches control plane response)
// ---------------------------------------------------------------------------

export interface RuntimeInfo {
  id: string
  display_name?: string
  status: string
  provider: string
  engine?: string
  runtime_protocol?: string
  runtime_tier?: string
  last_seen_at?: string
  agent_count?: number
  cpu_percent?: number
  ram_percent?: number
  disk_percent?: number
  uptime_seconds?: number
  runtime_version?: string
  engine_version?: string
  openclaw_version?: string
  channel_mode?: string
  generation?: number
}

export interface RuntimeNativeCapabilityInfo {
  id: string
  kind: string
  label: string
  supportLevel?: string
  availability?: string
  health?: string
  manageMode?: string
  authority?: string
}

export interface RuntimeServiceInfo {
  serviceName: string
  label?: string | null
  status?: string
  lifecycle?: string | null
  healthStatus?: string
}

export interface RuntimeManagementCommandInfo {
  id: string
  runtimeId: string
  orgId: string
  commandType: string
  targetCapabilityId?: string | null
  payload: Record<string, unknown>
  status: string
  response?: Record<string, unknown> | null
  error?: string | null
  requestedAt: string
  dispatchedAt?: string | null
  acknowledgedAt?: string | null
  expiresAt?: string | null
}

export interface RuntimeCapabilitiesInfo {
  provider: string
  engine?: string
  runtimeProtocol?: string
  deploymentMode: 'managed' | 'manual'
  adapterIdentity?: Record<string, unknown> | null
  nativeCapabilities?: RuntimeNativeCapabilityInfo[]
  runtimeServices?: RuntimeServiceInfo[]
  adapterProbe?: Record<string, unknown> | null
  transcriptParser?: Record<string, unknown> | null
  commandSpec?: Record<string, unknown> | null
  engineHomePolicy?: Record<string, unknown> | null
  capabilityReportedAt?: string | null
  managementCommands?: RuntimeManagementCommandInfo[]
}

// ---------------------------------------------------------------------------
// Auth Context
// ---------------------------------------------------------------------------

export interface AuthContext {
  ok: true
  token: string
  controlPlaneUrl: string
  orgId: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 30_000
const POLL_INITIAL_INTERVAL_MS = 2_000
const POLL_MAX_INTERVAL_MS = 10_000
const POLL_BACKOFF_FACTOR = 1.5
const POLL_MAX_DURATION_MS = 5 * 60 * 1000

// ---------------------------------------------------------------------------
// Resolve Auth + Org
// ---------------------------------------------------------------------------

export async function resolveAuthContext(
  token: string,
  controlPlaneUrl: string,
): Promise<CliResult<AuthContext>> {
  const orgResult = await resolveOrgId(controlPlaneUrl, token)
  if (isErr(orgResult)) return orgResult

  return {
    ok: true,
    token,
    controlPlaneUrl,
    orgId: orgResult.orgId,
  }
}

// ---------------------------------------------------------------------------
// Resolve Org ID
// ---------------------------------------------------------------------------

async function resolveOrgId(
  controlPlaneUrl: string,
  token: string,
): Promise<CliResult<{ ok: true; orgId: string }>> {
  // Try organizations endpoint
  try {
    const res = await fetchWithTimeout(`${controlPlaneUrl}/api/user/organizations`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      const data = (await res.json()) as any
      const orgs = Array.isArray(data) ? data : data.organizations || []
      if (orgs.length > 0) {
        const orgId = orgs[0].id || orgs[0].org_id
        if (orgId) return { ok: true, orgId }
      }
    }
  } catch {
    // Fall through to JWT parsing
  }

  // Fallback: extract from JWT payload
  try {
    const parts = token.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
      const orgId = payload.org_id || payload.organization_id
      if (orgId) return { ok: true, orgId }
    }
  } catch {
    // Not a JWT or malformed
  }

  return {
    ok: false,
    error: 'Could not resolve organization from token',
    hint: 'Ensure your token is valid: lucid whoami',
  }
}

// ---------------------------------------------------------------------------
// Create Runtime
// ---------------------------------------------------------------------------

export interface CreateRuntimeResult {
  ok: true
  runtimeId: string
  apiKey: string
  controlPlaneUrl: string
}

export interface HermesMigrationOptions {
  enabled?: boolean
  preset?: 'full' | 'user-data'
  dryRun?: boolean
  overwrite?: boolean
  sourcePath?: string
  workspaceTarget?: string
  skillConflict?: 'skip' | 'overwrite' | 'rename'
}

export async function createRuntime(opts: {
  controlPlaneUrl: string
  token: string
  orgId: string
  displayName: string
  engine: 'openclaw' | 'hermes'
  channelMode: 'relay' | 'native'
  hermesMigration?: HermesMigrationOptions
}): Promise<CliResult<CreateRuntimeResult>> {
  if (opts.engine === 'hermes' && opts.channelMode === 'native') {
    return {
      ok: false,
      error: 'Hermes native channel ownership is not supported yet',
      hint: 'Use channel mode relay for Hermes runtimes',
    }
  }

  const url = `${opts.controlPlaneUrl}/api/runtimes?org_id=${encodeURIComponent(opts.orgId)}`

  let res: Response
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.token}`,
      },
      body: JSON.stringify({
        displayName: opts.displayName,
        provider: 'manual',
        runtimeTier: 'byo',
        engine: opts.engine,
        runtimeFlavor: 'c2a_autonomous',
        channelOwnership: opts.channelMode === 'native' ? 'runtime_native' : 'lucid_relay',
        channelMode: opts.channelMode,
        ...(opts.engine === 'hermes' && opts.hermesMigration?.enabled
          ? {
              runtimeBootstrapConfig: {
                migration: {
                  source: 'openclaw',
                  hermesOpenClaw: {
                    preset: opts.hermesMigration.preset,
                    dryRun: opts.hermesMigration.dryRun,
                    overwrite: opts.hermesMigration.overwrite,
                    sourcePath: opts.hermesMigration.sourcePath,
                    workspaceTarget: opts.hermesMigration.workspaceTarget,
                    skillConflict: opts.hermesMigration.skillConflict,
                  },
                },
              },
            }
          : {}),
      }),
    })
  } catch (err: any) {
    return {
      ok: false,
      error: `Network error: ${err.message}`,
      hint: 'Check your internet connection and control plane URL',
    }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return {
      ok: false,
      error: `Runtime creation failed (HTTP ${res.status})`,
      hint: body || undefined,
    }
  }

  const data = (await res.json()) as any
  return {
    ok: true,
    runtimeId: data.runtime?.id,
    apiKey: data.apiKey,
    controlPlaneUrl: opts.controlPlaneUrl,
  }
}

// ---------------------------------------------------------------------------
// List Runtimes
// ---------------------------------------------------------------------------

export async function listRuntimes(opts: {
  controlPlaneUrl: string
  token: string
  orgId: string
}): Promise<CliResult<{ ok: true; runtimes: RuntimeInfo[] }>> {
  let res: Response
  try {
    res = await fetchWithTimeout(
      `${opts.controlPlaneUrl}/api/runtimes?org_id=${encodeURIComponent(opts.orgId)}`,
      { headers: { Authorization: `Bearer ${opts.token}` } },
    )
  } catch (err: any) {
    return { ok: false, error: `Network error: ${err.message}` }
  }

  if (!res.ok) {
    return { ok: false, error: `Failed to fetch runtimes (HTTP ${res.status})` }
  }

  const data = (await res.json()) as any
  const runtimes: RuntimeInfo[] = Array.isArray(data) ? data : data.runtimes || []
  return { ok: true, runtimes }
}

// ---------------------------------------------------------------------------
// Get Single Runtime
// ---------------------------------------------------------------------------

export async function getRuntime(opts: {
  controlPlaneUrl: string
  token: string
  orgId: string
  runtimeId: string
}): Promise<CliResult<{ ok: true; runtime: RuntimeInfo }>> {
  const result = await listRuntimes(opts)
  if (isErr(result)) return result

  const runtime = result.runtimes.find((r) => r.id === opts.runtimeId)
  if (!runtime) {
    return {
      ok: false,
      error: `Runtime ${opts.runtimeId} not found`,
      hint: 'List runtimes: lucid-runtime list',
    }
  }

  return { ok: true, runtime }
}

// ---------------------------------------------------------------------------
// Runtime Capabilities
// ---------------------------------------------------------------------------

export async function getRuntimeCapabilities(opts: {
  controlPlaneUrl: string
  token: string
  orgId: string
  runtimeId: string
}): Promise<CliResult<{ ok: true; capabilities: RuntimeCapabilitiesInfo }>> {
  let res: Response
  try {
    res = await fetchWithTimeout(
      `${opts.controlPlaneUrl}/api/runtimes/${encodeURIComponent(opts.runtimeId)}/capabilities?org_id=${encodeURIComponent(opts.orgId)}`,
      { headers: { Authorization: `Bearer ${opts.token}` } },
    )
  } catch (err: any) {
    return { ok: false, error: `Network error: ${err.message}` }
  }

  if (!res.ok) {
    return { ok: false, error: `Failed to fetch runtime capabilities (HTTP ${res.status})` }
  }

  return { ok: true, capabilities: (await res.json()) as RuntimeCapabilitiesInfo }
}

export async function listRuntimeManagementCommands(opts: {
  controlPlaneUrl: string
  token: string
  orgId: string
  runtimeId: string
}): Promise<CliResult<{ ok: true; commands: RuntimeManagementCommandInfo[] }>> {
  let res: Response
  try {
    res = await fetchWithTimeout(
      `${opts.controlPlaneUrl}/api/runtimes/${encodeURIComponent(opts.runtimeId)}/management-commands?org_id=${encodeURIComponent(opts.orgId)}`,
      { headers: { Authorization: `Bearer ${opts.token}` } },
    )
  } catch (err: any) {
    return { ok: false, error: `Network error: ${err.message}` }
  }

  if (!res.ok) {
    return { ok: false, error: `Failed to fetch management commands (HTTP ${res.status})` }
  }

  const data = (await res.json()) as any
  return { ok: true, commands: data.commands || [] }
}

export async function queueRuntimeManagementCommand(opts: {
  controlPlaneUrl: string
  token: string
  orgId: string
  runtimeId: string
  commandType: string
  targetCapabilityId?: string | null
  payload?: Record<string, unknown>
}): Promise<CliResult<{ ok: true; command: RuntimeManagementCommandInfo }>> {
  let res: Response
  try {
    res = await fetchWithTimeout(
      `${opts.controlPlaneUrl}/api/runtimes/${encodeURIComponent(opts.runtimeId)}/management-commands?org_id=${encodeURIComponent(opts.orgId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.token}`,
        },
        body: JSON.stringify({
          commandType: opts.commandType,
          targetCapabilityId: opts.targetCapabilityId ?? null,
          payload: opts.payload ?? {},
        }),
      },
    )
  } catch (err: any) {
    return { ok: false, error: `Network error: ${err.message}` }
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return {
      ok: false,
      error: `Failed to queue management command (HTTP ${res.status})`,
      hint: body || undefined,
    }
  }

  const data = (await res.json()) as any
  return { ok: true, command: data.command as RuntimeManagementCommandInfo }
}

// ---------------------------------------------------------------------------
// Poll Until Connected
// ---------------------------------------------------------------------------

export async function pollUntilConnected(opts: {
  controlPlaneUrl: string
  token: string
  orgId: string
  runtimeId: string
  onPoll?: (elapsed: number) => void
  signal?: AbortSignal
}): Promise<CliResult<{ ok: true; runtime: RuntimeInfo }>> {
  const start = Date.now()
  let interval = POLL_INITIAL_INTERVAL_MS

  while (Date.now() - start < POLL_MAX_DURATION_MS) {
    if (opts.signal?.aborted) {
      return { ok: false, error: 'Cancelled' }
    }

    const result = await getRuntime(opts)
    if (isOk(result) && result.runtime.status === 'connected') {
      return result
    }

    opts.onPoll?.(Date.now() - start)
    await sleep(interval)
    interval = Math.min(interval * POLL_BACKOFF_FACTOR, POLL_MAX_INTERVAL_MS)
  }

  return {
    ok: false,
    error: 'Timed out waiting for agent connection (5m)',
    hint: 'Your agent will connect when it sends its first heartbeat',
  }
}

// ---------------------------------------------------------------------------
// Env File Generation
// ---------------------------------------------------------------------------

export function buildEnvFileContent(opts: {
  runtimeId: string
  apiKey: string
  controlPlaneUrl: string
  displayName: string
  engine?: 'openclaw' | 'hermes'
  mode?: 'full' | 'observe'
  hermesMigration?: HermesMigrationOptions
}): string {
  const engine = opts.engine || 'openclaw'
  const hermesMigration = engine === 'hermes' && opts.hermesMigration?.enabled
    ? opts.hermesMigration
    : null
  return [
    '# Lucid Agent Bridge',
    `# Runtime: ${opts.displayName}`,
    `# Engine: ${engine}`,
    `# Created: ${new Date().toISOString()}`,
    `# Mode: ${opts.mode || 'full'}`,
    '#',
    '# Docs: https://github.com/lucid-fdn/agent-bridge',
    '',
    `LUCID_RUNTIME_ID=${opts.runtimeId}`,
    `LUCID_RUNTIME_KEY=${opts.apiKey}`,
    `LUCID_CONTROL_PLANE_URL=${opts.controlPlaneUrl}`,
    `LUCID_ENGINE=${engine}`,
    `LUCID_BRIDGE_MODE=${opts.mode || 'full'}`,
    ...(engine === 'hermes'
      ? [
          '',
          '# Hermes runtime wrapper',
          'HERMES_COMMAND=hermes',
          'HERMES_ARGS_JSON=["chat"]',
          'HERMES_WORKDIR=.',
          ...(hermesMigration
            ? [
                '',
                '# Hermes OpenClaw migration',
                'HERMES_MIGRATE_OPENCLAW=true',
                `HERMES_MIGRATE_PRESET=${hermesMigration.preset || 'user-data'}`,
                `HERMES_MIGRATE_DRY_RUN=${hermesMigration.dryRun ? 'true' : 'false'}`,
                `HERMES_MIGRATE_OVERWRITE=${hermesMigration.overwrite ? 'true' : 'false'}`,
                ...(hermesMigration.sourcePath ? [`HERMES_MIGRATE_SOURCE=${hermesMigration.sourcePath}`] : []),
                ...(hermesMigration.workspaceTarget ? [`HERMES_MIGRATE_WORKSPACE_TARGET=${hermesMigration.workspaceTarget}`] : []),
                ...(hermesMigration.skillConflict ? [`HERMES_MIGRATE_SKILL_CONFLICT=${hermesMigration.skillConflict}`] : []),
              ]
            : []),
        ]
      : []),
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
