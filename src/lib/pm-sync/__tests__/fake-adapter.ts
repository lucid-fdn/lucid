/**
 * Fake PM Adapter — Minimal test fixture implementing PmAdapter.
 *
 * Used by dispatcher tests and the contract test harness. Every method is
 * overridable via constructor options so individual tests can simulate
 * failures (bad signature, parse error, etc.) without writing a new class.
 */

import type {
  HumanWorkItemLite,
  PmAdapter,
  PmAdapterContext,
  PmIssuePatch,
  PmIssueRef,
  PmProvider,
  PmResolution,
  PmWebhookEvent,
} from '@contracts/pm-adapter'

export interface FakeAdapterOptions {
  provider?: PmProvider
  signatureOk?: boolean
  signatureThrows?: boolean
  parsed?: PmWebhookEvent | null
  parseThrows?: boolean
  fetchStatusResult?: { externalStatus: string; closed: boolean } | null
}

export function createFakeAdapter(options: FakeAdapterOptions = {}): PmAdapter {
  const provider: PmProvider = options.provider ?? 'linear'
  const created = { count: 0 }
  const updated = { count: 0 }
  const closed = { count: 0 }

  const adapter: PmAdapter = {
    provider,
    async createIssue(wi: HumanWorkItemLite, _ctx: PmAdapterContext) {
      created.count += 1
      const ref: PmIssueRef = {
        provider,
        externalId: `fake-${wi.id}`,
        externalUrl: `https://example.test/fake/${wi.id}`,
        metadata: { source: 'fake' },
      }
      return ref
    },
    async updateIssue(_ref: PmIssueRef, _patch: PmIssuePatch, _ctx: PmAdapterContext) {
      updated.count += 1
    },
    async closeIssue(_ref: PmIssueRef, _resolution: PmResolution, _ctx: PmAdapterContext) {
      closed.count += 1
    },
    async fetchStatus(_ref: PmIssueRef, _ctx: PmAdapterContext) {
      return options.fetchStatusResult ?? { externalStatus: 'open', closed: false }
    },
    verifySignature(_rawBody: string, _headers: Record<string, string>) {
      if (options.signatureThrows) throw new Error('boom')
      return options.signatureOk !== false
    },
    async parseWebhook(_payload: unknown, _headers: Record<string, string>) {
      if (options.parseThrows) throw new Error('parse boom')
      return options.parsed ?? null
    },
  }

  // Attach counters for assertion without extending the interface
  ;(adapter as unknown as { _counters: { created: typeof created; updated: typeof updated; closed: typeof closed } })._counters =
    { created, updated, closed }

  return adapter
}

export function getCounters(adapter: PmAdapter) {
  return (adapter as unknown as { _counters: { created: { count: number }; updated: { count: number }; closed: { count: number } } })._counters
}
