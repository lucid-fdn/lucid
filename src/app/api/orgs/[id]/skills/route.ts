import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import {
  getSkillCatalog,
  getOrgSkills,
  getSkillById,
  installSkill,
  uninstallSkill,
  isUserOrgMember,
  checkSkillUpdates,
  applySkillUpdate,
  applyAllSkillUpdates,
  upsertSkillInstallArtifact,
} from '@/lib/db'
import { ErrorService } from '@/lib/errors/error-service'
import { checkRateLimit, getRequestIdentifier, RateLimitPresets } from '@/lib/auth/rate-limit'
import { enumerateSkillVariantKeys } from '@contracts/skill-resolution'
import { getEmbeddedInternalSkillPath } from '@/lib/skills/internal-packages'

export const dynamic = 'force-dynamic'

/**
 * GET /api/orgs/[id]/skills
 * List all approved catalog skills + org's installation status.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(_req), RateLimitPresets.RELAXED)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await params

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [catalog, installations, updates] = await Promise.all([
      getSkillCatalog(orgId),
      getOrgSkills(orgId),
      checkSkillUpdates(orgId),
    ])

    const installedMap = new Map(installations.map(i => [i.skill_id, i]))
    const updateMap = new Map(updates.map(u => [u.installation_id, u]))

    const skills = catalog.map(s => {
      const installation = installedMap.get(s.id)
      return {
        ...s,
        verified: s.status === 'approved',
        installed: !!installation,
        installation: installation || null,
        update_available: installation ? updateMap.get(installation.id) ?? null : null,
      }
    })

    return NextResponse.json({ skills, updates_available: updates.length })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/skills', method: 'GET' },
      tags: { layer: 'api', route: 'org-skills' },
    })
    return NextResponse.json({ error: 'Failed to load skills' }, { status: 500 })
  }
}

/**
 * POST /api/orgs/[id]/skills
 * Install a skill for the org.
 * Body: { skillId: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await params

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { skillId } = body as { skillId: string }

    if (!skillId) {
      return NextResponse.json({ error: 'skillId is required' }, { status: 400 })
    }

    const skill = await getSkillById(skillId, orgId)
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }

    const result = await installSkill(orgId, skillId, userId)
    if (!result) {
      return NextResponse.json({ error: 'Failed to install skill. It may already be installed.' }, { status: 409 })
    }

    const variantKeys = enumerateSkillVariantKeys(skill)
    const embeddedLocalPath = await getEmbeddedInternalSkillPath(skill.slug)
    await Promise.all(variantKeys.map((variantKey) => upsertSkillInstallArtifact({
      orgId,
      skillId,
      installationId: result.id,
      sourceVariantKey: variantKey,
      localPath: embeddedLocalPath,
      artifactChecksum: skill.artifact_checksum ?? skill.content_hash,
      warmState: embeddedLocalPath ? 'embedded' : 'remote_only',
    })))

    return NextResponse.json({ installation: result }, { status: 201 })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/skills', method: 'POST' },
      tags: { layer: 'api', route: 'org-skills' },
    })
    return NextResponse.json({ error: 'Failed to install skill' }, { status: 500 })
  }
}

/**
 * PATCH /api/orgs/[id]/skills
 * Apply skill updates.
 * Body: { installationId: string } — update one, or { updateAll: true } — update all auto_update=true
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await params

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { installationId, updateAll } = body as { installationId?: string; updateAll?: boolean }

    if (updateAll) {
      const count = await applyAllSkillUpdates(orgId)
      return NextResponse.json({ updated: count })
    }

    if (!installationId) {
      return NextResponse.json({ error: 'installationId or updateAll required' }, { status: 400 })
    }

    const success = await applySkillUpdate(installationId, orgId)
    if (!success) {
      return NextResponse.json({ error: 'Failed to apply update' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/skills', method: 'PATCH' },
      tags: { layer: 'api', route: 'org-skills' },
    })
    return NextResponse.json({ error: 'Failed to apply skill update' }, { status: 500 })
  }
}

/**
 * DELETE /api/orgs/[id]/skills
 * Uninstall a skill from the org. Cascades to all assistant activations.
 * Body: { skillId: string }
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const rl = await checkRateLimit(getRequestIdentifier(req), RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orgId } = await params

    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { skillId } = body as { skillId: string }

    if (!skillId) {
      return NextResponse.json({ error: 'skillId is required' }, { status: 400 })
    }

    const success = await uninstallSkill(orgId, skillId)
    if (!success) {
      return NextResponse.json({ error: 'Failed to uninstall skill' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/orgs/[id]/skills', method: 'DELETE' },
      tags: { layer: 'api', route: 'org-skills' },
    })
    return NextResponse.json({ error: 'Failed to uninstall skill' }, { status: 500 })
  }
}
