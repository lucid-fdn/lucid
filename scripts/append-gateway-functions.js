/**
 * Append gateway DB functions to src/lib/db/index.ts
 * These were lost during a failed replace_in_file operation.
 * This version includes project_id support (migration 054).
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')

const filePath = 'src/lib/db/index.ts'
let content = fs.readFileSync(filePath, 'utf8')

// Check if gateway functions already exist
if (content.includes('logOrgLucidGatewayKeyAuditEvent')) {
  console.log('Gateway functions already exist in the file. Skipping.')
  process.exit(0)
}

const NL = content.includes('\r\n') ? '\r\n' : '\n'

const gatewayCode = `
// ─────────────────────────────────────────────────────────────────────────────
// Org LucidGateway Key Management
// ─────────────────────────────────────────────────────────────────────────────

export type OrgLucidGatewayKeyAuditEventType =
  | 'created'
  | 'rotated'
  | 'revoked'
  | 'rotation_started'
  | 'rotation_completed'
  | 'rotation_failed'
  | 'error'

export async function logOrgLucidGatewayKeyAuditEvent(params: {
  orgId: string
  keyId?: string | null
  eventType: OrgLucidGatewayKeyAuditEventType
  actorUserId?: string | null
  projectId?: string | null
  metadata?: Record<string, unknown>
}) {
  const { data, error } = await supabase
    .from('org_lucidgateway_key_audit_events')
    .insert({
      org_id: params.orgId,
      key_id: params.keyId || null,
      event_type: params.eventType,
      actor_user_id: params.actorUserId || null,
      project_id: params.projectId || null,
      metadata: params.metadata || {},
    })
    .select('id, org_id, key_id, event_type, actor_user_id, project_id, metadata, created_at')
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        orgId: params.orgId,
        keyId: params.keyId || null,
        eventType: params.eventType,
        operation: 'logOrgLucidGatewayKeyAuditEvent',
      },
      tags: { layer: 'database', table: 'org_lucidgateway_key_audit_events' },
    })
  }

  return data
}

export async function listOrgLucidGatewayKeyAuditEvents(params: {
  orgId: string
  keyId?: string
  eventType?: OrgLucidGatewayKeyAuditEventType
  limit?: number
}) {
  let query = supabase
    .from('org_lucidgateway_key_audit_events')
    .select('id, org_id, key_id, event_type, actor_user_id, project_id, metadata, created_at')
    .eq('org_id', params.orgId)
    .order('created_at', { ascending: false })

  if (params.keyId) {
    query = query.eq('key_id', params.keyId)
  }
  if (params.eventType) {
    query = query.eq('event_type', params.eventType)
  }
  if (params.limit) {
    query = query.limit(params.limit)
  }

  const { data, error } = await query

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId: params.orgId,
        keyId: params.keyId,
        operation: 'listOrgLucidGatewayKeyAuditEvents',
      },
      tags: { layer: 'database', table: 'org_lucidgateway_key_audit_events' },
    })
    return []
  }

  return data || []
}

const KEY_SELECT_COLUMNS =
  'id, org_id, key_alias, key_preview, lucidgateway_key_id, rpm_limit, tpm_limit, max_budget, budget_duration, models, is_active, status, metadata, created_by, rotated_from_key_id, project_id, created_at, updated_at, revoked_at'

export async function listOrgLucidGatewayKeys(orgId: string) {
  const { data, error } = await supabase
    .from('org_lucidgateway_keys')
    .select(KEY_SELECT_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, operation: 'listOrgLucidGatewayKeys' },
      tags: { layer: 'database', table: 'org_lucidgateway_keys' },
    })
    return []
  }

  return data || []
}

export async function getOrgLucidGatewayKey(orgId: string, keyId: string) {
  const { data, error } = await supabase
    .from('org_lucidgateway_keys')
    .select(KEY_SELECT_COLUMNS)
    .eq('org_id', orgId)
    .eq('id', keyId)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId, keyId, operation: 'getOrgLucidGatewayKey' },
      tags: { layer: 'database', table: 'org_lucidgateway_keys' },
    })
    return null
  }

  return data
}

export async function createOrgLucidGatewayKey(params: {
  orgId: string
  keyAlias: string
  keyPreview: string
  lucidgatewayKeyId?: string | null
  rawVirtualKey: string
  rpmLimit?: number | null
  tpmLimit?: number | null
  maxBudget?: number | null
  budgetDuration?: string | null
  models?: string[]
  metadata?: Record<string, unknown>
  createdBy?: string | null
  rotatedFromKeyId?: string | null
  projectId?: string | null
}) {
  const { data, error } = await supabase
    .from('org_lucidgateway_keys')
    .insert({
      org_id: params.orgId,
      key_alias: params.keyAlias,
      key_preview: params.keyPreview,
      lucidgateway_key_id: params.lucidgatewayKeyId || null,
      encrypted_virtual_key: params.rawVirtualKey,
      rpm_limit: params.rpmLimit ?? null,
      tpm_limit: params.tpmLimit ?? null,
      max_budget: params.maxBudget ?? null,
      budget_duration: params.budgetDuration ?? null,
      models: params.models || [],
      status: 'active',
      is_active: true,
      metadata: params.metadata || {},
      created_by: params.createdBy || null,
      rotated_from_key_id: params.rotatedFromKeyId || null,
      project_id: params.projectId || null,
    })
    .select(KEY_SELECT_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId: params.orgId,
        keyAlias: params.keyAlias,
        operation: 'createOrgLucidGatewayKey',
      },
      tags: { layer: 'database', table: 'org_lucidgateway_keys' },
    })
    throw error
  }

  return data
}

export async function setOrgLucidGatewayKeyStatus(params: {
  orgId: string
  keyId: string
  status: string
  isActive: boolean
  metadata?: Record<string, unknown>
}) {
  const updatePayload: Record<string, unknown> = {
    status: params.status,
    is_active: params.isActive,
  }

  if (params.metadata) {
    updatePayload.metadata = params.metadata
  }

  if (params.status === 'revoked') {
    updatePayload.revoked_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('org_lucidgateway_keys')
    .update(updatePayload)
    .eq('org_id', params.orgId)
    .eq('id', params.keyId)
    .select(KEY_SELECT_COLUMNS)
    .single()

  if (error || !data) {
    ErrorService.captureException(error || new Error('Failed to update org_lucidgateway_keys row'), {
      severity: 'error',
      context: {
        orgId: params.orgId,
        keyId: params.keyId,
        status: params.status,
        operation: 'setOrgLucidGatewayKeyStatus',
      },
      tags: { layer: 'database', table: 'org_lucidgateway_keys' },
    })
    throw error || new Error('setOrgLucidGatewayKeyStatus returned no data')
  }

  return data
}

// ─────────────────────────────────────────────────────────────────────────────
// Key Templates
// ─────────────────────────────────────────────────────────────────────────────

export async function createKeyTemplate(params: {
  orgId: string
  templateName: string
  description?: string
  config: Record<string, unknown>
  createdBy: string
}) {
  const { data, error } = await supabase
    .from('org_key_templates')
    .insert({
      org_id: params.orgId,
      template_name: params.templateName,
      description: params.description || null,
      config: params.config,
      created_by: params.createdBy,
    })
    .select()
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: params.orgId, templateName: params.templateName, operation: 'createKeyTemplate' },
      tags: { layer: 'database', table: 'org_key_templates' },
    })
    throw error
  }

  return data
}

export async function listKeyTemplates(orgId: string) {
  const { data, error } = await supabase
    .from('org_key_templates')
    .select('id, org_id, template_name, description, config, created_by, created_at, updated_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, operation: 'listKeyTemplates' },
      tags: { layer: 'database', table: 'org_key_templates' },
    })
    return []
  }

  return data || []
}

export async function getKeyTemplate(templateId: string) {
  const { data, error } = await supabase
    .from('org_key_templates')
    .select('id, org_id, template_name, description, config, created_by, created_at, updated_at')
    .eq('id', templateId)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { templateId, operation: 'getKeyTemplate' },
      tags: { layer: 'database', table: 'org_key_templates' },
    })
    return null
  }

  return data
}

export async function deleteKeyTemplate(templateId: string) {
  const { error } = await supabase
    .from('org_key_templates')
    .delete()
    .eq('id', templateId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { templateId, operation: 'deleteKeyTemplate' },
      tags: { layer: 'database', table: 'org_key_templates' },
    })
    throw error
  }
}
`

// Normalize line endings to match the file
const normalizedCode = NL === '\r\n' ? gatewayCode.replace(/\n/g, '\r\n') : gatewayCode

content = content.trimEnd() + NL + normalizedCode + NL
fs.writeFileSync(filePath, content)

console.log('✅ Gateway functions appended to src/lib/db/index.ts')
console.log('   - logOrgLucidGatewayKeyAuditEvent (with projectId)')
console.log('   - listOrgLucidGatewayKeyAuditEvents')
console.log('   - listOrgLucidGatewayKeys (with project_id in SELECT)')
console.log('   - getOrgLucidGatewayKey (with project_id in SELECT)')
console.log('   - createOrgLucidGatewayKey (with projectId param)')
console.log('   - setOrgLucidGatewayKeyStatus (with project_id in SELECT)')
console.log('   - createKeyTemplate (centralized client)')
console.log('   - listKeyTemplates (centralized client)')
console.log('   - getKeyTemplate (centralized client)')
console.log('   - deleteKeyTemplate (centralized client)')
