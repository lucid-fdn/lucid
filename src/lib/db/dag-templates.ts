/**
 * Workflow Templates DB layer - DAG-backed orchestration templates.
 *
 * CRUD over `orchestration_dag_templates`. Operator-authored workflow backbones
 * that the runtime planner instantiates into execution DAGs.
 *
 * Validation: every spec passes through `dagSpecSchema` (canonical Zod schema
 * in `contracts/dag.ts`) before it reaches the DB. The worker-side template
 * loader (`worker/src/pulse/dag/template-loader.ts`) holds a byte-for-byte
 * mirror; the contract-sync test enforces equivalence.
 *
 * RLS:
 *   - SELECT - visible to org members + global rows (org_id IS NULL)
 *   - WRITE  - admin/owner only (enforced by RLS policy + this layer's API
 *     route checks `getOrgMemberRole()` before delegating here)
 *
 * Versioning: (org_id, slug, version) is UNIQUE. Updates create a new row
 * with version+1 by default; the previous version stays addressable.
 */

import 'server-only'
import { z } from 'zod'
import { dagSpecSchema, type DagSpec } from '@contracts/dag'
import { supabase, ErrorService } from './client'

// ----------------------------------------------------------------------------
// Row shape
// ----------------------------------------------------------------------------

export interface DagTemplateRow {
  id: string
  org_id: string | null
  slug: string
  name: string
  description: string | null
  version: number
  spec: DagSpec
  schema_version: number
  trigger_intents: string[] | null
  mission_type: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
}

const TEMPLATE_COLUMNS =
  'id, org_id, slug, name, description, version, spec, schema_version, trigger_intents, mission_type, is_active, created_by, created_at'

// ----------------------------------------------------------------------------
// Input validation
// ----------------------------------------------------------------------------

// Slug must be URL-safe so it can land in REST paths and template lookup keys.
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

export const createTemplateInputSchema = z.object({
  slug: z.string().min(1).max(128).regex(SLUG_PATTERN, {
    message: 'slug must be lowercase alphanumeric with - or _',
  }),
  name: z.string().min(1).max(256),
  description: z.string().max(2048).nullable().optional(),
  version: z.number().int().min(1).optional(),
  spec: dagSpecSchema,
  schema_version: z.number().int().min(1).optional(),
  trigger_intents: z.array(z.string().min(1)).nullable().optional(),
  mission_type: z.string().min(1).max(128).nullable().optional(),
  is_active: z.boolean().optional(),
})

export type CreateTemplateInput = z.infer<typeof createTemplateInputSchema>

// `slug` is immutable after creation — bumping it would break consumers that
// reference templates by slug. Use a new template instead.
export const updateTemplateInputSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(2048).nullable().optional(),
  spec: dagSpecSchema.optional(),
  schema_version: z.number().int().min(1).optional(),
  trigger_intents: z.array(z.string().min(1)).nullable().optional(),
  mission_type: z.string().min(1).max(128).nullable().optional(),
  is_active: z.boolean().optional(),
})

export type UpdateTemplateInput = z.infer<typeof updateTemplateInputSchema>

// ----------------------------------------------------------------------------
// Read
// ----------------------------------------------------------------------------

/**
 * List templates visible to an org. Includes org-scoped rows AND global
 * (org_id IS NULL) rows so operators see seeded backbones alongside their own.
 *
 * Mirrors the RLS visibility policy in
 * `20260407220000_orchestration_dag_core.sql` so the service-role client
 * returns the same set a member would see.
 */
export async function listDagTemplates(
  orgId: string,
  options?: { activeOnly?: boolean; limit?: number },
): Promise<DagTemplateRow[]> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500)

  let query = supabase
    .from('orchestration_dag_templates')
    .select(TEMPLATE_COLUMNS)
    .or(`org_id.eq.${orgId},org_id.is.null`)
    .order('slug', { ascending: true })
    .order('version', { ascending: false })
    .limit(limit)

  if (options?.activeOnly) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, table: 'orchestration_dag_templates', operation: 'SELECT' },
      tags: { layer: 'database', table: 'orchestration_dag_templates' },
    })
    return []
  }

  return (data ?? []) as DagTemplateRow[]
}

/**
 * Fetch one template by id. Enforces org visibility (org row OR global row)
 * so a caller from org A cannot read a template owned by org B even with the
 * service-role client.
 */
export async function getDagTemplate(
  orgId: string,
  templateId: string,
): Promise<DagTemplateRow | null> {
  const { data, error } = await supabase
    .from('orchestration_dag_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('id', templateId)
    .or(`org_id.eq.${orgId},org_id.is.null`)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, templateId, table: 'orchestration_dag_templates', operation: 'SELECT' },
      tags: { layer: 'database', table: 'orchestration_dag_templates' },
    })
    return null
  }

  return (data ?? null) as DagTemplateRow | null
}

// ----------------------------------------------------------------------------
// Write
// ----------------------------------------------------------------------------

/**
 * Insert a new template version. Validates the spec via Zod first so the DB
 * never sees a structurally bad JSONB payload. Returns null on duplicate
 * (org_id, slug, version) so the route can map it to a 409.
 */
export async function createDagTemplate(
  orgId: string,
  userId: string,
  input: CreateTemplateInput,
): Promise<DagTemplateRow | null> {
  const validated = createTemplateInputSchema.parse(input)

  const { data, error } = await supabase
    .from('orchestration_dag_templates')
    .insert({
      org_id: orgId,
      slug: validated.slug,
      name: validated.name,
      description: validated.description ?? null,
      version: validated.version ?? 1,
      spec: validated.spec,
      schema_version: validated.schema_version ?? 1,
      trigger_intents: validated.trigger_intents ?? null,
      mission_type: validated.mission_type ?? null,
      is_active: validated.is_active ?? true,
      created_by: userId,
    })
    .select(TEMPLATE_COLUMNS)
    .single()

  if (error) {
    // 23505 = unique_violation on (org_id, slug, version)
    if (error.code === '23505') {
      return null
    }
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, slug: validated.slug, table: 'orchestration_dag_templates', operation: 'INSERT' },
      tags: { layer: 'database', table: 'orchestration_dag_templates' },
    })
    throw error
  }

  return data as DagTemplateRow
}

/**
 * Update an existing template in-place. Org-scoped: only the row's owning
 * org may update (global templates are read-only via this layer — they're
 * managed by seed migrations). Global writes return null without error so
 * the route can map it to 403/404.
 */
export async function updateDagTemplate(
  orgId: string,
  templateId: string,
  input: UpdateTemplateInput,
): Promise<DagTemplateRow | null> {
  const validated = updateTemplateInputSchema.parse(input)

  const patch: Record<string, unknown> = {}
  if (validated.name !== undefined) patch.name = validated.name
  if (validated.description !== undefined) patch.description = validated.description
  if (validated.spec !== undefined) patch.spec = validated.spec
  if (validated.schema_version !== undefined) patch.schema_version = validated.schema_version
  if (validated.trigger_intents !== undefined) patch.trigger_intents = validated.trigger_intents
  if (validated.mission_type !== undefined) patch.mission_type = validated.mission_type
  if (validated.is_active !== undefined) patch.is_active = validated.is_active

  if (Object.keys(patch).length === 0) {
    return getDagTemplate(orgId, templateId)
  }

  const { data, error } = await supabase
    .from('orchestration_dag_templates')
    .update(patch)
    .eq('id', templateId)
    .eq('org_id', orgId)
    .select(TEMPLATE_COLUMNS)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, templateId, table: 'orchestration_dag_templates', operation: 'UPDATE' },
      tags: { layer: 'database', table: 'orchestration_dag_templates' },
    })
    return null
  }

  return (data ?? null) as DagTemplateRow | null
}

/**
 * Delete a template. Org-scoped to prevent deleting global rows via this
 * layer. Returns false on error or when no row was deleted (id mismatch /
 * cross-org / global row).
 */
export async function deleteDagTemplate(
  orgId: string,
  templateId: string,
): Promise<boolean> {
  const { error, count } = await supabase
    .from('orchestration_dag_templates')
    .delete({ count: 'exact' })
    .eq('id', templateId)
    .eq('org_id', orgId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, templateId, table: 'orchestration_dag_templates', operation: 'DELETE' },
      tags: { layer: 'database', table: 'orchestration_dag_templates' },
    })
    return false
  }

  return (count ?? 0) > 0
}
