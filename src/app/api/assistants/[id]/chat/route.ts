/**
 * Agent Test Chat API
 *
 * Industry-standard pattern: API route handles auth, then proxies to the
 * worker's streaming endpoint. The worker runs the full agent pipeline
 * (tools, memory, multi-step) and streams tokens back as AI SDK Data Stream Protocol.
 *
 * Flow: Browser (useChat) → API route (auth + proxy) → Worker /stream → AgentLoop → LLM
 *                         ← AI SDK Data Stream Protocol piped back ←
 *
 * - POST: Send message → proxy to worker → stream AI SDK protocol response
 * - GET:  Load conversation messages (init + history)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserId } from '@/lib/auth/server-utils'
import { checkRateLimit, RateLimitPresets } from '@/lib/auth/rate-limit'
import {
  getAssistant,
  isUserOrgMember,
  ensureWebChannel,
  getWebConversation,
  getAssistantConversationMessages,
} from '@/lib/db'
import { supabase } from '@/lib/db/client'
import { ErrorService } from '@/lib/errors/error-service'
import { incrementUsage } from '@/lib/plans'
import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements'
import { proxyToWorkerStream, transformPluginRows } from '@/lib/ai/worker-proxy'
import { applyAuthoritativeConnectionIds, getAuthoritativeAssistantConnections } from '@/lib/oauth/authoritative-connections'
import { allowsE2EMockResponses, allowsPreviewE2ERateLimitBypass } from '@/lib/env/e2e'

export const dynamic = 'force-dynamic'

export const maxDuration = 120

// Org membership cache (60s TTL). Survives across warm invocations
// on the same Vercel instance. Permission check, so keep TTL short.
const membershipCache = new Map<string, number>()
const MEMBERSHIP_TTL_MS = 60_000

async function cachedIsUserOrgMember(userId: string, orgId: string): Promise<boolean> {
  const key = `${userId}:${orgId}`
  const expiresAt = membershipCache.get(key)
  if (expiresAt && expiresAt > Date.now()) return true

  const isMember = await isUserOrgMember(userId, orgId)
  if (isMember) {
    membershipCache.set(key, Date.now() + MEMBERSHIP_TTL_MS)
  } else {
    membershipCache.delete(key)
  }
  return isMember
}

// ============================================================================
// GET /api/assistants/[id]/chat
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: assistantId } = await params
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const isMember = await cachedIsUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const conversationId = searchParams.get('conversationId')

    if (conversationId) {
      const { data: convCheck } = await supabase
        .from('assistant_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('assistant_id', assistantId)
        .eq('external_user_id', userId)
        .maybeSingle()

      if (!convCheck) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }

      const messages = await getAssistantConversationMessages(conversationId)
      return NextResponse.json({ conversationId, messages })
    }

    // Init: find existing web conversation
    const channel = await ensureWebChannel(assistantId)
    const conversation = await getWebConversation(channel.id, userId)

    if (conversation) {
      const messages = await getAssistantConversationMessages(conversation.id)
      return NextResponse.json({ conversationId: conversation.id, messages })
    }

    return NextResponse.json({ conversationId: null, messages: [] })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/chat', method: 'GET' },
      tags: { layer: 'api', route: 'assistant-chat' },
    })
    return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 })
  }
}

// ============================================================================
// POST /api/assistants/[id]/chat
// ============================================================================

/**
 * Extract plain text from a useChat UIMessage.
 * Handles both AI SDK v6 parts format and legacy string content.
 */
function extractTextFromMessage(msg: Record<string, unknown>): string | null {
  // AI SDK v6: { parts: [{ type: 'text', text: '...' }, ...] }
  if (Array.isArray(msg.parts)) {
    const texts = (msg.parts as Array<{ type: string; text?: string }>)
      .filter((p) => p.type === 'text' && p.text)
      .map((p) => p.text!)
    if (texts.length > 0) return texts.join('')
  }
  // Legacy: { content: '...' }
  if (typeof msg.content === 'string') return msg.content
  return null
}

/** Extract image attachments from AI SDK v6 message parts (data URLs → base64). */
function extractImagesFromMessage(msg: Record<string, unknown>): Array<{ data: string; mimeType: string }> {
  if (!Array.isArray(msg.parts)) return []
  return (msg.parts as Array<{ type: string; url?: string; mediaType?: string }>)
    .filter((p) => p.type === 'file' && p.url?.startsWith('data:') && p.mediaType?.startsWith('image/'))
    .map((p) => ({
      data: p.url!.split(',')[1],
      mimeType: p.mediaType!,
    }))
}

function createE2EMockChatResponse(params: {
  assistantId: string
  runtimeId: string | null
  runId: string
}): NextResponse {
  const textId = crypto.randomUUID()
  const isDedicated = Boolean(params.runtimeId)
  const stream = [
    `data: ${JSON.stringify({ type: 'text-start', id: textId })}\n\n`,
    `data: ${JSON.stringify({ type: 'text-delta', id: textId, delta: 'OK' })}\n\n`,
    `data: ${JSON.stringify({ type: 'text-end', id: textId })}\n\n`,
    'data: [DONE]\n\n',
  ].join('')

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'x-lucid-route': isDedicated ? 'dedicated' : 'shared',
      'x-lucid-route-reason': isDedicated ? 'dedicated-runtime' : 'shared-worker',
      'x-lucid-assistant-id': params.assistantId,
      'x-lucid-run-id': params.runId,
    },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Parallel: auth + body parsing (no dependencies)
    const [userId, body, { id: assistantId }] = await Promise.all([
      getUserId(),
      request.json(),
      params,
    ])

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit — most expensive endpoint (LLM inference)
    if (!allowsPreviewE2ERateLimitBypass()) {
      const rlKey = `assistant-chat:${userId}`
      const rl = await checkRateLimit(rlKey, RateLimitPresets.STANDARD)
      if (!rl.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please wait before sending another message.' },
          { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
        )
      }
    }

    // Parallel: assistant lookup + web channel + active plugins (all read-only)
    // Nango integrations are returned by get_assistant_active_plugins as
    // kind='integration', transport='nango' with connection_id from LEFT JOIN.
    const [assistant, channel, pluginResult, authoritativeConnections] = await Promise.all([
      getAssistant(assistantId),
      ensureWebChannel(assistantId),
      supabase.rpc('get_assistant_active_plugins', { p_assistant_id: assistantId }).then(r => r, () => ({ data: null, error: null })),
      getAuthoritativeAssistantConnections(assistantId).catch(() => ({})),
    ])
    const pluginRows = applyAuthoritativeConnectionIds(pluginResult?.data ?? [], authoritativeConnections)

    if (!assistant) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Auth gate: membership must pass BEFORE any writes (conversation creation)
    const isMember = await cachedIsUserOrgMember(userId, assistant.org_id)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Entitlement check (structured deny payload for frontend rendering)
    const entitlement = await evaluateEntitlement({ orgId: assistant.org_id, action: 'ai_query' })
    const entitlementGuard = guardEntitlement(entitlement, { orgId: assistant.org_id, route: '/api/assistants/[id]/chat' })
    if (entitlementGuard) return entitlementGuard

    // Charging model: "accepted request consumes quota" — increment fires before
    // the LLM call. Idempotency key derived from the last user message ID
    // (client-generated, stable across transport retries).
    const msgs = body.messages as Array<Record<string, unknown>> | undefined
    const lastMsgId = Array.isArray(msgs) ? msgs[msgs.length - 1]?.id : undefined
    incrementUsage(assistant.org_id, 'ai_queries_monthly', 1, `asst-chat:${assistant.org_id}:${lastMsgId || crypto.randomUUID()}`).catch(() => {})

    const { data: conversation, error: convError } = await supabase.rpc(
      'get_or_create_conversation',
      {
        p_assistant_id: assistantId,
        p_channel_id: channel.id,
        p_external_user_id: userId,
        p_external_chat_id: userId,
      },
    )

    if (convError || !conversation) {
      console.error('[chat POST] get_or_create_conversation failed:', convError?.message, convError?.details, convError?.hint, 'channel:', channel?.id)
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
    }

    // Extract the last user message text
    const messages = body.messages as Array<Record<string, unknown>> | undefined
    let message: string | null = null
    let images: Array<{ data: string; mimeType: string }> = []
    if (Array.isArray(messages)) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
      if (lastUserMsg) {
        message = extractTextFromMessage(lastUserMsg)
        images = extractImagesFromMessage(lastUserMsg)
      }
    }
    if (!message && typeof body.message === 'string') {
      message = (body.message as string).trim()
    }

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const conversationId = conversation.id
    const runId = crypto.randomUUID()
    const runtimeId = (assistant as Record<string, unknown>).runtime_id as string | null

    if (allowsE2EMockResponses() && request.headers.get('x-lucid-e2e-mock-chat') === '1') {
      return createE2EMockChatResponse({
        assistantId,
        runtimeId,
        runId,
      })
    }

    // Proxy to worker's streaming endpoint — routes to dedicated runtime if available
    return proxyToWorkerStream({
      assistantId,
      assistantConfig: {
        id: assistant.id,
        name: assistant.name,
        engine: (assistant as Record<string, unknown>).engine as 'openclaw' | 'hermes' | null | undefined,
        runtime_flavor: ((assistant as Record<string, unknown>).runtime_flavor as 'shared' | 'c1_managed' | 'c2a_autonomous' | null | undefined) ?? null,
        system_prompt: assistant.system_prompt,
        lucid_model: assistant.lucid_model,
        temperature: assistant.temperature,
        max_tokens: assistant.max_tokens,
        memory_enabled: assistant.memory_enabled,
        memory_window_size: assistant.memory_window_size,
        org_id: assistant.org_id,
        policy_config: (assistant as Record<string, unknown>).policy_config ?? null,
        updated_at: assistant.updated_at,
        wallet_enabled: Boolean((assistant as Record<string, unknown>).wallet_enabled),
        agent_wallets: ((assistant as Record<string, unknown>).agent_wallets as Array<{ chain_type: string; address: string; privy_wallet_id: string; status: string }>) ?? [],
      },
      plugins: transformPluginRows(pluginRows),
      message,
      userId,
      conversationId,
      runId,
      runtimeId,
      images: images.length > 0 ? images : undefined,
      signal: request.signal,
    })
  } catch (error) {
    const err = error as Error
    console.error('[chat POST] Error:', err.message, err.cause ? `Cause: ${(err.cause as Error).message}` : '')
    ErrorService.captureException(err, {
      severity: 'error',
      context: { endpoint: '/api/assistants/[id]/chat', method: 'POST' },
      tags: { layer: 'api', route: 'assistant-chat' },
    })
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
