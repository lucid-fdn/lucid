/**
 * WebChannelOutput — Delivers AI response tokens to the browser via Supabase Realtime Broadcast.
 *
 * This is the web channel's equivalent of Telegram's message-edit streaming.
 * Instead of editing platform messages, it broadcasts token deltas over WebSocket.
 *
 * The AgentLoop calls append() with individual LLM token deltas (true streaming).
 * Each delta is broadcast immediately — no buffering, no chunking.
 * This gives ChatGPT-like UX: tokens appear in the browser as the LLM generates them.
 *
 * Lifecycle: begin() → append()* → finalize() OR error()
 *
 * Channel name: `agent-chat:{conversationId}`
 * Event: `stream` with payload.type = 'begin' | 'delta' | 'done' | 'error'
 *
 * Uses httpSend() (REST) for publishing — the worker only publishes, never subscribes.
 * The API route (Vercel) subscribes via WebSocket. This avoids WebSocket connection
 * overhead on Railway and eliminates the REST fallback warning.
 */

import type { ChannelOutput, MessageRef } from './ChannelOutput.js'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'

export class WebChannelOutput implements ChannelOutput {
  private channel: RealtimeChannel
  private active = false

  constructor(conversationId: string, supabase: SupabaseClient) {
    this.channel = supabase.channel(`agent-chat:${conversationId}`, {
      config: { broadcast: { self: false } },
    })
  }

  async begin(): Promise<MessageRef | null> {
    this.active = true
    await this.httpBroadcast({ type: 'begin' })
    return null
  }

  async append(delta: string): Promise<void> {
    if (!this.active || !delta) return
    await this.httpBroadcast({ type: 'delta', delta })
  }

  async status(label: string): Promise<void> {
    if (!this.active || !label.trim()) return
    await this.httpBroadcast({ type: 'status', label: label.trim() })
  }

  async finalize(fullText: string): Promise<void> {
    if (!this.active) return
    await this.httpBroadcast({ type: 'done', text: fullText })
    this.active = false
  }

  async error(err: Error): Promise<void> {
    if (!this.active) return
    console.error(`[web-output] Error during streaming:`, err.message)
    await this.httpBroadcast({
      type: 'error',
      message: 'An error occurred while processing your request. Please try again.',
    })
    this.active = false
  }

  private async httpBroadcast(payload: Record<string, unknown>): Promise<void> {
    // httpSend exists at runtime but is missing from @supabase/supabase-js type declarations
    const result = await (this.channel as unknown as { httpSend(event: string, payload: Record<string, unknown>): Promise<{ success: boolean }> }).httpSend('stream', payload)
    if (!result.success) {
      console.error(`[web-output] Broadcast failed:`, result)
    }
  }
}
