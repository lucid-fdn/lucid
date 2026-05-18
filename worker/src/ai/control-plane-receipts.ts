import type { SupabaseClient } from '@supabase/supabase-js'
import type { AIGenerationReceiptPayload } from '@lucid/agent-bridge'
import { normalizeProviderBaseUrl } from './provider-policy.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function inferWorkerProvider(baseUrl?: string | null): string {
  const normalized = normalizeProviderBaseUrl(baseUrl)?.toLowerCase()
  if (!normalized) return 'worker'
  if (normalized.includes('api.openai.com')) return 'openai'
  if (normalized.includes('trustgate') || normalized.includes('lucid')) return 'trustgate'
  return 'worker'
}

export async function emitWorkerAIGenerationReceipt(params: AIGenerationReceiptPayload & {
  supabase?: SupabaseClient
  orgId?: string | null
}): Promise<void> {
  const { supabase, orgId, ...receipt } = params
  if (!supabase) return

  try {
    let userId = receipt.userId && UUID_RE.test(receipt.userId) ? receipt.userId : null
    let resolvedOrgId = orgId ?? null
    let projectId = receipt.projectId ?? null

    if (receipt.agentId) {
      const { data: assistant, error } = await supabase
        .from('ai_assistants')
        .select('id, org_id, project_id, created_by')
        .eq('id', receipt.agentId)
        .maybeSingle()

      if (error) throw error
      if (assistant) {
        userId = assistant.created_by ?? userId
        resolvedOrgId = assistant.org_id ?? resolvedOrgId
        projectId = assistant.project_id ?? projectId
      }
    }

    if (!userId) return

    const totalTokens =
      receipt.usage?.totalTokens ??
      ((receipt.usage?.inputTokens ?? 0) + (receipt.usage?.outputTokens ?? 0) || undefined)

    await supabase.from('ai_generation_events').insert({
      user_id: userId,
      feature: receipt.feature,
      prompt: receipt.prompt,
      success: receipt.success,
      tokens_used: totalTokens,
      metadata: {
        ...receipt.metadata,
        modality: receipt.modality,
        orgId: resolvedOrgId,
        assistantId: receipt.agentId ?? null,
        projectId,
        provider: receipt.provider,
        model: receipt.model,
        usage: receipt.usage,
        error: receipt.error,
        source: 'worker',
        runId: receipt.runId,
        receipt: receipt.receipt ?? null,
      },
    })
  } catch (error) {
    console.warn(
      '[ai-generation] Failed to emit worker receipt:',
      error instanceof Error ? error.message : error,
    )
  }
}
