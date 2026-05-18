import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExtractAndStoreMemories = vi.fn()

vi.mock('../../memory/extractAndStoreMemories.js', () => ({
  extractAndStoreMemories: (...args: unknown[]) => mockExtractAndStoreMemories(...args),
}))

import {
  buildMemoryExtractionIdempotencyKey,
  enqueueMemoryExtractionJob,
  evaluateMemoryExtractionBackpressure,
  processMemoryExtractionJob,
  type MemoryExtractionJob,
} from '../memory-extraction-jobs.js'

describe('memory extraction jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExtractAndStoreMemories.mockResolvedValue({
      skipped: false,
      skipReason: null,
      extractedCount: 2,
      filteredCount: 2,
      newCount: 1,
      storedCount: 1,
      embeddedCount: 1,
      durationMs: 42,
      rawModelOutput: '[{"content":"User prefers concise answers."}]',
      rawModelOutputHash: 'hash-1',
      extractorError: null,
    })
  })

  it('builds deterministic idempotency keys per run/window', () => {
    const first = buildMemoryExtractionIdempotencyKey({
      assistantId: 'assistant-1',
      conversationId: 'conversation-1',
      inboundEventId: 'inbound-1',
      conversationMessageCount: 10,
    })
    const second = buildMemoryExtractionIdempotencyKey({
      assistantId: 'assistant-1',
      conversationId: 'conversation-1',
      inboundEventId: 'inbound-1',
      conversationMessageCount: 10,
    })

    expect(first).toBe(second)
    expect(first).toHaveLength(64)
  })

  it('dedupes noisy channel replays by external message instead of run id', () => {
    const first = buildMemoryExtractionIdempotencyKey({
      assistantId: 'assistant-1',
      conversationId: 'conversation-1',
      inboundEventId: 'inbound-1',
      channelType: 'slack',
      channelId: 'channel-1',
      externalMessageId: 'message-1',
      conversationMessageCount: 10,
    })
    const replayWithDifferentInboundRow = buildMemoryExtractionIdempotencyKey({
      assistantId: 'assistant-1',
      conversationId: 'conversation-1',
      inboundEventId: 'inbound-2',
      channelType: 'slack',
      channelId: 'channel-1',
      externalMessageId: 'message-1',
      conversationMessageCount: 10,
    })

    expect(replayWithDifferentInboundRow).toBe(first)
  })

  it('treats duplicate enqueue as idempotent', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    const from = vi.fn(() => ({ insert }))

    const status = await enqueueMemoryExtractionJob({ from } as never, {
      assistantId: 'assistant-1',
      assistantOrgId: 'org-1',
      conversationId: 'conversation-1',
      inboundEventId: 'inbound-1',
      runId: 'run-1',
      channelType: 'discord',
      channelId: 'channel-1',
      externalMessageId: 'message-1',
      conversationMessageCount: 10,
      encryptionMode: 'NONE',
    })

    expect(status).toBe('duplicate')
    expect(from).toHaveBeenCalledWith('memory_extraction_jobs')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      assistant_id: 'assistant-1',
      conversation_id: 'conversation-1',
      run_id: 'run-1',
    }))
  })

  it('surfaces queue backpressure without increasing worker pressure', () => {
    const decision = evaluateMemoryExtractionBackpressure({
      pending: 260,
      failed: 90,
      claimed: 40,
      deadLetter: 0,
      oldestPendingAgeMs: 35 * 60 * 1000,
      batchSize: 10,
      concurrency: 4,
    })

    expect(decision.status).toBe('throttle')
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'oldest_pending_over_30m',
      'retry_pressure_high',
    ]))
    expect(decision.recommendedBatchSize).toBeLessThan(10)
    expect(decision.recommendedConcurrency).toBeLessThan(4)
  })

  it('reconstructs context without storing plaintext in the job payload', async () => {
    const updates: unknown[] = []
    const makeQuery = (result: unknown) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn().mockResolvedValue(result),
        maybeSingle: vi.fn().mockResolvedValue(result),
      }
      return query
    }

    const from = vi.fn((table: string) => {
      if (table === 'ai_assistants') {
        return makeQuery({
          data: {
            id: 'assistant-1',
            name: 'Lucid',
            memory_enabled: true,
            memory_strategy: 'auto',
            org_id: 'org-1',
          },
          error: null,
        })
      }
      if (table === 'assistant_inbound_events') {
        return makeQuery({
          data: {
            id: 'inbound-1',
            external_user_id: 'user-1',
            external_chat_id: 'chat-1',
            message_text: 'remember that I like concise answers',
            message_data: {},
          },
          error: null,
        })
      }
      if (table === 'assistant_messages') {
        return makeQuery({
          data: [
            { id: 'm2', role: 'assistant', content: 'Noted.', encryption_mode: 'NONE' },
            { id: 'm1', role: 'user', content: 'remember that I like concise answers', encryption_mode: 'NONE' },
          ],
          error: null,
        })
      }
      if (table === 'memory_extraction_jobs') {
        return {
          update: vi.fn((payload: unknown) => {
            updates.push(payload)
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await processMemoryExtractionJob(
      { from } as never,
      { LUCID_API_BASE_URL: 'https://api.example' } as never,
      undefined as never,
      makeJob(),
    )

    expect(mockExtractAndStoreMemories).toHaveBeenCalledWith(expect.objectContaining({
      recentMessages: [
        { role: 'user', content: 'remember that I like concise answers' },
        { role: 'assistant', content: 'Noted.' },
      ],
      provenance: expect.objectContaining({
        sourceUserMessage: 'remember that I like concise answers',
        sourceAssistantResponse: 'Noted.',
        sourceEvidenceHandle: 'memory-job:job-1',
      }),
    }))
    expect(updates).toEqual([expect.objectContaining({
      status: 'completed',
      result_summary: expect.objectContaining({
        rawModelOutputHash: 'hash-1',
        rawModelOutputLength: 45,
      }),
    })])
  })
})

function makeJob(): MemoryExtractionJob {
  return {
    id: 'job-1',
    idempotency_key: 'key-1',
    assistant_id: 'assistant-1',
    org_id: 'org-1',
    conversation_id: 'conversation-1',
    inbound_event_id: 'inbound-1',
    run_id: 'run-1',
    channel_type: 'discord',
    channel_id: 'channel-1',
    external_message_id: 'message-1',
    conversation_message_count: 10,
    encryption_mode: 'NONE',
    retry_count: 0,
    max_retries: 5,
  }
}
