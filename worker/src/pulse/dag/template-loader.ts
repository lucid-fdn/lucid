/**
 * DAG Template Loader — Phase 4N-a, Task 21.
 *
 * Fetches operator-authored templates from `orchestration_dag_templates`,
 * validates the JSONB `spec` against a Zod schema, and returns a typed
 * `DagSpec` ready to hand to `DagPlanner.instantiateFromTemplate()`.
 *
 * Validation rules enforced here (cheap fail-fast before the planner
 * touches the DB):
 *   - Unique node_keys within the template
 *   - Every edge endpoint references a declared node_key
 *   - expansion_zones reference declared node_keys
 *   - No self-loops
 *
 * Cycle detection is NOT done here — that lives in
 * `worker/src/pulse/dag/cycle-detector.ts` and is called by DagPlanner
 * before commit. This module just guarantees the spec shape is sane and
 * internally consistent so the planner can assume referential integrity.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  DAG_EDGE_KINDS,
  DAG_NODE_TYPES,
  type DagSpec,
} from './types.js'

// Must stay in sync with the leaf `step_type` CHECK in
// 20260407220000_orchestration_dag_core.sql and the contract interface.
// Mirrors `dagSpecSchema` in `contracts/dag.ts` — the contract-sync test
// (`worker/src/pulse/__tests__/contract-sync.test.ts`) enforces structural
// equivalence so this and the Next.js src/ side cannot drift.
const DAG_LEAF_STEP_TYPES = [
  'inbound',
  'outbound',
  'scheduled',
  'webhook',
  'approval',
] as const

const DAG_ROUTE_CLASSES = ['fast', 'strong', 'external'] as const

// ----------------------------------------------------------------------------
// Zod schema — validates the `spec` JSONB column payload.
// ----------------------------------------------------------------------------

const dagSpecNodeSchema = z.object({
  node_key: z.string().min(1).max(128),
  node_type: z.enum(DAG_NODE_TYPES),
  step_type: z.enum(DAG_LEAF_STEP_TYPES).optional(),
  runtime_target: z.string().min(1).optional(),
  route_class: z.enum(DAG_ROUTE_CLASSES).optional(),
  payload: z.unknown().optional(),
  confidence_floor: z.number().min(0).max(1).optional(),
})

const dagSpecEdgeSchema = z.object({
  parent: z.string().min(1),
  child: z.string().min(1),
  edge_kind: z.enum(DAG_EDGE_KINDS).optional(),
})

export const dagSpecSchema = z.object({
  nodes: z.array(dagSpecNodeSchema).min(1),
  edges: z.array(dagSpecEdgeSchema),
  expansion_zones: z.array(z.string().min(1)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

export class TemplateValidationError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(`[dag-template] ${path}: ${message}`)
    this.name = 'TemplateValidationError'
  }
}

export class TemplateNotFoundError extends Error {
  constructor(orgId: string, slug: string, version?: number) {
    super(
      `[dag-template] template not found: org=${orgId} slug=${slug}` +
        (version != null ? ` version=${version}` : ''),
    )
    this.name = 'TemplateNotFoundError'
  }
}

// ----------------------------------------------------------------------------
// Row shape (subset of orchestration_dag_templates we care about)
// ----------------------------------------------------------------------------

export interface DagTemplateRow {
  id: string
  org_id: string | null
  slug: string
  name: string
  version: number
  spec: DagSpec
  schema_version: number
  trigger_intents: string[] | null
  mission_type: string | null
  is_active: boolean
}

// ----------------------------------------------------------------------------
// Referential-integrity pass over a parsed spec.
// Runs AFTER Zod — Zod only validates shape, this validates semantics.
// ----------------------------------------------------------------------------

function validateSpecIntegrity(spec: DagSpec): void {
  const nodeKeys = new Set<string>()
  for (let i = 0; i < spec.nodes.length; i++) {
    const node = spec.nodes[i]!
    if (nodeKeys.has(node.node_key)) {
      throw new TemplateValidationError(
        `duplicate node_key "${node.node_key}"`,
        `nodes[${i}].node_key`,
      )
    }
    nodeKeys.add(node.node_key)
  }

  for (let i = 0; i < spec.edges.length; i++) {
    const edge = spec.edges[i]!
    if (edge.parent === edge.child) {
      throw new TemplateValidationError(
        `self-loop on node "${edge.parent}"`,
        `edges[${i}]`,
      )
    }
    if (!nodeKeys.has(edge.parent)) {
      throw new TemplateValidationError(
        `edge parent "${edge.parent}" is not a declared node`,
        `edges[${i}].parent`,
      )
    }
    if (!nodeKeys.has(edge.child)) {
      throw new TemplateValidationError(
        `edge child "${edge.child}" is not a declared node`,
        `edges[${i}].child`,
      )
    }
  }

  if (spec.expansion_zones) {
    for (let i = 0; i < spec.expansion_zones.length; i++) {
      const zone = spec.expansion_zones[i]!
      if (!nodeKeys.has(zone)) {
        throw new TemplateValidationError(
          `expansion_zone "${zone}" is not a declared node`,
          `expansion_zones[${i}]`,
        )
      }
    }
  }
}

/**
 * Parse + validate a raw JSONB spec value into a typed `DagSpec`.
 * Exported so DagPlanner can reuse it for inline specs (agent-authored
 * DAGs that never hit the templates table).
 */
export function parseDagSpec(raw: unknown): DagSpec {
  const result = dagSpecSchema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    const path = issue?.path.join('.') || 'spec'
    throw new TemplateValidationError(issue?.message ?? 'invalid spec', path)
  }
  const spec = result.data as DagSpec
  validateSpecIntegrity(spec)
  return spec
}

// ----------------------------------------------------------------------------
// Loader
// ----------------------------------------------------------------------------

/**
 * Fetch a template by (org_id, slug, version?). When `version` is omitted,
 * loads the highest active version for that slug. Returns the row plus a
 * fully-validated `DagSpec`.
 *
 * Org-scoping rule: templates may be org-scoped (org_id = $orgId) or
 * global (org_id IS NULL). Both are visible to the caller. This matches
 * the RLS policy on `orchestration_dag_templates`.
 */
export async function loadTemplateBySlug(
  supabase: SupabaseClient,
  orgId: string,
  slug: string,
  version?: number,
): Promise<DagTemplateRow> {
  let query = supabase
    .from('orchestration_dag_templates')
    .select('id, org_id, slug, name, version, spec, schema_version, trigger_intents, mission_type, is_active')
    .eq('slug', slug)
    .eq('is_active', true)
    .or(`org_id.eq.${orgId},org_id.is.null`)

  if (version != null) {
    query = query.eq('version', version)
  } else {
    query = query.order('version', { ascending: false }).limit(1)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(`[dag-template] load failed: ${error.message}`)
  }
  if (!data) {
    throw new TemplateNotFoundError(orgId, slug, version)
  }

  const row = data as DagTemplateRow
  row.spec = parseDagSpec(row.spec)
  return row
}
