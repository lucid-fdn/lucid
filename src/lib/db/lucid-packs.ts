import 'server-only'

import type {
  CreateLucidPackInput,
  LucidPackManagedResource,
  LucidPackMarketplaceSubmission,
  LucidPackMarketplaceSubmissionStatus,
  LucidPack,
  LucidPackInstall,
  LucidPackManifest,
} from '@contracts/lucid-pack'
import { buildLucidPackReconcilePlan } from '@/lib/packs'
import { ErrorService, supabase } from './client'

const PACK_COLUMNS = [
  'id',
  'org_id',
  'pack_key',
  'name',
  'description',
  'version',
  'manifest',
  'status',
  'created_at',
  'updated_at',
].join(', ')

const INSTALL_COLUMNS = [
  'id',
  'org_id',
  'project_id',
  'pack_id',
  'status',
  'config',
  'created_at',
  'updated_at',
].join(', ')

const MANAGED_RESOURCE_COLUMNS = [
  'id',
  'org_id',
  'install_id',
  'resource_key',
  'resource_kind',
  'resource_id',
  'management_policy',
  'status',
  'last_reconciled_at',
  'forked_from_resource_id',
  'forked_at',
  'fork_reason',
  'uninstalled_at',
  'uninstall_reason',
  'spec_hash',
  'metadata',
  'created_at',
  'updated_at',
].join(', ')

const MARKETPLACE_SUBMISSION_COLUMNS = [
  'id',
  'org_id',
  'pack_id',
  'submitted_by_user_id',
  'status',
  'review_notes',
  'quality_report',
  'submitted_at',
  'reviewed_at',
  'created_at',
  'updated_at',
].join(', ')

type PackRow = {
  id: string
  org_id: string | null
  pack_key: string
  name: string
  description: string
  version: string
  manifest: LucidPackManifest
  status: LucidPack['status']
  created_at: string
  updated_at: string
}

type InstallRow = {
  id: string
  org_id: string
  project_id: string | null
  pack_id: string
  status: LucidPackInstall['status']
  config: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type ManagedResourceRow = {
  id: string
  org_id: string
  install_id: string
  resource_key: string
  resource_kind: LucidPackManagedResource['resourceKind']
  resource_id: string | null
  management_policy: LucidPackManagedResource['managementPolicy']
  status: LucidPackManagedResource['status']
  last_reconciled_at: string | null
  forked_from_resource_id: string | null
  forked_at: string | null
  fork_reason: string | null
  uninstalled_at: string | null
  uninstall_reason: string | null
  spec_hash: string
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type MarketplaceSubmissionRow = {
  id: string
  org_id: string
  pack_id: string
  submitted_by_user_id: string | null
  status: LucidPackMarketplaceSubmissionStatus
  review_notes: string | null
  quality_report: Record<string, unknown> | null
  submitted_at: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export async function createLucidPack(input: CreateLucidPackInput): Promise<LucidPack> {
  const payload = {
    org_id: input.orgId ?? null,
    pack_key: input.packKey,
    name: input.name,
    description: input.description,
    version: input.version,
    manifest: input.manifest,
    status: input.status,
  }
  const { data, error } = await supabase
    .from('lucid_packs')
    .insert(payload)
    .select(PACK_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      const existing = await getLucidPackByKeyVersion(input.packKey, input.version, input.orgId ?? null)
      if (existing) return existing
    }
    ErrorService.captureException(error, {
      severity: 'error',
      context: { packKey: input.packKey, version: input.version, operation: 'createLucidPack' },
      tags: { layer: 'database', table: 'lucid_packs' },
    })
    throw error
  }

  return mapPack(data as unknown as PackRow)
}

export async function upsertLucidPack(input: CreateLucidPackInput): Promise<LucidPack> {
  const existing = await getLucidPackByKeyVersion(input.packKey, input.version, input.orgId ?? null)
  if (!existing) return createLucidPack(input)

  const { data, error } = await supabase
    .from('lucid_packs')
    .update({
      name: input.name,
      description: input.description,
      manifest: input.manifest,
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select(PACK_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { packKey: input.packKey, version: input.version, operation: 'upsertLucidPack' },
      tags: { layer: 'database', table: 'lucid_packs' },
    })
    throw error
  }

  return mapPack(data as unknown as PackRow)
}

export async function listLucidPacks(input: {
  orgId?: string | null
  status?: LucidPack['status']
  limit?: number
} = {}): Promise<LucidPack[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('lucid_packs')
    .select(PACK_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.orgId) query = query.or(`org_id.is.null,org_id.eq.${input.orgId}`)
  else query = query.is('org_id', null)
  if (input.status) query = query.eq('status', input.status)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId ?? undefined, operation: 'listLucidPacks' },
      tags: { layer: 'database', table: 'lucid_packs' },
    })
    return []
  }

  return ((data ?? []) as unknown as PackRow[]).map(mapPack)
}

export async function installLucidPack(input: {
  orgId: string
  projectId?: string | null
  packId: string
  config?: Record<string, unknown>
  installedByUserId?: string | null
}): Promise<LucidPackInstall> {
  const insertInstall = async (installedByUserId: string | null) => supabase
    .from('lucid_pack_installs')
    .insert({
      org_id: input.orgId,
      project_id: input.projectId ?? null,
      pack_id: input.packId,
      status: 'active',
      config: input.config ?? {},
      installed_by_user_id: installedByUserId,
    })
    .select(INSTALL_COLUMNS)
    .single()

  let { data, error } = await insertInstall(input.installedByUserId ?? null)
  if (error?.code === '23503' && input.installedByUserId) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        orgId: input.orgId,
        packId: input.packId,
        operation: 'installLucidPack',
        fallback: 'retry_without_installed_by_user_id',
      },
      tags: { layer: 'database', table: 'lucid_pack_installs' },
    })
    const retry = await insertInstall(null)
    data = retry.data
    error = retry.error
  }

  if (error) {
    if (error.code === '23505') {
      const existing = await getActiveLucidPackInstall(input)
      if (existing) {
        await reconcileLucidPackInstall({ orgId: input.orgId, installId: existing.id })
        return existing
      }
    }
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, packId: input.packId, operation: 'installLucidPack' },
      tags: { layer: 'database', table: 'lucid_pack_installs' },
    })
    throw error
  }

  const install = mapInstall(data as unknown as InstallRow)
  await reconcileLucidPackInstall({ orgId: input.orgId, installId: install.id })
  return install
}

export async function listLucidPackInstalls(input: {
  orgId: string
  projectId?: string | null
  limit?: number
}): Promise<LucidPackInstall[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('lucid_pack_installs')
    .select(INSTALL_COLUMNS)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.projectId) query = query.eq('project_id', input.projectId)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, operation: 'listLucidPackInstalls' },
      tags: { layer: 'database', table: 'lucid_pack_installs' },
    })
    return []
  }

  return ((data ?? []) as unknown as InstallRow[]).map(mapInstall)
}

export async function getLucidPackInstall(input: {
  orgId: string
  installId: string
}): Promise<LucidPackInstall | null> {
  const { data, error } = await supabase
    .from('lucid_pack_installs')
    .select(INSTALL_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('id', input.installId)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, installId: input.installId, operation: 'getLucidPackInstall' },
      tags: { layer: 'database', table: 'lucid_pack_installs' },
    })
    return null
  }

  return data ? mapInstall(data as unknown as InstallRow) : null
}

export async function getLucidPack(input: {
  packId: string
  orgId?: string | null
}): Promise<LucidPack | null> {
  const pack = await getLucidPackById(input.packId)
  if (!pack) return null
  if (input.orgId) {
    if (!pack.orgId || pack.orgId === input.orgId) return pack
    return null
  }
  if (!pack.orgId) return pack
  return null
}

export async function getLucidPackByPackKey(input: {
  packKey: string
  orgId?: string | null
}): Promise<LucidPack | null> {
  let query = supabase
    .from('lucid_packs')
    .select(PACK_COLUMNS)
    .eq('pack_key', input.packKey)
    .order('created_at', { ascending: false })
    .limit(1)

  query = input.orgId ? query.or(`org_id.is.null,org_id.eq.${input.orgId}`) : query.is('org_id', null)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { packKey: input.packKey, orgId: input.orgId ?? undefined, operation: 'getLucidPackByPackKey' },
      tags: { layer: 'database', table: 'lucid_packs' },
    })
    return null
  }

  const row = (data ?? [])[0]
  return row ? mapPack(row as unknown as PackRow) : null
}

export async function updateLucidPackInstallStatus(input: {
  orgId: string
  installId: string
  status: LucidPackInstall['status']
}): Promise<LucidPackInstall> {
  const { data, error } = await supabase
    .from('lucid_pack_installs')
    .update({ status: input.status })
    .eq('org_id', input.orgId)
    .eq('id', input.installId)
    .select(INSTALL_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, installId: input.installId, status: input.status, operation: 'updateLucidPackInstallStatus' },
      tags: { layer: 'database', table: 'lucid_pack_installs' },
    })
    throw error
  }

  if (input.status === 'archived') {
    await archiveLucidPackManagedResources({
      orgId: input.orgId,
      installId: input.installId,
      reason: 'Pack install archived or uninstalled.',
    })
  }

  return mapInstall(data as unknown as InstallRow)
}

export async function listLucidPackManagedResources(input: {
  orgId: string
  installId?: string | null
  status?: LucidPackManagedResource['status']
  limit?: number
}): Promise<LucidPackManagedResource[]> {
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 500)
  let query = supabase
    .from('lucid_pack_managed_resources')
    .select(MANAGED_RESOURCE_COLUMNS)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (input.installId) query = query.eq('install_id', input.installId)
  if (input.status) query = query.eq('status', input.status)

  const { data, error } = await query
  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId: input.orgId, installId: input.installId ?? undefined, operation: 'listLucidPackManagedResources' },
      tags: { layer: 'database', table: 'lucid_pack_managed_resources' },
    })
    return []
  }

  return ((data ?? []) as unknown as ManagedResourceRow[]).map(mapManagedResource)
}

export async function listLucidPackMarketplaceSubmissions(input: {
  orgId: string
  packId?: string | null
  status?: LucidPackMarketplaceSubmissionStatus
  limit?: number
}): Promise<LucidPackMarketplaceSubmission[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  let query = supabase
    .from('lucid_pack_marketplace_submissions')
    .select(MARKETPLACE_SUBMISSION_COLUMNS)
    .eq('org_id', input.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (input.packId) query = query.eq('pack_id', input.packId)
  if (input.status) query = query.eq('status', input.status)

  const { data, error } = await query
  if (error) {
    if (isMissingMarketplaceSubmissionsTable(error)) return []

    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        orgId: input.orgId,
        packId: input.packId ?? undefined,
        operation: 'listLucidPackMarketplaceSubmissions',
      },
      tags: { layer: 'database', table: 'lucid_pack_marketplace_submissions' },
    })
    return []
  }

  return ((data ?? []) as unknown as MarketplaceSubmissionRow[]).map(mapMarketplaceSubmission)
}

export async function submitLucidPackForMarketplaceReview(input: {
  orgId: string
  packId: string
  submittedByUserId?: string | null
  qualityReport?: Record<string, unknown>
  reviewNotes?: string | null
}): Promise<LucidPackMarketplaceSubmission> {
  const pack = await getLucidPack({ packId: input.packId, orgId: input.orgId })
  if (!pack || pack.orgId !== input.orgId) {
    throw new Error('Only workspace-owned packs can be submitted for marketplace review')
  }

  const submittedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('lucid_pack_marketplace_submissions')
    .upsert({
      org_id: input.orgId,
      pack_id: input.packId,
      submitted_by_user_id: input.submittedByUserId ?? null,
      status: 'submitted',
      review_notes: input.reviewNotes ?? null,
      quality_report: input.qualityReport ?? {},
      submitted_at: submittedAt,
      reviewed_at: null,
    }, { onConflict: 'org_id,pack_id' })
    .select(MARKETPLACE_SUBMISSION_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, packId: input.packId, operation: 'submitLucidPackForMarketplaceReview' },
      tags: { layer: 'database', table: 'lucid_pack_marketplace_submissions' },
    })
    throw error
  }

  return mapMarketplaceSubmission(data as unknown as MarketplaceSubmissionRow)
}

export async function forkLucidPackManagedResource(input: {
  orgId: string
  installId: string
  resourceKey: string
  reason?: string | null
}): Promise<LucidPackManagedResource> {
  const resources = await listLucidPackManagedResources({
    orgId: input.orgId,
    installId: input.installId,
    limit: 500,
  })
  const existing = resources.find((resource) => resource.resourceKey === input.resourceKey)
  if (!existing) throw new Error('Managed pack resource not found')

  const forkedAt = new Date().toISOString()
  const { data, error } = await supabase
    .from('lucid_pack_managed_resources')
    .update({
      status: 'forked',
      forked_from_resource_id: existing.forkedFromResourceId ?? existing.id,
      forked_at: existing.forkedAt ?? forkedAt,
      fork_reason: input.reason ?? existing.forkReason ?? 'Operator forked managed resource for local ownership.',
      metadata: {
        ...existing.metadata,
        forked_by_operator: true,
        forked_at: existing.forkedAt ?? forkedAt,
      },
    })
    .eq('org_id', input.orgId)
    .eq('install_id', input.installId)
    .eq('resource_key', input.resourceKey)
    .select(MANAGED_RESOURCE_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: input.orgId, installId: input.installId, resourceKey: input.resourceKey, operation: 'forkLucidPackManagedResource' },
      tags: { layer: 'database', table: 'lucid_pack_managed_resources' },
    })
    throw error
  }

  return mapManagedResource(data as unknown as ManagedResourceRow)
}

export async function reconcileLucidPackInstall(input: {
  orgId: string
  installId: string
}): Promise<{
  install: LucidPackInstall
  resources: LucidPackManagedResource[]
  diffs: ReturnType<typeof buildLucidPackReconcilePlan>['diffs']
  summary: ReturnType<typeof buildLucidPackReconcilePlan>['summary']
}> {
  const install = await getLucidPackInstall(input)
  if (!install) throw new Error('Lucid pack install not found')
  const pack = await getLucidPackById(install.packId)
  if (!pack) throw new Error('Lucid pack not found')
  const existingResources = await listLucidPackManagedResources({
    orgId: input.orgId,
    installId: input.installId,
    limit: 500,
  })
  const plan = buildLucidPackReconcilePlan({
    manifest: pack.manifest,
    existingResources,
  })
  if (plan.patches.length > 0) {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('lucid_pack_managed_resources')
      .upsert(plan.patches.map((patch) => ({
        org_id: input.orgId,
        install_id: input.installId,
        resource_key: patch.resourceKey,
        resource_kind: patch.resourceKind,
        management_policy: patch.managementPolicy,
        status: patch.status,
        spec_hash: patch.specHash,
        metadata: {
          ...patch.metadata,
          pack_key: pack.packKey,
          pack_version: pack.version,
        },
        last_reconciled_at: now,
      })), { onConflict: 'install_id,resource_key' })

    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { orgId: input.orgId, installId: input.installId, operation: 'reconcileLucidPackInstall' },
        tags: { layer: 'database', table: 'lucid_pack_managed_resources' },
      })
      throw error
    }
  }

  return {
    install,
    resources: await listLucidPackManagedResources({ orgId: input.orgId, installId: input.installId, limit: 500 }),
    diffs: plan.diffs,
    summary: plan.summary,
  }
}

async function getLucidPackByKeyVersion(
  packKey: string,
  version: string,
  orgId: string | null,
): Promise<LucidPack | null> {
  let query = supabase
    .from('lucid_packs')
    .select(PACK_COLUMNS)
    .eq('pack_key', packKey)
    .eq('version', version)

  query = orgId ? query.eq('org_id', orgId) : query.is('org_id', null)

  const { data, error } = await query.maybeSingle()
  if (error) return null
  return data ? mapPack(data as unknown as PackRow) : null
}

async function getActiveLucidPackInstall(input: {
  orgId: string
  projectId?: string | null
  packId: string
}): Promise<LucidPackInstall | null> {
  let query = supabase
    .from('lucid_pack_installs')
    .select(INSTALL_COLUMNS)
    .eq('org_id', input.orgId)
    .eq('pack_id', input.packId)
    .eq('status', 'active')

  query = input.projectId ? query.eq('project_id', input.projectId) : query.is('project_id', null)

  const { data, error } = await query.maybeSingle()
  if (error) return null
  return data ? mapInstall(data as unknown as InstallRow) : null
}

async function getLucidPackById(packId: string): Promise<LucidPack | null> {
  const { data, error } = await supabase
    .from('lucid_packs')
    .select(PACK_COLUMNS)
    .eq('id', packId)
    .maybeSingle()
  if (error) return null
  return data ? mapPack(data as unknown as PackRow) : null
}

async function archiveLucidPackManagedResources(input: {
  orgId: string
  installId: string
  reason?: string | null
}): Promise<void> {
  const resources = await listLucidPackManagedResources({
    orgId: input.orgId,
    installId: input.installId,
    limit: 500,
  })
  if (resources.length === 0) return

  const archivedAt = new Date().toISOString()
  const rows = resources.map((resource) => ({
    org_id: input.orgId,
    install_id: input.installId,
    resource_key: resource.resourceKey,
    resource_kind: resource.resourceKind,
    resource_id: resource.resourceId ?? null,
    management_policy: resource.managementPolicy,
    status: 'archived',
    forked_from_resource_id: resource.forkedFromResourceId ?? null,
    forked_at: resource.forkedAt ?? null,
    fork_reason: resource.forkReason ?? null,
    uninstalled_at: archivedAt,
    uninstall_reason: input.reason ?? null,
    spec_hash: resource.specHash,
    metadata: {
      ...resource.metadata,
      archived_by_install: true,
      archived_at: archivedAt,
    },
    last_reconciled_at: archivedAt,
  }))

  const { error } = await supabase
    .from('lucid_pack_managed_resources')
    .upsert(rows, { onConflict: 'install_id,resource_key' })

  if (!error) return
  ErrorService.captureException(error, {
    severity: 'warning',
    context: { orgId: input.orgId, installId: input.installId, operation: 'archiveLucidPackManagedResources' },
    tags: { layer: 'database', table: 'lucid_pack_managed_resources' },
  })
}

function mapPack(row: PackRow): LucidPack {
  return {
    id: row.id,
    orgId: row.org_id,
    packKey: row.pack_key,
    name: row.name,
    description: row.description,
    version: row.version,
    manifest: row.manifest,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapManagedResource(row: ManagedResourceRow): LucidPackManagedResource {
  return {
    id: row.id,
    orgId: row.org_id,
    installId: row.install_id,
    resourceKey: row.resource_key,
    resourceKind: row.resource_kind,
    resourceId: row.resource_id,
    managementPolicy: row.management_policy,
    status: row.status,
    lastReconciledAt: row.last_reconciled_at,
    forkedFromResourceId: row.forked_from_resource_id,
    forkedAt: row.forked_at,
    forkReason: row.fork_reason,
    uninstalledAt: row.uninstalled_at,
    uninstallReason: row.uninstall_reason,
    specHash: row.spec_hash,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapMarketplaceSubmission(row: MarketplaceSubmissionRow): LucidPackMarketplaceSubmission {
  return {
    id: row.id,
    orgId: row.org_id,
    packId: row.pack_id,
    submittedByUserId: row.submitted_by_user_id,
    status: row.status,
    reviewNotes: row.review_notes,
    qualityReport: row.quality_report ?? {},
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isMissingMarketplaceSubmissionsTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
  const message = 'message' in error ? String((error as { message?: unknown }).message ?? '') : ''
  const details = 'details' in error ? String((error as { details?: unknown }).details ?? '') : ''
  const haystack = `${message} ${details}`

  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (/lucid_pack_marketplace_submissions/i.test(haystack) && /schema cache|could not find|does not exist/i.test(haystack))
  )
}

function mapInstall(row: InstallRow): LucidPackInstall {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    packId: row.pack_id,
    status: row.status,
    config: row.config ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
