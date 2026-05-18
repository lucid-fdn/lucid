import 'server-only'

import { supabase } from '@/lib/db/client'
import { uploadBuffer } from '@/lib/uploads/storage'
import type { ImageGenerationResult } from '@/lib/ai/images/types'
import type { AgentAvatarAsset, AgentAvatarSpec } from './types'

type AgentAvatarAssetRow = {
  id: string
  public_url: string
  provider: string
  model: string
  prompt_version: AgentAvatarAsset['promptVersion']
  style_preset: AgentAvatarAsset['stylePreset']
  angle: AgentAvatarAsset['angle']
  crop: AgentAvatarAsset['crop']
  expression: AgentAvatarAsset['expression']
  background: AgentAvatarAsset['background']
  lighting: AgentAvatarAsset['lighting']
  width: number
  height: number
  mime_type: string
  metadata: Record<string, unknown> | null
}

function mapAvatarAssetRow(row: AgentAvatarAssetRow): AgentAvatarAsset {
  return {
    id: row.id,
    url: row.public_url,
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    stylePreset: row.style_preset,
    angle: row.angle,
    crop: row.crop,
    expression: row.expression,
    background: row.background,
    lighting: row.lighting,
    width: row.width,
    height: row.height,
    mimeType: row.mime_type,
    metadata: row.metadata ?? {},
    genderPresentation: (row.metadata?.genderPresentation as AgentAvatarAsset['genderPresentation']) ?? undefined,
    pose: (row.metadata?.pose as AgentAvatarAsset['pose']) ?? undefined,
  }
}

function extensionFromMimeType(mimeType: string): 'png' | 'webp' | 'jpg' {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg'
  return 'webp'
}

function dimensionsFromSpec(_result: ImageGenerationResult): { width: number; height: number } {
  // Current avatar generation requests square output. Persist explicit dimensions
  // so callers don't need to inspect binary image metadata on read.
  return { width: 1024, height: 1024 }
}

export async function storeAgentAvatarAsset(input: {
  spec: AgentAvatarSpec
  result: ImageGenerationResult
  prompt: string
  promptHash: string
  generationEventId?: string | null
}): Promise<AgentAvatarAsset> {
  const assetId = crypto.randomUUID()
  const extension = extensionFromMimeType(input.result.mimeType)
  const storagePath = input.spec.assistantId
    ? `agents/${input.spec.orgId}/${input.spec.assistantId}/${assetId}.${extension}`
    : `agents/${input.spec.orgId}/drafts/${input.spec.draftId ?? assetId}/${assetId}.${extension}`

  const publicUrl = await uploadBuffer(
    Buffer.from(input.result.imageBytes),
    'avatars',
    storagePath,
    input.result.mimeType,
  )
  const dimensions = dimensionsFromSpec(input.result)

  const { data, error } = await supabase
    .from('agent_avatar_assets')
    .insert({
      id: assetId,
      org_id: input.spec.orgId,
      assistant_id: input.spec.assistantId ?? null,
      created_by: input.spec.userId,
      storage_bucket: 'avatars',
      storage_path: storagePath,
      public_url: publicUrl,
      provider: input.result.provider,
      model: input.result.model,
      prompt_version: input.spec.promptVersion,
      prompt_hash: input.promptHash,
      style_preset: input.spec.stylePreset,
      angle: input.spec.angle,
      crop: input.spec.crop,
      expression: input.spec.expression,
      background: input.spec.background,
      lighting: input.spec.lighting,
      reference_asset_id: input.spec.referenceAssetId ?? null,
      generation_event_id: input.generationEventId ?? null,
      width: dimensions.width,
      height: dimensions.height,
      mime_type: input.result.mimeType,
      status: 'ready',
      is_current: false,
      metadata: {
        prompt: input.prompt,
        draftId: input.spec.draftId,
        role: input.spec.role,
        description: input.spec.description,
        genderPresentation: input.spec.genderPresentation,
        pose: input.spec.pose,
        lockIdentity: input.spec.lockIdentity,
        revisedPrompt: input.result.revisedPrompt,
        usage: input.result.usage,
        receipt: input.result.receipt,
      },
    })
    .select('id, public_url, provider, model, prompt_version, style_preset, angle, crop, expression, background, lighting, width, height, mime_type, metadata')
    .single()

  if (error) {
    throw error
  }

  if (input.spec.assistantId) {
    await supabase
      .from('agent_avatar_assets')
      .update({ is_current: false })
      .eq('assistant_id', input.spec.assistantId)
      .eq('is_current', true)

    const { error: currentError } = await supabase
      .from('agent_avatar_assets')
      .update({ is_current: true })
      .eq('id', data.id)

    if (currentError) throw currentError
  }

  return mapAvatarAssetRow(data as AgentAvatarAssetRow)
}

export async function storeAgentAvatarPartialPreview(input: {
  spec: AgentAvatarSpec
  jobId: string
  partialImageIndex: number
  b64Json: string
  mimeType: string
}): Promise<{ url: string; storagePath: string }> {
  const extension = extensionFromMimeType(input.mimeType)
  const storagePath = input.spec.assistantId
    ? `agents/${input.spec.orgId}/${input.spec.assistantId}/partials/${input.jobId}-${input.partialImageIndex}.${extension}`
    : `agents/${input.spec.orgId}/drafts/${input.spec.draftId ?? input.jobId}/partials/${input.jobId}-${input.partialImageIndex}.${extension}`

  const publicUrl = await uploadBuffer(
    Buffer.from(input.b64Json, 'base64'),
    'avatars',
    storagePath,
    input.mimeType,
  )

  return { url: publicUrl, storagePath }
}

export async function getCurrentAgentAvatarAsset(assistantId: string): Promise<AgentAvatarAsset | null> {
  const { data, error } = await supabase
    .from('agent_avatar_assets')
    .select('id, public_url, provider, model, prompt_version, style_preset, angle, crop, expression, background, lighting, width, height, mime_type, metadata')
    .eq('assistant_id', assistantId)
    .eq('is_current', true)
    .eq('status', 'ready')
    .maybeSingle()

  if (error) throw error
  return data ? mapAvatarAssetRow(data as AgentAvatarAssetRow) : null
}

export async function getAgentAvatarAssetForOrg(input: {
  assetId: string
  orgId: string
  assistantId?: string
}): Promise<AgentAvatarAsset | null> {
  let query = supabase
    .from('agent_avatar_assets')
    .select('id, public_url, provider, model, prompt_version, style_preset, angle, crop, expression, background, lighting, width, height, mime_type, metadata')
    .eq('id', input.assetId)
    .eq('org_id', input.orgId)
    .eq('status', 'ready')

  if (input.assistantId) {
    query = query.eq('assistant_id', input.assistantId)
  }

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data ? mapAvatarAssetRow(data as AgentAvatarAssetRow) : null
}

export async function markAgentAvatarAssetCurrent(input: {
  assetId: string
  assistantId: string
  orgId: string
}): Promise<AgentAvatarAsset> {
  const asset = await getAgentAvatarAssetForOrg(input)
  if (!asset) {
    throw new Error('Avatar asset not found')
  }

  await supabase
    .from('agent_avatar_assets')
    .update({ is_current: false })
    .eq('assistant_id', input.assistantId)
    .eq('is_current', true)

  const { error } = await supabase
    .from('agent_avatar_assets')
    .update({ is_current: true })
    .eq('id', input.assetId)
    .eq('assistant_id', input.assistantId)
    .eq('org_id', input.orgId)

  if (error) throw error

  await supabase
    .from('launched_agents')
    .update({ avatar_url: asset.url })
    .eq('assistant_id', input.assistantId)
    .eq('org_id', input.orgId)

  return asset
}
