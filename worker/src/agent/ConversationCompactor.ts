/**
 * ConversationCompactor — Phase 2: Context window management
 *
 * Summarizes old messages to reduce context window size while
 * preserving conversation coherence.
 *
 * Strategy:
 *   1. Keep recent N messages untouched
 *   2. Summarize older messages into a single system-level summary
 *   3. Store summary in DB for future use (avoid re-summarization)
 *
 * See docs/OPENCLAW_INTEGRATION_SPEC.md §4.1
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../config.js'
import { enqueueSummaryJob } from '../jobs/summary-jobs.js'

interface Message {
  id?: string
  role: string
  content: string
  created_at?: string
}

interface CompactionResult {
  messages: Message[]
  wasCompacted: boolean
  originalCount: number
  compactedCount: number
}

export class ConversationCompactor {
  private compactionThreshold: number
  private keepRecentCount: number

  constructor(
    private supabase: SupabaseClient,
    private config: Config,
    options?: {
      compactionThreshold?: number  // Compact after this many messages (default: 50)
      keepRecentCount?: number      // Keep this many recent messages (default: 20)
    }
  ) {
    this.compactionThreshold = options?.compactionThreshold ?? 14
    this.keepRecentCount = options?.keepRecentCount ?? 6
  }

  /**
   * Check if conversation needs compaction and compact if so.
   * Returns the optimized message array for LLM context.
   */
  async compactIfNeeded(
    conversationId: string,
    messages: Message[]
  ): Promise<CompactionResult> {
    if (messages.length < this.compactionThreshold) {
      return {
        messages,
        wasCompacted: false,
        originalCount: messages.length,
        compactedCount: messages.length,
      }
    }

    console.log(`[compactor] Conversation ${conversationId} has ${messages.length} messages (threshold: ${this.compactionThreshold}), compacting...`)

    // Check for existing summary
    const existingSummary = await this.loadSummary(conversationId)

    // Split messages: old (to summarize) + recent (to keep)
    const splitIndex = messages.length - this.keepRecentCount
    const oldMessages = messages.slice(0, splitIndex)
    const recentMessages = messages.slice(splitIndex)

    let summary: string

    if (existingSummary && existingSummary.messageCount >= oldMessages.length) {
      // Existing summary covers all old messages — reuse
      summary = existingSummary.content
      console.log(`[compactor] Reusing existing summary (covers ${existingSummary.messageCount} messages)`)
    } else {
      // Generate new summary
      summary = await this.summarize(oldMessages, conversationId)
      await this.storeSummary(conversationId, summary, oldMessages.length)
    }

    // Build compacted message array
    const compactedMessages: Message[] = [
      {
        role: 'system',
        content: `[Conversation Summary — ${oldMessages.length} earlier messages]\n${summary}`,
      },
      ...recentMessages,
    ]

    console.log(`[compactor] Compacted ${messages.length} → ${compactedMessages.length} messages`)

    return {
      messages: compactedMessages,
      wasCompacted: true,
      originalCount: messages.length,
      compactedCount: compactedMessages.length,
    }
  }

  /**
   * Get a summary of older messages + the recent messages to keep.
   * Returns { summary, recentMessages } for injection into agent params.
   * Only generates a summary if message count exceeds threshold.
   */
  async getSummaryAndRecent(
    conversationId: string,
    messages: Message[],
    enqueueContext?: { assistantId: string; orgId: string },
  ): Promise<{ summary: string | undefined; recentMessages: Message[] }> {
    if (messages.length < this.compactionThreshold) {
      return { summary: undefined, recentMessages: messages }
    }

    const splitIndex = messages.length - this.keepRecentCount
    const oldMessages = messages.slice(0, splitIndex)
    const recentMessages = messages.slice(splitIndex)

    // Check for existing summary
    const existingSummary = await this.loadSummary(conversationId)

    if (existingSummary && existingSummary.messageCount >= oldMessages.length) {
      console.log(`[compactor] Reusing existing summary (covers ${existingSummary.messageCount} messages)`)
      return { summary: existingSummary.content, recentMessages }
    }

    // No cached summary — enqueue a durable job for background generation.
    // This request proceeds without a summary; the next one will have it cached.
    if (enqueueContext) {
      const lastMsg = messages[messages.length - 1]
      await enqueueSummaryJob(this.supabase, {
        conversationId,
        assistantId: enqueueContext.assistantId,
        orgId: enqueueContext.orgId,
        messageCount: messages.length,
        lastMessageId: lastMsg?.id,
      })
      console.log(`[compactor] Summary job enqueued for conversation ${conversationId.slice(0, 8)}***`)
    }

    return { summary: undefined, recentMessages }
  }

  /**
   * Generate a summary of old messages using Lucid-L2.
   * Falls back to a simple extraction if LLM call fails.
   */
  private async summarize(messages: Message[], conversationId: string): Promise<string> {
    const transcript = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n')

    // Try LLM summarization via TrustGate chat completions
    try {
      const baseUrl = this.config.LUCID_API_BASE_URL.replace(/\/+$/, '')

      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.LUCID_API_KEY ? { 'Authorization': `Bearer ${this.config.LUCID_API_KEY}` } : {}),
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a conversation summarizer. Summarize the conversation into a concise summary that captures: 1) Key topics discussed 2) Important decisions or conclusions 3) User preferences or context learned 4) Any pending questions or tasks. Keep the summary under 500 words. Focus on information useful for continuing the conversation.',
            },
            {
              role: 'user',
              content: `Summarize this conversation:\n\n${transcript.slice(0, 8000)}`,
            },
          ],
          max_tokens: 800,
          temperature: 0.3,
        }),
      })

      if (response.ok) {
        const data = await response.json() as { choices?: { message?: { content?: string } }[] }
        const content = data.choices?.[0]?.message?.content
        if (content) {
          console.log(`[compactor] LLM summary generated for conversation ${conversationId}`)
          return content
        }
      }
    } catch (err) {
      console.warn(`[compactor] LLM summarization failed, using fallback:`, err)
    }

    // Fallback: extract key points manually
    return this.fallbackSummarize(messages)
  }

  /**
   * Simple fallback summarization without LLM.
   * Extracts first/last messages and key user messages.
   */
  private fallbackSummarize(messages: Message[]): string {
    const userMessages = messages.filter(m => m.role === 'user')
    const assistantMessages = messages.filter(m => m.role === 'assistant')

    const parts: string[] = [
      `[${messages.length} messages summarized]`,
      `User sent ${userMessages.length} messages, assistant replied ${assistantMessages.length} times.`,
    ]

    // Include first user message for context
    if (userMessages.length > 0) {
      parts.push(`First topic: "${userMessages[0].content.slice(0, 200)}"`)
    }

    // Include last few user messages
    const recentUserMsgs = userMessages.slice(-3)
    if (recentUserMsgs.length > 0) {
      parts.push('Recent topics:')
      for (const msg of recentUserMsgs) {
        parts.push(`- "${msg.content.slice(0, 150)}"`)
      }
    }

    return parts.join('\n')
  }

  /**
   * Load existing conversation summary from DB.
   */
  private async loadSummary(
    conversationId: string
  ): Promise<{ content: string; messageCount: number } | null> {
    const { data } = await this.supabase
      .from('assistant_conversation_summaries')
      .select('content, message_count')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data) return null
    return { content: data.content, messageCount: data.message_count }
  }

  /**
   * Store conversation summary in DB.
   */
  private async storeSummary(
    conversationId: string,
    content: string,
    messageCount: number
  ): Promise<void> {
    const { error } = await this.supabase
      .from('assistant_conversation_summaries')
      .upsert(
        {
          conversation_id: conversationId,
          content,
          message_count: messageCount,
        },
        { onConflict: 'conversation_id' }
      )

    if (error) {
      console.warn(`[compactor] Failed to store summary: ${error.message}`)
      // Non-fatal — compaction still works, just won't be cached
    }
  }
}