import { describe, expect, it } from 'vitest'

import { createBlankAgentDraft } from './draft'
import {
  addTeamMember,
  convertDraftToAgent,
  convertDraftToTeam,
  getDraftCapabilities,
  getDraftStructure,
  removeTeamMember,
  setDraftCapabilities,
  updateTeamMember,
  updateTeamMemberStructured,
} from './structure'
import type { GenerationDraft } from './schemas'

describe('builder draft structure helpers', () => {
  it('converts a single agent draft into a coordinated team without losing core intent', () => {
    const draft = createBlankAgentDraft({
      prompt: 'Create an assistant that manages support and escalations',
      projectName: 'Support Assistant',
      projectDescription: 'Manage support and escalations',
      systemPrompt: 'Triage support requests and escalate urgent issues.',
    })

    const teamDraft = convertDraftToTeam(draft)

    expect(getDraftStructure(teamDraft)).toBe('team')
    expect(teamDraft.agent).toBeUndefined()
    expect(teamDraft.team?.objective).toContain('Manage support')
    expect(teamDraft.team?.members).toHaveLength(2)
    expect(teamDraft.team?.members.some((member) => member.is_coordinator)).toBe(true)
    expect(teamDraft.team?.edges).toEqual([
      expect.objectContaining({ from: 'Coordinator', to: 'Operator' }),
    ])
  })

  it('converts a team draft back into one agent with aggregated capabilities', () => {
    const teamDraft = convertDraftToTeam(createBlankAgentDraft({
      projectName: 'Research Team',
      projectDescription: 'Research markets',
      systemPrompt: 'Coordinate research.',
    }))
    const withCapabilities = setDraftCapabilities(teamDraft, {
      skills: ['google', 'linear'],
      plugins: ['notion'],
    })

    const agentDraft = convertDraftToAgent(withCapabilities)

    expect(getDraftStructure(agentDraft)).toBe('agent')
    expect(agentDraft.team).toBeUndefined()
    expect(agentDraft.agent?.skills).toEqual(['google', 'linear'])
    expect(agentDraft.agent?.plugins).toEqual(['notion'])
    expect(agentDraft.agent?.system_prompt).toContain('Merged team responsibilities')
  })

  it('sets selected capabilities through one helper for both draft structures', () => {
    const agentDraft = createBlankAgentDraft({
      projectName: 'Daily Assistant',
      systemPrompt: 'Help with daily work.',
    })
    const teamDraft = convertDraftToTeam(agentDraft)

    expect(getDraftCapabilities(setDraftCapabilities(agentDraft, {
      skills: ['google'],
      plugins: ['notion'],
    }))).toEqual({ skills: ['google'], plugins: ['notion'] })

    expect(getDraftCapabilities(setDraftCapabilities(teamDraft, {
      skills: ['google'],
      plugins: ['notion'],
    }))).toEqual({ skills: ['google'], plugins: ['notion'] })
  })

  it('removes stale opposite structure payloads during conversion cleanup', () => {
    const teamDraft = convertDraftToTeam(createBlankAgentDraft({
      projectName: 'Ops Team',
      systemPrompt: 'Coordinate ops.',
    }))
    const staleAgentDraft = {
      ...teamDraft,
      mode: 'blank-agent' as const,
      agent: {
        kind: 'agent' as const,
        system_prompt: 'Operate alone.',
      },
    }

    expect(convertDraftToAgent(staleAgentDraft).team).toBeUndefined()

    const staleTeamDraft = {
      ...teamDraft,
      agent: {
        kind: 'agent' as const,
        system_prompt: 'Stale agent.',
      },
    }
    expect(convertDraftToTeam(staleTeamDraft).agent).toBeUndefined()
  })

  it('adds and removes team members while keeping at least two roles', () => {
    const teamDraft = convertDraftToTeam(createBlankAgentDraft({
      projectName: 'Ops Team',
      systemPrompt: 'Coordinate ops.',
    }))

    const expanded = addTeamMember(teamDraft)
    expect(expanded.team?.members.map((member) => member.role)).toContain('New role')

    const reduced = removeTeamMember(expanded, 'New role')
    expect(reduced.team?.members).toHaveLength(2)

    const unchanged = removeTeamMember(reduced, 'Operator')
    expect(unchanged.team?.members).toHaveLength(2)
  })

  it('keeps structured role fields synced with auto-composed subagent prompts', () => {
    const teamDraft = convertDraftToTeam(createBlankAgentDraft({
      projectName: 'Launch Team',
      projectDescription: 'Launch a product',
      systemPrompt: 'Coordinate launch work.',
    }))

    const updated = updateTeamMemberStructured(teamDraft, 'Operator', (member) => ({
      ...member,
      role: 'QA Reviewer',
      description: 'Review launch assets before publishing.',
      responsibilities: ['Check claims', 'Flag missing approvals'],
    }))

    const reviewer = updated.team?.members.find((member) => member.role === 'QA Reviewer')
    expect(reviewer?.system_prompt_mode).toBe('auto')
    expect(reviewer?.system_prompt).toContain('You are QA Reviewer')
    expect(reviewer?.system_prompt).toContain('Mission:')
    expect(reviewer?.system_prompt).toContain('- Check claims')
    expect(reviewer?.system_prompt).toContain('- Flag missing approvals')

    const manual = updateTeamMember(updated, 'QA Reviewer', (member) => ({
      ...member,
      system_prompt: 'Use this custom prompt.',
      system_prompt_mode: 'manual',
    }))
    const afterStructuredEdit = updateTeamMemberStructured(manual, 'QA Reviewer', (member) => ({
      ...member,
      description: 'Updated mission.',
    }))

    expect(afterStructuredEdit.team?.members.find((member) => member.role === 'QA Reviewer')?.system_prompt)
      .toBe('Use this custom prompt.')
  })

  it('detects template team drafts as teams', () => {
    const draft = {
      version: '1.0',
      mode: 'template',
      project: { name: 'Authority Engine' },
      template: {
        slug: 'authority-engine',
        name: 'Authority Engine',
        kind: 'team',
        params: {},
      },
      team: {
        kind: 'team',
        objective: 'Build authority.',
        members: [
          { role: 'Coordinator', is_coordinator: true, system_prompt: 'Coordinate.' },
          { role: 'Writer', system_prompt: 'Write.' },
        ],
        edges: [{ from: 'Coordinator', to: 'Writer' }],
      },
    } satisfies GenerationDraft

    expect(getDraftStructure(draft)).toBe('team')
  })
})
