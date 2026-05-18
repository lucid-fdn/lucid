/**
 * Summary Jobs — Durable async conversation summary generation
 *
 * Follows the same outbox/claim pattern as scheduled tasks:
 *   1. Request path enqueues a job (INSERT with dedup)
 *   2. Worker polls and claims jobs (FOR UPDATE SKIP LOCKED)
 *   3. Worker generates summary, stores in assistant_conversation_summaries
 *   4. Job marked completed or retried with exponential backoff
 *
 * Dedup: only one active job per conversation_id (enforced by partial unique index).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../config.js'

interface SummaryJob {
  id: string
  conversation_id: string
  assistant_id: string
  org_id: string
  message_count: number
  last_message_id: string | null
  retry_count: number
  max_retries: number
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

/**
 * Enqueue a summary generation job. Safe to call on every request —
 * the partial unique index deduplicates by conversation_id.
 */
export async function enqueueSummaryJob(
  supabase: SupabaseClient,
  params: {
    conversationId: string
    assistantId: string
    orgId: string
    messageCount: number
    lastMessageId?: string
  },
): Promise<void> {
  const { error } = await supabase
    .from('conversation_summary_jobs')
    .insert({
      conversation_id: params.conversationId,
      assistant_id: params.assistantId,
      org_id: params.orgId,
      message_count: params.messageCount,
      last_message_id: params.lastMessageId ?? null,
    })

  if (error) {
    // 23505 = unique_violation → job already pending/claimed, safe to ignore
    if (error.code === '23505') {
      return
    }
    console.warn(`[summary-jobs] Failed to enqueue:`, error.message)
  }
}

// ---------------------------------------------------------------------------
// Poll & Process
// ---------------------------------------------------------------------------

let polling = false
let failures = 0

export async function pollSummaryJobs(
  supabase: SupabaseClient,
  config: Config,
): Promise<void> {
  if (polling) return
  if (shouldBackoff(failures)) return
  polling = true

  try {
    const { data: jobs, error } = await supabase.rpc('claim_next_summary_job', {
      p_worker_id: config.WORKER_ID,
      p_batch_size: 5,
    })

    if (error) {
      failures++
      console.error(`[summary-jobs] Claim error (failure #${failures}):`, error.message)
      return
    }

    failures = 0

    if (!jobs || jobs.length === 0) return

    console.log(`[summary-jobs] Processing ${jobs.length} jobs`)

    for (const job of jobs as SummaryJob[]) {
      try {
        await processSummaryJob(supabase, config, job)
      } catch (err) {
        console.error(`[summary-jobs] Job ${job.id} failed:`, err instanceof Error ? err.message : err)
      }
    }
  } catch (err) {
    failures++
    console.error(`[summary-jobs] Polling error (failure #${failures}):`, err)
  } finally {
    polling = false
  }
}

async function processSummaryJob(
  supabase: SupabaseClient,
  config: Config,
  job: SummaryJob,
): Promise<void> {
  // 1. Load authoritative messages from DB
  const { data: messages, error: msgError } = await supabase
    .from('assistant_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', job.conversation_id)
    .order('created_at', { ascending: true })
    .limit(50)

  if (msgError || !messages || messages.length === 0) {
    await markJobFailed(supabase, job, msgError?.message ?? 'No messages found')
    return
  }

  // 2. Check if summary is still needed (conversation might have been deleted)
  if (messages.length < 14) {
    await markJobDiscarded(supabase, job, 'Below compaction threshold')
    return
  }

  // 3. Check if a newer summary already exists (race with another worker)
  const { data: existing } = await supabase
    .from('assistant_conversation_summaries')
    .select('message_count')
    .eq('conversation_id', job.conversation_id)
    .maybeSingle()

  if (existing && existing.message_count >= messages.length) {
    await markJobDiscarded(supabase, job, 'Summary already up to date')
    return
  }

  // 4. Generate summary via LLM
  const keepRecent = 6
  const oldMessages = messages.slice(0, messages.length - keepRecent)
  const transcript = oldMessages
    .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
    .join('\n')
    .slice(0, 8000)

  let summary: string

  try {
    const baseUrl = config.LUCID_API_BASE_URL.replace(/\/+$/, '')
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.LUCID_API_KEY ? { Authorization: `Bearer ${config.LUCID_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a conversation summarizer. Summarize the conversation into a concise summary that captures: 1) Key topics discussed 2) Important decisions or conclusions 3) User preferences or context learned 4) Any pending questions or tasks. Keep the summary under 500 words. Focus on information useful for continuing the conversation.',
          },
          {
            role: 'user',
            content: `Summarize this conversation:\n\n${transcript}`,
          },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      throw new Error(`LLM returned ${response.status}`)
    }

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('Empty LLM response')
    }
    summary = content
  } catch (err) {
    await markJobFailed(supabase, job, err instanceof Error ? err.message : String(err))
    return
  }

  // 5. Store summary in DB
  const { error: upsertError } = await supabase
    .from('assistant_conversation_summaries')
    .upsert(
      {
        conversation_id: job.conversation_id,
        content: summary,
        message_count: oldMessages.length,
      },
      { onConflict: 'conversation_id' },
    )

  if (upsertError) {
    await markJobFailed(supabase, job, `Store failed: ${upsertError.message}`)
    return
  }

  // 6. Mark job completed
  await supabase
    .from('conversation_summary_jobs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', job.id)

  console.log(
    `[summary-jobs] ✓ Summary generated for conversation ${job.conversation_id.slice(0, 8)}*** (${oldMessages.length} messages summarized)`,
  )
}

// ---------------------------------------------------------------------------
// Job State Transitions
// ---------------------------------------------------------------------------

async function markJobFailed(
  supabase: SupabaseClient,
  job: SummaryJob,
  errorMsg: string,
): Promise<void> {
  const nextRetry = job.retry_count + 1
  const isDead = nextRetry >= job.max_retries

  await supabase
    .from('conversation_summary_jobs')
    .update({
      status: isDead ? 'dead_letter' : 'failed',
      last_error: errorMsg,
      retry_count: nextRetry,
      claimed_by: null,
      claimed_at: null,
    })
    .eq('id', job.id)

  if (isDead) {
    console.error(
      `[summary-jobs] Job ${job.id} dead-lettered after ${nextRetry} retries: ${errorMsg}`,
    )
  } else {
    console.warn(
      `[summary-jobs] Job ${job.id} failed (retry ${nextRetry}/${job.max_retries}): ${errorMsg}`,
    )
  }
}

async function markJobDiscarded(
  supabase: SupabaseClient,
  job: SummaryJob,
  reason: string,
): Promise<void> {
  await supabase
    .from('conversation_summary_jobs')
    .update({ status: 'discarded', last_error: reason, completed_at: new Date().toISOString() })
    .eq('id', job.id)

  console.log(`[summary-jobs] Job ${job.id} discarded: ${reason}`)
}

// ---------------------------------------------------------------------------
// Backoff (same pattern as scheduled tasks in index.ts)
// ---------------------------------------------------------------------------

function shouldBackoff(failCount: number): boolean {
  if (failCount === 0) return false
  // Exponential backoff: skip 2^failCount cycles, capped at 30
  const skipCycles = Math.min(Math.pow(2, failCount), 30)
  return Math.random() * skipCycles > 1
}
