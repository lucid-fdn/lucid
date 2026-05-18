import 'server-only'

import {
  getAssistant,
  getRetailFleetAssistantsSummary,
  findUserOrgByMetadataFlag,
} from '@/lib/db'

import { RETAIL_ORG_FLAG } from './constants'

/**
 * UUIDs only. Guards against router parameter injection (path traversal,
 * arbitrary DB queries with junk strings) before we ever touch the DB.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The subset of `ai_assistants` columns every retail page needs. The DB
 * helper returns the raw untyped Supabase row; we narrow once here and
 * hand callers a typed object so they don't need `as string` casts.
 */
export interface RetailAssistant {
  id: string
  name: string
  org_id: string
  lucid_model?: string
}

export type RetailOwnershipResult =
  | { ok: true; assistant: RetailAssistant; orgId: string }
  | { ok: false; reason: 'invalid_id' | 'not_found' }

/**
 * Resolves a retail agent for a signed-in user while enforcing the same
 * ownership invariant every retail page relies on:
 *
 *   1. `id` must be a UUID (router parameter injection guard)
 *   2. The assistant must exist
 *   3. The current user must own the retail personal org that owns it
 *
 * Returns `{ ok: false }` for every failure mode — never distinguishes
 * "not found" from "not yours" at the boundary. Callers translate into
 * `notFound()` so we don't leak assistant existence to attackers who
 * guessed a UUID they don't own.
 *
 * The two DB reads are fired in parallel to keep TTFB low on the happy
 * path — neither depends on the other.
 */
export async function resolveRetailAssistantForUser(
  userId: string,
  id: string,
): Promise<RetailOwnershipResult> {
  if (!UUID_RE.test(id)) {
    return { ok: false, reason: 'invalid_id' }
  }

  const [assistantRaw, retailOrgId] = await Promise.all([
    getAssistant(id),
    findUserOrgByMetadataFlag(userId, RETAIL_ORG_FLAG),
  ])

  if (!assistantRaw) {
    return { ok: false, reason: 'not_found' }
  }

  const assistant = assistantRaw as unknown as RetailAssistant

  if (!retailOrgId || retailOrgId !== assistant.org_id) {
    return { ok: false, reason: 'not_found' }
  }

  return { ok: true, assistant, orgId: retailOrgId }
}

/**
 * A single row in the retail fleet list. Intentionally a tiny subset of
 * `ai_assistants` — the fleet page shows a card grid, not a management
 * table, so we deliberately avoid pulling cost/health/channel columns the
 * retail user doesn't need yet.
 */
export interface RetailFleetAssistant {
  id: string
  name: string
  createdAt: string
  isActive: boolean
}

export type RetailFleetResult =
  | { ok: true; orgId: string; assistants: RetailFleetAssistant[] }
  | { ok: false; reason: 'no_retail_org' }

/**
 * Hard cap on how many agents the retail fleet page will render. Retail
 * personal orgs are single-user and expected to hold a handful of agents;
 * this cap exists to bound payload and render cost if anything ever
 * bypasses the UI's create-agent flow.
 */
export const RETAIL_FLEET_LIMIT = 100

/**
 * Lists the agents owned by the user's retail personal org.
 *
 * Returns `{ ok: false, reason: 'no_retail_org' }` when the user has not
 * provisioned a retail org yet — the fleet page translates that into an
 * empty state with a "create your first agent" CTA rather than a 404, so
 * a returning user who signed up but never finished the wizard has a path
 * forward.
 *
 * Uses `getRetailFleetAssistantsSummary` — a lean DB projection that
 * selects only the four columns the fleet card needs (id, name,
 * created_at, is_active), scoped by `org_id`, sorted newest-first, and
 * capped at `RETAIL_FLEET_LIMIT` rows at the SQL layer. If a future
 * phase needs channel badges, extend the summary helper rather than
 * adding a second query.
 */
export async function listRetailFleetForUser(
  userId: string,
): Promise<RetailFleetResult> {
  const retailOrgId = await findUserOrgByMetadataFlag(userId, RETAIL_ORG_FLAG)
  if (!retailOrgId) {
    return { ok: false, reason: 'no_retail_org' }
  }

  const rows = await getRetailFleetAssistantsSummary(
    retailOrgId,
    RETAIL_FLEET_LIMIT,
  )

  return {
    ok: true,
    orgId: retailOrgId,
    assistants: rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      isActive: row.is_active,
    })),
  }
}
