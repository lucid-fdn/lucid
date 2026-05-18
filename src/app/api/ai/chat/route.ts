/**
 * AI Chat Streaming Endpoint
 *
 * Streaming chat using Vercel AI SDK, agent worker routing, and BYOK provider resolution.
 * - POST: Stream chat completions
 * - GET:  Load conversation messages by conversationId
 *
 * Routing:
 *   - assistantId present: proxy to worker with assistant runtime context and
 *     policy_config.trustgate.inference_mode.
 *   - no assistantId: legacy simple chat path resolves org BYOK provider first,
 *     then falls back to the Lucid/TrustGate-compatible provider.
 */

import { streamText, convertToModelMessages, type UIMessage } from 'ai'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerAuth } from '@/lib/auth/server-utils'
import { checkRateLimit, RateLimitPresets } from '@/lib/auth/rate-limit'
import { getBYOKModel } from '@/lib/ai/byok-provider'
import { getLucidModel } from '@/lib/ai/providers'
import { pruneForModel } from '@/lib/ai/context'
import {
  createMessage,
  trackAIUsage,
} from '@/lib/ai/service'
import { searchDocumentChunks } from '@/lib/ai/service'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { ErrorService } from '@/lib/errors/error-service'
import { incrementUsage } from '@/lib/plans'
import { evaluateEntitlement, guardEntitlement } from '@/lib/entitlements'
import { DEFAULT_MODEL_ID } from '@/lib/ai/models'
import { isUserOrgMember, getAssistant } from '@/lib/db'
import { getConversationWithMessages } from '@/lib/ai/service'
import { supabase } from '@/lib/db/client'
import { transformPluginRows } from '@/lib/ai/worker-proxy'
import { runAIGeneration } from '@/lib/ai/control-plane/run-generation'
import { textGenerationAdapter } from '@/lib/ai/control-plane/adapters/text'
import { agentRunGenerationAdapter } from '@/lib/ai/control-plane/adapters/agent-run'
import { writeAIGenerationEvent } from '@/lib/ai/control-plane/events'
import { applyAuthoritativeConnectionIds, getAuthoritativeAssistantConnections } from '@/lib/oauth/authoritative-connections'

export const dynamic = 'force-dynamic'

// ============================================================================
// REQUEST SCHEMA
// ============================================================================

const chatRequestSchema = z.object({
  messages: z.array(z.any()),
  model: z.string().default(DEFAULT_MODEL_ID),
  orgId: z.string(),
  conversationId: z.string().nullable().optional(),
  systemPrompt: z.string().nullable().optional(),
  enableRAG: z.boolean().default(false),
  projectId: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(256).max(32000).default(4096),
  // Optional: when set, route through the agent worker (AgentLoop + tools + plugins)
  // instead of the simple streamText() path.
  assistantId: z.string().nullable().optional(),
})

// ============================================================================
// GET /api/ai/chat?conversationId=xxx
// Load conversation messages
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const auth = await getServerAuth()
    if (!auth.isAuthenticated || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 },
      )
    }

    // Validate conversation ownership (RPC checks user_id match)
    const result = await getConversationWithMessages(conversationId, auth.userId)
    if (!result) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const messages = result.messages

    return NextResponse.json({ messages })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/ai/chat', method: 'GET' },
      tags: { layer: 'api', route: 'ai-chat' },
    })

    return NextResponse.json(
      { error: 'Failed to load messages' },
      { status: 500 },
    )
  }
}

// ============================================================================
// POST /api/ai/chat
// Stream chat completions with BYOK support
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate (use getServerAuth, not requireServerAuth — redirect() breaks API routes)
    const auth = await getServerAuth()
    if (!auth.isAuthenticated || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { userId } = auth

    // 1b. Rate limit — most expensive endpoint (LLM inference)
    const rlKey = `ai-chat:${userId}`
    const rl = await checkRateLimit(rlKey, RateLimitPresets.STANDARD)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before sending another message.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
      )
    }

    // 2. Parse & validate request body
    const body = await request.json()
    const {
      messages,
      model: modelId,
      orgId,
      conversationId,
      systemPrompt,
      enableRAG,
      projectId,
      temperature,
      maxTokens,
      assistantId,
    } = chatRequestSchema.parse(body)

    // 2b. Agent mode: when assistantId is provided, proxy to the worker
    // for full AgentLoop (tools, memory, multi-step) instead of simple streamText().
    // Parallelize org membership check + assistant + plugin fetch for lower latency.
    if (assistantId) {
      const [isMember, assistant, { data: pluginRows }, authoritativeConnections] = await Promise.all([
        isUserOrgMember(userId, orgId),
        getAssistant(assistantId),
        supabase.rpc('get_assistant_active_plugins', { p_assistant_id: assistantId }),
        getAuthoritativeAssistantConnections(assistantId).catch(() => ({})),
      ])

      if (!isMember) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (!assistant) {
        return NextResponse.json({ error: 'Assistant not found' }, { status: 404 })
      }
      if (assistant.org_id !== orgId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const normalizedPluginRows = applyAuthoritativeConnectionIds(pluginRows || [], authoritativeConnections)

      // Entitlement check (structured deny payload for frontend rendering)
      const entitlement = await evaluateEntitlement({ orgId, action: 'ai_query' })
      const guard = guardEntitlement(entitlement, { orgId, route: '/api/ai/chat' })
      if (guard) return guard

      // Charging model: "accepted request consumes quota" — increment fires before
      // the LLM call. Idempotency key derived from the last user message ID
      // (client-generated, stable across transport retries).
      const lastMsgId = messages[messages.length - 1]?.id
      incrementUsage(orgId, 'ai_queries_monthly', 1, `chat:${orgId}:${lastMsgId || conversationId || crypto.randomUUID()}`).catch(() => {})

      // Extract the last user message text
      const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
      const message = typeof lastUserMsg?.content === 'string'
        ? lastUserMsg.content
        : Array.isArray(lastUserMsg?.parts)
          ? (lastUserMsg.parts as Array<{ type: string; text?: string }>)
              .filter((p: { type: string; text?: string }) => p.type === 'text' && p.text)
              .map((p: { text?: string }) => p.text!)
              .join('')
          : ''

      if (!message) {
        return NextResponse.json({ error: 'Message is required' }, { status: 400 })
      }

      const runId = crypto.randomUUID()
      const assistantConfig = {
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
      }

      const { output } = await runAIGeneration({
        context: { userId, orgId, assistantId, projectId },
        feature: 'agent-run',
        modality: 'agent-run',
        model: assistantConfig.lucid_model ?? undefined,
        prompt: message,
        input: {
          assistantId,
          assistantConfig,
          plugins: transformPluginRows(normalizedPluginRows),
          message,
          userId,
          conversationId: conversationId || crypto.randomUUID(),
          runId,
          runtimeId: (assistant as Record<string, unknown>).runtime_id as string | null,
        },
        metadata: {
          route: '/api/ai/chat',
          mode: 'assistant',
          pluginCount: normalizedPluginRows?.length ?? 0,
        },
        adapter: agentRunGenerationAdapter,
      })
      return output.response
    }

    // 2c. Non-agent path: validate org membership (prevents cross-org BYOK key access)
    const isMember = await isUserOrgMember(userId, orgId)
    if (!isMember) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Entitlement check (structured deny payload for frontend rendering)
    const entitlement = await evaluateEntitlement({ orgId, action: 'ai_query' })
    const nonAgentGuard = guardEntitlement(entitlement, { orgId, route: '/api/ai/chat' })
    if (nonAgentGuard) return nonAgentGuard

    // Charging model: "accepted request consumes quota" — increment fires before
    // the LLM call. Idempotency key derived from the last user message ID
    // (client-generated, stable across transport retries).
    const lastMsgId = messages[messages.length - 1]?.id
    incrementUsage(orgId, 'ai_queries_monthly', 1, `chat:${orgId}:${lastMsgId || conversationId || crypto.randomUUID()}`).catch(() => {})

    // 3. Resolve model — BYOK if available, Lucid fallback
    let resolvedModel

    try {
      const byokResult = await getBYOKModel(orgId, modelId)
      resolvedModel = byokResult.model

    } catch {
      // BYOK resolution failed — fall back to Lucid
      resolvedModel = getLucidModel(modelId)
    }

    // 4. Build system messages
    const systemMessages: { role: 'system'; content: string }[] = []

    if (systemPrompt) {
      systemMessages.push({ role: 'system', content: systemPrompt })
    }

    // 5. RAG context injection
    if (enableRAG && projectId) {
      const lastUserMessage = [...messages]
        .reverse()
        .find((m: { role: string }) => m.role === 'user')
      const query =
        typeof lastUserMessage?.content === 'string'
          ? lastUserMessage.content
          : ''

      if (query) {
        try {
          const { embedding } = await generateEmbedding(query)
          const chunks = await searchDocumentChunks(projectId, embedding, 5, 0.7)

          if (chunks.length > 0) {
            const context = chunks
              .map(
                (c: { content: string; similarity: number }, i: number) =>
                  `[${i + 1}] ${c.content}`,
              )
              .join('\n\n')

            systemMessages.push({
              role: 'system',
              content: `Use the following knowledge base context to help answer the user's question. If the context doesn't contain relevant information, say so.\n\n---\n${context}\n---`,
            })
          }
        } catch (ragError) {
          // RAG failure is non-fatal — continue without context
          ErrorService.captureException(ragError as Error, {
            severity: 'warning',
            context: { userId, projectId, operation: 'rag-search' },
            tags: { layer: 'api', route: 'ai-chat' },
          })
        }
      }
    }

    // 6. Convert user/assistant messages for AI SDK (system messages passed separately)
    const modelMessages = await convertToModelMessages(messages as UIMessage[])

    // 7. Prune messages to fit context window
    const prunedMessages = await pruneForModel(modelMessages, modelId)

    // 8. Build system prompt from all system messages
    const fullSystemPrompt = systemMessages.map(m => m.content).join('\n\n') || undefined

    // 9. Stream response
    const streamFactory = () => streamText({
      model: resolvedModel,
      system: fullSystemPrompt,
      messages: prunedMessages,
      temperature,
      maxOutputTokens: maxTokens,
      async onFinish({ text, usage }) {
        // Save messages to DB if conversation exists
        if (conversationId) {
          try {
            // Save user message
            const lastUserMsg = [...messages]
              .reverse()
              .find((m: { role: string }) => m.role === 'user')
            if (lastUserMsg) {
              const userContent =
                typeof lastUserMsg.content === 'string'
                  ? lastUserMsg.content
                  : JSON.stringify(lastUserMsg.content)

              await createMessage({
                conversation_id: conversationId,
                role: 'user',
                content: userContent,
              })
            }

            // Save assistant response
            if (text) {
              await createMessage({
                conversation_id: conversationId,
                role: 'assistant',
                content: text,
              })
            }
          } catch (err) {
            ErrorService.captureException(err as Error, {
              severity: 'warning',
              context: { conversationId, operation: 'save-messages' },
              tags: { layer: 'api', route: 'ai-chat' },
            })
          }
        }

        // Track usage
        try {
          const inputTokens = usage.inputTokens ?? 0
          const outputTokens = usage.outputTokens ?? 0
          if (inputTokens + outputTokens > 0) {
            await trackAIUsage(orgId, inputTokens, outputTokens)
          }
          await writeAIGenerationEvent({
            context: { userId, orgId, projectId },
            feature: 'ai-chat',
            modality: 'text',
            prompt: fullSystemPrompt ? `${fullSystemPrompt}\n\n${messages[messages.length - 1]?.content ?? ''}` : String(messages[messages.length - 1]?.content ?? ''),
            success: true,
            model: modelId,
            usage: {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
            },
            metadata: {
              route: '/api/ai/chat',
              mode: 'non-agent',
              enableRAG,
              projectId,
              temperature,
              maxTokens,
            },
          })
        } catch (err) {
          ErrorService.captureException(err as Error, {
            severity: 'warning',
            context: { orgId, operation: 'track-usage-or-record-generation' },
            tags: { layer: 'api', route: 'ai-chat' },
          })
        }
      },
    })

    const { output } = await runAIGeneration({
      context: { userId, orgId, projectId },
      feature: 'ai-chat',
      modality: 'text',
      model: modelId,
      prompt: String(messages[messages.length - 1]?.content ?? ''),
      input: {
        execute: streamFactory,
        model: modelId,
        metadata: {
          route: '/api/ai/chat',
          mode: 'non-agent',
          enableRAG,
          projectId,
        },
      },
      recordSuccessEvent: false,
      adapter: textGenerationAdapter,
    })

    const result = output.result

    return result.toUIMessageStreamResponse({
      headers: {
        'x-lucid-route': 'vercel',
        'x-lucid-route-reason': 'no-assistant',
      },
    })
  } catch (error) {
    ErrorService.captureException(error as Error, {
      severity: 'error',
      context: { endpoint: '/api/ai/chat', method: 'POST' },
      tags: { layer: 'api', route: 'ai-chat' },
    })

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 },
      )
    }

    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 },
    )
  }
}
