import { describe, expect, it } from 'vitest'

import {
  applyUnsupportedChannelNotes,
  detectUnsupportedChannelRequests,
} from './unsupported-channel-requests'
import type { GenerationDraft } from './schemas'

const baseDraft: GenerationDraft = {
  version: '1.0',
  mode: 'blank-agent',
  project: {
    name: 'Personal Assistant',
    description: 'Helps with daily work.',
  },
  agent: {
    kind: 'agent',
    system_prompt: 'Help the user manage tasks across supported tools.',
    channel_hints: [
      {
        channel_type: 'slack',
        required: false,
        setup_note: 'Optional Slack surface.',
      },
    ],
  },
}

describe('unsupported channel requests', () => {
  it.each([
    'create an agent that will perform all my tasks and answer dm on X',
    'reply to Twitter DMs for me',
    'monitor direct messages on instagram',
    'answer LinkedIn messages',
    'triage messages through a future network',
  ])('detects unsupported message surfaces dynamically: "%s"', (prompt) => {
    const requests = detectUnsupportedChannelRequests(prompt)

    expect(requests.length).toBeGreaterThan(0)
    expect(requests[0]?.warning).toMatch(/Unsupported channel:/)
  })

  it.each([
    'reply to Slack messages',
    'monitor messages on Discord',
    'answer DMs on Telegram',
    'handle messages in Microsoft Teams',
  ])('does not warn for supported channels: "%s"', (prompt) => {
    expect(detectUnsupportedChannelRequests(prompt)).toEqual([])
  })

  it('does not warn when a requested surface is available in capabilities', () => {
    const requests = detectUnsupportedChannelRequests('answer DMs on ExampleCRM', {
      plugins: [
        {
          slug: 'examplecrm',
          name: 'ExampleCRM',
          description: 'ExampleCRM inbox and direct message automation.',
        },
      ],
    })

    expect(requests).toEqual([])
  })

  it('adds warnings and system guardrails without inventing channel hints', () => {
    const result = applyUnsupportedChannelNotes(
      baseDraft,
      'create an agent that will perform all my tasks and answer dm on X',
    )

    expect(result.warnings).toEqual([
      expect.stringContaining('X is not available as a built-in Lucid channel or selected capability yet'),
    ])
    expect(result.draft.agent?.system_prompt).toContain('Channel limitation: X')
    expect(result.draft.agent?.channel_hints).toEqual(baseDraft.agent?.channel_hints)
  })

  it('does not duplicate guardrails when applied twice', () => {
    const first = applyUnsupportedChannelNotes(baseDraft, 'answer Twitter DMs')
    const second = applyUnsupportedChannelNotes(first.draft, 'answer Twitter DMs')
    const prompt = second.draft.agent?.system_prompt ?? ''

    expect(prompt.match(/Channel limitation: Twitter/g)).toHaveLength(1)
    expect(second.warnings).toHaveLength(1)
  })
})
