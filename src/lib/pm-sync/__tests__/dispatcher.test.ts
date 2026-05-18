/**
 * Dispatcher — Unit tests for handleInboundEvent pipeline.
 *
 * Covers every `ignored` branch (disabled / signature / dedupe / parse /
 * echo / no_match) and the happy path that returns `apply`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { PmWebhookEvent } from '@contracts/pm-adapter'

vi.mock('server-only', () => ({}))

const mockMarkEventSeen = vi.fn()
const mockFindWorkItem = vi.fn()

vi.mock('@/lib/db/pm-external-refs', () => ({
  findWorkItemByExternalRef: (...args: unknown[]) => mockFindWorkItem(...args),
}))

vi.mock('../dedupe', () => ({
  markEventSeen: (...args: unknown[]) => mockMarkEventSeen(...args),
  hasSeenEvent: vi.fn(),
}))

vi.mock('../telemetry', () => ({
  recordWebhookReceived: vi.fn(),
  recordWebhookRejected: vi.fn(),
  recordWebhookProcessed: vi.fn(),
  recordWebhookEcho: vi.fn(),
  reportSyncError: vi.fn(),
}))

const { handleInboundEvent } = await import('../dispatcher')
const { registerAdapter, __resetRegistryForTests } = await import('../registry')
const { createFakeAdapter } = await import('./fake-adapter')

const VALID_EVENT: PmWebhookEvent = {
  provider: 'linear',
  type: 'issue.updated',
  externalId: 'LIN-123',
  isEcho: false,
  patch: { title: 'Renamed' },
}

const BASE_INPUT = {
  provider: 'linear' as const,
  rawBody: '{"data":{"id":"evt-1"}}',
  headers: { 'x-sig': 'abc' },
  rawEventId: 'evt-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetRegistryForTests()
  mockMarkEventSeen.mockResolvedValue(true)
  mockFindWorkItem.mockResolvedValue({
    id: 'ref-1',
    work_item_id: 'wi-1',
    org_id: 'org-1',
    provider: 'linear',
    external_id: 'LIN-123',
    external_url: 'https://linear.app/foo/LIN-123',
    metadata: {},
    created_at: '2026-04-08T00:00:00Z',
    last_synced_at: '2026-04-08T00:00:00Z',
    last_sync_error: null,
    sync_attempts: 0,
  })
})

describe('handleInboundEvent', () => {
  it('returns ignored:disabled when no adapter is registered', async () => {
    const result = await handleInboundEvent(BASE_INPUT)
    expect(result).toEqual({ outcome: 'ignored', reason: 'disabled' })
  })

  it('returns ignored:signature when verifySignature returns false', async () => {
    registerAdapter(createFakeAdapter({ signatureOk: false, parsed: VALID_EVENT }))
    const result = await handleInboundEvent(BASE_INPUT)
    expect(result).toEqual({ outcome: 'ignored', reason: 'signature' })
  })

  it('returns ignored:signature when verifySignature throws', async () => {
    registerAdapter(createFakeAdapter({ signatureThrows: true, parsed: VALID_EVENT }))
    const result = await handleInboundEvent(BASE_INPUT)
    expect(result).toEqual({ outcome: 'ignored', reason: 'signature' })
  })

  it('returns ignored:dedupe when markEventSeen returns false (duplicate)', async () => {
    registerAdapter(createFakeAdapter({ parsed: VALID_EVENT }))
    mockMarkEventSeen.mockResolvedValue(false)
    const result = await handleInboundEvent(BASE_INPUT)
    expect(result).toEqual({ outcome: 'ignored', reason: 'dedupe' })
  })

  it('skips dedupe when rawEventId is null', async () => {
    registerAdapter(createFakeAdapter({ parsed: VALID_EVENT }))
    const result = await handleInboundEvent({ ...BASE_INPUT, rawEventId: null })
    expect(mockMarkEventSeen).not.toHaveBeenCalled()
    expect(result.outcome).toBe('apply')
  })

  it('returns ignored:parse when JSON.parse fails', async () => {
    registerAdapter(createFakeAdapter({ parsed: VALID_EVENT }))
    const result = await handleInboundEvent({ ...BASE_INPUT, rawBody: 'not-json{' })
    expect(result).toEqual({ outcome: 'ignored', reason: 'parse' })
  })

  it('returns ignored:parse when adapter.parseWebhook throws', async () => {
    registerAdapter(createFakeAdapter({ parseThrows: true }))
    const result = await handleInboundEvent(BASE_INPUT)
    expect(result).toEqual({ outcome: 'ignored', reason: 'parse' })
  })

  it('returns ignored:parse when adapter.parseWebhook returns null (silent drop)', async () => {
    registerAdapter(createFakeAdapter({ parsed: null }))
    const result = await handleInboundEvent(BASE_INPUT)
    expect(result).toEqual({ outcome: 'ignored', reason: 'parse' })
  })

  it('returns ignored:echo when event.isEcho is true', async () => {
    registerAdapter(
      createFakeAdapter({ parsed: { ...VALID_EVENT, isEcho: true } }),
    )
    const result = await handleInboundEvent(BASE_INPUT)
    expect(result).toEqual({ outcome: 'ignored', reason: 'echo' })
  })

  it('returns ignored:no_match when no mirror row is found', async () => {
    registerAdapter(createFakeAdapter({ parsed: VALID_EVENT }))
    mockFindWorkItem.mockResolvedValue(null)
    const result = await handleInboundEvent(BASE_INPUT)
    expect(result).toEqual({ outcome: 'ignored', reason: 'no_match' })
  })

  it('returns apply with event + ref on happy path', async () => {
    registerAdapter(createFakeAdapter({ parsed: VALID_EVENT }))
    const result = await handleInboundEvent(BASE_INPUT)
    expect(result.outcome).toBe('apply')
    if (result.outcome === 'apply') {
      expect(result.provider).toBe('linear')
      expect(result.event).toEqual(VALID_EVENT)
      expect(result.ref.work_item_id).toBe('wi-1')
    }
    expect(mockFindWorkItem).toHaveBeenCalledWith('linear', 'LIN-123')
  })
})
