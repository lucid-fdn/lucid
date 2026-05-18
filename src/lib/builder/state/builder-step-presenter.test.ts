import { describe, expect, it } from 'vitest'
import type { BuilderDecisionCard } from '@/lib/ai/project-generation/schemas'
import {
  buildBuilderAppliedStepMessage,
  buildBuilderSkipTransitionMessage,
  describeNextBuilderStep,
  getBuilderConnectAppsMessage,
  getBuilderReadyMessage,
} from './builder-step-presenter'

const toolsCard: BuilderDecisionCard = {
  kind: 'capability_multi_select',
  title: 'Choose tools',
  description: 'Choose tools',
  options: [],
}

const tasksCard: BuilderDecisionCard = {
  kind: 'configuration_panel',
  panel: 'tasks',
  title: 'Add schedule',
  description: 'Add a schedule',
  action_label: 'Set schedule',
  apply_action_label: 'Add suggested schedule',
  suggested_schedule: {
    cron: '0 8 * * 1-5',
    prompt: 'Prepare the day.',
    description: 'Morning plan',
    optional: true,
  },
}

const channelsCard: BuilderDecisionCard = {
  kind: 'configuration_panel',
  panel: 'channels',
  title: 'Set channels',
  description: 'Set channels',
  action_label: 'Set channels',
}

describe('builder-step-presenter', () => {
  it('has one canonical ready message', () => {
    expect(getBuilderReadyMessage()).toBe('The setup is ready. You can create it now, or keep refining anything in the panel.')
  })

  it('has one canonical connect-apps step message before ready', () => {
    expect(getBuilderConnectAppsMessage()).toBe('Selected apps need setup before create. Connect missing apps or choose which existing account this agent should use.')
  })

  it('bridges skipped steps to the next visible decision', () => {
    expect(buildBuilderSkipTransitionMessage(toolsCard, tasksCard)).toContain('I left tools unchanged for now.')
    expect(buildBuilderSkipTransitionMessage(toolsCard, tasksCard)).toContain('Add a schedule below')
  })

  it('uses the canonical ready message when no next step exists', () => {
    expect(buildBuilderSkipTransitionMessage(channelsCard, undefined)).toBe(getBuilderReadyMessage())
    expect(buildBuilderAppliedStepMessage('suggested-schedule', undefined)).toBe(getBuilderReadyMessage())
  })

  it('describes channel decisions without opening modals implicitly', () => {
    expect(describeNextBuilderStep(channelsCard)).toContain('Choose where this agent should work next')
  })
})
