import { describe, expect, it } from 'vitest'

import { buildScheduleTaskDraftSeed } from './schedule-task-defaults'

describe('buildScheduleTaskDraftSeed', () => {
  it('creates a personal-assistant schedule prompt with concrete output expectations', () => {
    const seed = buildScheduleTaskDraftSeed({
      projectName: 'Personal Assistant',
      projectDescription: 'Helps with email, calendar, reminders, and task organization.',
      skills: ['gmail', 'calendar'],
      channelHints: [
        { channel_type: 'email', required: false },
        { channel_type: 'calendar', required: false },
      ],
    })

    expect(seed.name).toBe('Morning briefing')
    expect(seed.prompt).toContain("Review today's calendar")
    expect(seed.prompt).toContain('urgent email')
    expect(seed.prompt).toContain('recommended next actions')
  })

  it('creates a support triage schedule prompt for support agents', () => {
    const seed = buildScheduleTaskDraftSeed({
      projectName: 'Support Agent',
      projectDescription: 'Handle support tickets and escalations.',
      plugins: ['zendesk'],
    })

    expect(seed.name).toBe('Support triage')
    expect(seed.prompt).toContain('support conversations and tickets')
    expect(seed.prompt).toContain('urgent items')
  })

  it('falls back to a generic but explicit autonomous review prompt', () => {
    const seed = buildScheduleTaskDraftSeed({
      projectName: 'Ops Helper',
    })

    expect(seed.name).toBe('Scheduled review')
    expect(seed.prompt).toContain('configured instructions and connected tools')
    expect(seed.prompt).toContain('what changed')
    expect(seed.prompt).toContain('recommended next actions')
  })
})
