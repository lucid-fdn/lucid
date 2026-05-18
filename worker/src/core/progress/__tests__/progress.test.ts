import { describe, expect, it, vi } from 'vitest'
import { resolveCapabilityProgress } from '../labels.js'
import { mapToolExecutionEventToProgress } from '../tool-events.js'
import { createChannelProgressController } from '../../../channels/progress/controller.js'
import { resolveToolProgressMetadata } from '../tool-capabilities.js'

describe('channel progress mapping', () => {
  it('maps market tools to deterministic user-safe status labels', () => {
    expect(resolveCapabilityProgress({ toolName: 'web3_get_token_price' })).toMatchObject({
      phase: 'fetching',
      label: 'Checking live market data',
      riskLevel: 'read',
    })

    expect(resolveCapabilityProgress({ toolName: 'polymarket_search_markets' })).toMatchObject({
      phase: 'fetching',
      label: 'Reading prediction markets',
      riskLevel: 'read',
    })
  })

  it('maps tool approval events to Trust Shield progress', () => {
    expect(mapToolExecutionEventToProgress({
      type: 'tool_approval_required',
      toolName: 'browser_purchase_submit',
      toolCallId: 'call-1',
    })).toMatchObject({
      phase: 'approval_waiting',
      label: 'Waiting for approval',
      riskLevel: 'high',
    })
  })

  it('prefers centralized tool capability metadata over regex fallback', () => {
    const metadata = resolveToolProgressMetadata('wallet_balance')
    expect(metadata).toMatchObject({
      capability: 'web3.wallet.balance.read',
      label: 'Checking wallet balances',
      riskLevel: 'read',
    })

    expect(mapToolExecutionEventToProgress({
      type: 'tool_started',
      toolName: 'wallet_balance',
      toolCallId: 'call-1',
      payload: metadata,
    })).toMatchObject({
      phase: 'fetching',
      label: 'Checking wallet balances',
      capability: 'web3.wallet.balance.read',
      riskLevel: 'read',
    })
  })
})

describe('channel progress controller', () => {
  it('renders transient status through ChannelOutput without exposing tool payloads', async () => {
    const status = vi.fn().mockResolvedValue(undefined)
    const controller = createChannelProgressController({
      runId: 'run-1',
      output: {
        begin: vi.fn(),
        status,
        append: vi.fn(),
        finalize: vi.fn(),
        error: vi.fn(),
      },
      minIntervalMs: 0,
    })

    controller.emit({
      phase: 'fetching',
      label: 'Checking live market data with a very long detail that should still be safe',
      detail: 'secret_token=abc123 '.repeat(20),
      source: 'tool',
    })

    await vi.waitFor(() => {
      expect(status).toHaveBeenCalledWith('Checking live market data with a very long detail that should still be safe')
    })

    expect(controller.getHistory()[0]?.detail).not.toContain(' '.repeat(2))
    expect(controller.getHistory()[0]?.detail.length).toBeLessThanOrEqual(161)
  })

  it('does not render completed events as chat status', async () => {
    const status = vi.fn().mockResolvedValue(undefined)
    const controller = createChannelProgressController({
      output: {
        begin: vi.fn(),
        status,
        append: vi.fn(),
        finalize: vi.fn(),
        error: vi.fn(),
      },
    })

    controller.complete()

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(status).not.toHaveBeenCalled()
    expect(controller.getHistory()).toHaveLength(1)
    expect(controller.getHistory()[0]?.phase).toBe('completed')
  })
})
