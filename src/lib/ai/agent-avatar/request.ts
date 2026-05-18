import 'server-only'

import { z } from 'zod'

import { supabase } from '@/lib/db/client'
import { requireOrgRequestContext } from '@/lib/request-context/org'
import { getUserId } from '@/lib/auth/server-utils'
import {
  normalizeAvatarAngle,
  normalizeAvatarBackground,
  normalizeAvatarCrop,
  normalizeAvatarExpression,
  normalizeAvatarGenderPresentation,
  normalizeAvatarLighting,
  normalizeAvatarPose,
  normalizeAvatarStyle,
} from './styles'
import type { AgentAvatarSpec } from './types'

export const avatarGenerateRequestSchema = z.object({
  orgId: z.string().uuid().optional(),
  draftId: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(120).default('Lucid Agent'),
  role: z.string().trim().max(160).optional(),
  description: z.string().trim().max(800).optional(),
  personalityTraits: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  stylePreset: z.string().trim().optional(),
  angle: z.string().trim().optional(),
  crop: z.string().trim().optional(),
  expression: z.string().trim().optional(),
  background: z.string().trim().optional(),
  lighting: z.string().trim().optional(),
  genderPresentation: z.string().trim().optional(),
  pose: z.string().trim().optional(),
  referenceAssetId: z.string().uuid().optional(),
  referenceImageUrl: z.string().url().optional(),
  lockIdentity: z.boolean().optional(),
})

export type AvatarGenerateRequest = z.infer<typeof avatarGenerateRequestSchema>

export async function resolveAvatarOrgContext(orgId?: string): Promise<
  | { ok: true; userId: string; orgId: string }
  | { ok: false; response: Response }
> {
  if (orgId) {
    const context = await requireOrgRequestContext({ orgId, permission: 'editProjects' })
    if (!context.ok) return { ok: false, response: context.response }
    return { ok: true, userId: context.context.userId, orgId }
  }

  const userId = await getUserId()
  if (!userId) {
    return {
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id, org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const resolvedOrgId = data?.organization_id ?? data?.org_id
  if (error || !resolvedOrgId) {
    return {
      ok: false,
      response: Response.json({ error: 'No workspace found for avatar generation' }, { status: 400 }),
    }
  }

  const context = await requireOrgRequestContext({ orgId: resolvedOrgId, permission: 'editProjects', userId })
  if (!context.ok) return { ok: false, response: context.response }
  return { ok: true, userId, orgId: resolvedOrgId }
}

export function buildAvatarSpec(input: {
  body: AvatarGenerateRequest
  userId: string
  orgId: string
  assistantId?: string
}): AgentAvatarSpec {
  return {
    assistantId: input.assistantId,
    draftId: input.body.draftId,
    orgId: input.orgId,
    userId: input.userId,
    name: input.body.name,
    role: input.body.role,
    description: input.body.description,
    personalityTraits: input.body.personalityTraits,
    stylePreset: normalizeAvatarStyle(input.body.stylePreset),
    angle: normalizeAvatarAngle(input.body.angle),
    crop: normalizeAvatarCrop(input.body.crop),
    expression: normalizeAvatarExpression(input.body.expression),
    background: normalizeAvatarBackground(input.body.background),
    lighting: normalizeAvatarLighting(input.body.lighting),
    genderPresentation: normalizeAvatarGenderPresentation(input.body.genderPresentation),
    pose: normalizeAvatarPose(input.body.pose),
    referenceAssetId: input.body.referenceAssetId,
    referenceImageUrl: input.body.referenceImageUrl,
    lockIdentity: Boolean(input.body.lockIdentity),
    promptVersion: 'agent-avatar-v1',
  }
}
