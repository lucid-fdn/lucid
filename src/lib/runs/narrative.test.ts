import { describe, expect, it } from 'vitest'
import {
  formatNarrativeDuration,
  getNarrativeDetailSections,
  getNarrativeMetrics,
  type RunNarrativeItem,
} from './narrative'

describe('run narrative helpers', () => {
  it('formats duration into compact ledger units', () => {
    expect(formatNarrativeDuration(900)).toBe('900ms')
    expect(formatNarrativeDuration(12_000)).toBe('12s')
    expect(formatNarrativeDuration(125_000)).toBe('2m 5s')
  })

  it('builds grouped detail sections instead of raw json', () => {
    const item: RunNarrativeItem = {
      id: 'step-1',
      title: 'Run tool',
      timestamp: '2026-04-21T10:00:00.000Z',
      status: 'failed',
      errorMessage: 'Provider timed out',
      details: {
        tool_name: 'notion.search',
        command: 'search --query roadmap',
        stdout: '2 pages matched',
        stderr: 'slow response',
        response: 'Page title: Paperclip roadmap',
      },
    }

    expect(getNarrativeDetailSections(item)).toEqual([
      expect.objectContaining({ label: 'Error', tone: 'error', content: 'Provider timed out' }),
      expect.objectContaining({ label: 'Tool', content: 'notion.search' }),
      expect.objectContaining({ label: 'Output', content: 'Page title: Paperclip roadmap' }),
      expect.objectContaining({ label: 'Stdout', tone: 'muted', content: '2 pages matched' }),
      expect.objectContaining({ label: 'Stderr', tone: 'error', content: 'slow response' }),
      expect.objectContaining({ label: 'Command', tone: 'muted', content: 'search --query roadmap' }),
    ])
  })

  it('builds compact metrics for the ledger header', () => {
    const metrics = getNarrativeMetrics({
      id: 'step-2',
      title: 'Run tool',
      timestamp: '2026-04-21T10:00:00.000Z',
      durationMs: 18_000,
      tokensUsed: 1200,
      costUsd: 0.045,
    })

    expect(metrics).toEqual(['18s', '1,200 tokens', '$0.0450'])
  })
})
