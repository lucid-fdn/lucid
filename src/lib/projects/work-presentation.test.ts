import { describe, expect, it } from 'vitest'
import { describeWorkItemBlocker, describeWorkItemEvent, extractRunArtifacts } from './work-presentation'

describe('describeWorkItemEvent', () => {
  it('formats comments and resolutions', () => {
    expect(
      describeWorkItemEvent({
        event_type: 'commented',
        payload: { body: 'Need approval from finance' },
      } as never),
    ).toBe('Need approval from finance')

    expect(
      describeWorkItemEvent({
        event_type: 'resolved',
        payload: { resolution: 'approved', resolution_notes: 'Looks good' },
      } as never),
    ).toBe('approved - Looks good')
  })
})

describe('extractRunArtifacts', () => {
  it('extracts artifact summaries from linked run events', () => {
    const artifacts = extractRunArtifacts([
      {
        id: 'evt-1',
        payload: { tool_name: 'browser', tool_output: 'Collected page contents' },
      } as never,
      {
        id: 'evt-2',
        payload: { message_text: 'Draft sent to customer' },
      } as never,
      {
        id: 'evt-3',
        payload: { receipt_id: 'rcpt_123' },
      } as never,
    ])

    expect(artifacts).toHaveLength(3)
    expect(artifacts[0]).toMatchObject({ title: 'browser', kind: 'tool_output' })
    expect(artifacts[1]).toMatchObject({ title: 'Message', kind: 'message' })
    expect(artifacts[2]).toMatchObject({ title: 'Receipt', kind: 'receipt' })
  })
})

describe('describeWorkItemBlocker', () => {
  it('prefers approval mirror context', () => {
    expect(
      describeWorkItemBlocker(
        {
          status: 'waiting',
          kind: 'pulse_standalone',
          external_mirror: { approval_id: 'approval-1' },
        } as never,
        null,
      ),
    ).toContain('approval gate')
  })

  it('describes blocked downstream DAG work', () => {
    expect(
      describeWorkItemBlocker(
        {
          status: 'open',
          kind: 'nerve_node',
          external_mirror: null,
        } as never,
        { downstreamBlockedCount: 2 } as never,
      ),
    ).toContain('2 downstream nodes remain blocked')
  })
})
