/**
 * Admin Skills API (Internal)
 *
 * GET  /api/internal/skills          — List all skills (optional ?status=draft|approved|deprecated&visibility=global|org_private)
 * POST /api/internal/skills          — Sync mirrored skills from MCPGate
 * PATCH /api/internal/skills         — Approve/reject skill or publish an org-private promoted skill into the global catalog draft queue
 *
 * Auth: getUserId() + isInternalOrg() — only Lucid team members can manage the catalog.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { getSkillCatalogAdmin, approveSkill, rejectSkill, publishPrivateSkillToCatalog } from '@/lib/db'
import { isInternalOrg } from '@/lib/auth/internal'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { reconcileSkillCatalog } from '@/lib/skills/reconcile'

export const dynamic = 'force-dynamic'

async function requireAdmin(req: NextRequest): Promise<{ error: NextResponse } | { userId: string }> {
  const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
  if (!rl.success) {
    return { error: NextResponse.json({ error: 'Too many requests' }, { status: 429 }) }
  }

  const userId = await getUserId()
  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  // Internal org check — we need the user's org. Use a simple approach:
  // The INTERNAL_ORG_IDS env var contains known internal org IDs.
  // For admin endpoints we also accept a ?orgId param that we validate.
  // Alternatively, we trust that only internal org members can reach this endpoint
  // by checking the user's org membership against internal orgs.
  // For simplicity, we use the CRON_SECRET approach used by other internal endpoints.
  const secret = req.nextUrl.searchParams.get('secret')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && secret === cronSecret) {
    return { userId }
  }

  // Fallback: check if user belongs to an internal org
  // This requires importing supabase directly for the org membership check
  const { supabase } = await import('@/lib/db/client')
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)

  const isInternal = (memberships ?? []).some(m => isInternalOrg(m.organization_id))
  if (!isInternal) {
    return { error: NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 }) }
  }

  return { userId }
}

/**
 * GET /api/internal/skills?status=draft
 * List all catalog skills (all statuses by default).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if ('error' in auth) return auth.error

    const status = req.nextUrl.searchParams.get('status') as 'draft' | 'approved' | 'deprecated' | null
    const visibility = req.nextUrl.searchParams.get('visibility') as 'global' | 'org_private' | null
    const skills = await getSkillCatalogAdmin(status ?? undefined, visibility ?? undefined)

    return NextResponse.json({ skills })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/internal/skills', method: 'GET' },
      tags: { layer: 'api', route: 'admin-skills' },
    })
    return NextResponse.json({ error: 'Failed to load skills' }, { status: 500 })
  }
}

/**
 * POST /api/internal/skills
 * Publish first-party internal skills to MCPGate and/or sync the canonical catalog back locally.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if ('error' in auth) return auth.error

    const body = await req.json().catch(() => ({}))
    const mode = body && typeof body.mode === 'string' ? body.mode : 'publish_and_sync'

    const result = await reconcileSkillCatalog(mode)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/internal/skills', method: 'POST' },
      tags: { layer: 'api', route: 'admin-skills-sync' },
    })
    return NextResponse.json({ error: 'Failed to sync mirrored skills' }, { status: 500 })
  }
}

/**
 * PATCH /api/internal/skills
 * Approve/reject a skill or publish an org-private promoted skill into the
 * global catalog draft queue.
 */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if ('error' in auth) return auth.error

    const body = await req.json()
    const {
      skillId,
      action,
      slug,
      name,
      description,
    } = body as {
      skillId: string
      action: 'approve' | 'reject' | 'publish_private_to_catalog'
      slug?: string
      name?: string
      description?: string | null
    }

    if (!skillId || !action || !['approve', 'reject', 'publish_private_to_catalog'].includes(action)) {
      return NextResponse.json(
        { error: 'skillId and action (approve|reject|publish_private_to_catalog) are required' },
        { status: 400 },
      )
    }

    if (action === 'publish_private_to_catalog') {
      const published = await publishPrivateSkillToCatalog({
        skillId,
        slug,
        name,
        description: description ?? null,
      })

      if (!published) {
        return NextResponse.json({ error: 'Failed to publish private skill to catalog' }, { status: 500 })
      }

      return NextResponse.json({ success: true, action, publishedSkillId: published.id })
    }

    const success = action === 'approve'
      ? await approveSkill(skillId)
      : await rejectSkill(skillId)

    if (!success) {
      return NextResponse.json({ error: `Failed to ${action} skill` }, { status: 500 })
    }

    return NextResponse.json({ success: true, action })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/internal/skills', method: 'PATCH' },
      tags: { layer: 'api', route: 'admin-skills' },
    })
    return NextResponse.json({ error: 'Failed to update skill' }, { status: 500 })
  }
}
