import crypto from 'node:crypto'
import type {
  AgentEngine,
  EngineHomeAuthority,
  EngineHomeResource,
  EngineHomeResourceType,
  EngineHomeSnapshot,
} from '@lucid/runtime-compat'

export type EngineHomeProjectionPolicy =
  | 'ignore'
  | 'searchable_summary'
  | 'candidate_only'
  | 'promote_to_assistant_memory'
  | 'promote_to_team_brain'
  | 'promote_to_project_brain'
  | 'export_only'

export type EngineHomeProjectionStatus = 'candidate' | 'promoted' | 'rejected' | 'ignored'

export interface EngineHomeProjectionCandidate {
  orgId: string
  projectId: string | null
  teamId: string | null
  assistantId: string | null
  runtimeId: string | null
  engine: AgentEngine
  homeKind: EngineHomeSnapshot['descriptor']['kind']
  homeAuthority: EngineHomeAuthority
  resourceType: EngineHomeResourceType
  projectionPolicy: EngineHomeProjectionPolicy
  status: EngineHomeProjectionStatus
  path: string
  contentHash: string
  summary: string
  payloadRedacted: Record<string, unknown>
  sourceSnapshotId: string
  sourceDiffId: string | null
  metadata: Record<string, unknown>
}

export interface EngineHomeProjectionOptions {
  allowHermesAutoPromotion?: boolean
  allowOpenClawProjection?: boolean
  maxSummaryChars?: number
}

const HERMES_MEMORY_PATHS = new Set(['memories/memory.md', 'memory.md'])
const HERMES_USER_PATHS = new Set(['memories/user.md', 'user.md'])

export function classifyEngineHomeResource(resource: Pick<EngineHomeResource, 'path'>): EngineHomeResourceType {
  const normalized = normalizeHomePath(resource.path)
  if (HERMES_MEMORY_PATHS.has(normalized)) return 'memory'
  if (HERMES_USER_PATHS.has(normalized)) return 'user_profile'
  if (/^skills\/[^/]+\/(skill\.md|metadata\.json|manifest\.json)$/i.test(normalized)) return 'local_skill'
  if (/^(config|settings|preferences)(\.[a-z0-9_-]+)?$/i.test(normalized) || normalized.startsWith('config/')) return 'config'
  if (normalized.startsWith('sessions/') || normalized.startsWith('runs/')) return 'session'
  if (normalized.startsWith('cache/') || normalized.includes('/cache/')) return 'cache'
  if (normalized.startsWith('migrations/') || normalized.includes('/migration')) return 'migration'
  return 'unknown'
}

export function resolveEngineHomeProjectionPolicy(input: {
  engine: AgentEngine
  authority: EngineHomeAuthority
  resourceType: EngineHomeResourceType
  options?: EngineHomeProjectionOptions
}): EngineHomeProjectionPolicy {
  if (input.resourceType === 'cache') return 'ignore'
  if (input.resourceType === 'session' || input.resourceType === 'config') return 'export_only'

  if (input.engine === 'openclaw') {
    if (!input.options?.allowOpenClawProjection) return 'export_only'
    return input.resourceType === 'local_skill' ? 'candidate_only' : 'searchable_summary'
  }

  if (input.engine === 'hermes') {
    if (input.authority === 'local_authoritative') return 'candidate_only'
    if (!input.options?.allowHermesAutoPromotion) return 'candidate_only'
    if (input.resourceType === 'memory') return 'promote_to_project_brain'
    if (input.resourceType === 'user_profile') return 'promote_to_assistant_memory'
    if (input.resourceType === 'local_skill') return 'candidate_only'
  }

  if (input.resourceType === 'memory' || input.resourceType === 'user_profile') return 'searchable_summary'
  if (input.resourceType === 'local_skill' || input.resourceType === 'migration') return 'candidate_only'
  return 'export_only'
}

export function buildEngineHomeProjectionCandidates(
  snapshot: EngineHomeSnapshot,
  options: EngineHomeProjectionOptions = {},
): EngineHomeProjectionCandidate[] {
  return snapshot.resources.map((resource) => {
    const resourceType = classifyEngineHomeResource(resource)
    const projectionPolicy = resolveEngineHomeProjectionPolicy({
      engine: snapshot.descriptor.engine,
      authority: snapshot.descriptor.authority,
      resourceType,
      options,
    })
    const contentHash = resource.contentHash ?? hashEngineHomeResource(resource)
    return {
      orgId: snapshot.orgId,
      projectId: snapshot.projectId ?? null,
      teamId: snapshot.teamId ?? null,
      assistantId: snapshot.descriptor.assistantId ?? null,
      runtimeId: snapshot.descriptor.runtimeId ?? null,
      engine: snapshot.descriptor.engine,
      homeKind: snapshot.descriptor.kind,
      homeAuthority: snapshot.descriptor.authority,
      resourceType,
      projectionPolicy,
      status: projectionPolicy === 'ignore' ? 'ignored' : 'candidate',
      path: normalizeHomePath(resource.path),
      contentHash,
      summary: summarizeEngineHomeResource(resource, resourceType, options.maxSummaryChars),
      payloadRedacted: {
        path: normalizeHomePath(resource.path),
        resourceType,
        byteLength: resource.byteLength ?? byteLength(resource.content),
        modifiedAt: resource.modifiedAt ?? null,
        contentHash,
      },
      sourceSnapshotId: snapshot.id,
      sourceDiffId: snapshot.diffId ?? null,
      metadata: {
        source: 'engine_home',
        engine: snapshot.descriptor.engine,
        homeKind: snapshot.descriptor.kind,
        authority: snapshot.descriptor.authority,
        runtimeFlavor: snapshot.descriptor.runtimeFlavor,
        channelOwnership: snapshot.descriptor.channelOwnership,
      },
    }
  })
}

export function getEngineHomeDisplayLabel(input: {
  engine?: AgentEngine | null
  homeKind?: EngineHomeSnapshot['descriptor']['kind'] | null
}): 'Lucid Knowledge' | 'Hermes memory' | 'OpenClaw memory' | 'Proof receipt' | 'Engine memory' {
  if (input.homeKind === 'hermes_hhv' || input.engine === 'hermes') return 'Hermes memory'
  if (input.homeKind === 'openclaw_ohv' || input.engine === 'openclaw') return 'OpenClaw memory'
  return 'Engine memory'
}

export function canEngineHomeCandidatePromote(policy: EngineHomeProjectionPolicy): boolean {
  return policy === 'promote_to_assistant_memory'
    || policy === 'promote_to_team_brain'
    || policy === 'promote_to_project_brain'
    || policy === 'candidate_only'
    || policy === 'searchable_summary'
}

function summarizeEngineHomeResource(
  resource: EngineHomeResource,
  resourceType: EngineHomeResourceType,
  maxChars = 480,
): string {
  const path = normalizeHomePath(resource.path)
  const content = resource.content?.trim()
  if (!content) return `${resourceType} from ${path}`

  if (resourceType === 'local_skill') {
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
    const description = content.match(/^description:\s*(.+)$/m)?.[1]?.trim()
    return truncate([title, description].filter(Boolean).join(' - ') || `Local skill metadata from ${path}`, maxChars)
  }

  const compact = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join(' ')
  return truncate(compact || `${resourceType} from ${path}`, maxChars)
}

function hashEngineHomeResource(resource: EngineHomeResource): string {
  return crypto
    .createHash('sha256')
    .update(`${normalizeHomePath(resource.path)}\n${resource.content ?? ''}`)
    .digest('hex')
}

function normalizeHomePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
}

function byteLength(value?: string | null): number {
  return value ? Buffer.byteLength(value, 'utf8') : 0
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - 1)).trim()}…`
}
