import { describe, expect, it } from 'vitest'
import type { TemplateCatalogEntry } from '@contracts/template'
import {
  agentBuilderFlowReducer,
  createAgentBuilderFlowInitialState,
} from '@/components/agent-builder/flow/reducer'
import { resolveAgentBuilderInitialStartView } from '@/components/agent-builder/flow/use-agent-builder-start-state'
import type { AgentBuilderFlowConfig } from '@/components/agent-builder/flow/types'

const baseConfig: AgentBuilderFlowConfig = {
  mode: 'agent',
  workspaceId: 'org-1',
  workspaceSlug: 'acme',
  targetProjectId: 'project-1',
  targetProjectSlug: 'ops',
  catalogTemplates: [],
  availableUnifiedSkills: [],
}

describe('agentBuilderFlowReducer', () => {
  it('moves from start to chat review when a prompt is submitted', () => {
    const state = createAgentBuilderFlowInitialState(baseConfig, 'life-1')
    const next = agentBuilderFlowReducer(state, {
      type: 'PROMPT_SUBMITTED',
      prompt: 'create a daily assistant',
    })

    expect(next.step).toBe('chat_review')
    expect(next.submittedPrompt).toBe('create a daily assistant')
  })

  it('opens grouped app connection when unresolved requirements exist', () => {
    const state = createAgentBuilderFlowInitialState(baseConfig, 'life-1')
    const next = agentBuilderFlowReducer(state, {
      type: 'CONNECTION_REQUIREMENTS_RESOLVED',
      requirements: [
        { slug: 'google', providerId: 'google', label: 'Google' },
      ],
    })

    expect(next.step).toBe('connect_apps')
    expect(next.connectionStateByProvider.google?.status).toBe('needs_connection')
  })

  it('keeps app connection status on completion and allows ready state', () => {
    const state = createAgentBuilderFlowInitialState(baseConfig, 'life-1')
    const withRequirement = agentBuilderFlowReducer(state, {
      type: 'CONNECTION_REQUIREMENTS_RESOLVED',
      requirements: [{ slug: 'google', providerId: 'google', label: 'Google' }],
    })
    const connected = agentBuilderFlowReducer(withRequirement, {
      type: 'CONNECTION_COMPLETED',
      providerId: 'google',
      bindingId: 'binding-1',
    })
    const ready = agentBuilderFlowReducer(connected, { type: 'READY' })

    expect(connected.connectionStateByProvider.google).toEqual({
      status: 'connected',
      bindingId: 'binding-1',
    })
    expect(ready.step).toBe('done')
  })

  it('tracks deploy progress through created state', () => {
    const state = createAgentBuilderFlowInitialState(baseConfig, 'life-1')
    const started = agentBuilderFlowReducer(state, {
      type: 'DEPLOY_STARTED',
      label: 'Daily Assistant',
    })
    const creating = agentBuilderFlowReducer(started, {
      type: 'DEPLOY_PROGRESS',
      phase: 'creating',
    })
    const created = agentBuilderFlowReducer(creating, {
      type: 'DEPLOY_CREATED',
      result: { projectSlug: 'ops', agentId: 'agent-1', crewId: null, assistantIds: ['agent-1'], raw: {} },
    })

    expect(started.step).toBe('deploy')
    expect(creating.deployState.phase).toBe('creating')
    expect(created.step).toBe('done')
    expect(created.deployState.result?.agentId).toBe('agent-1')
  })

  it('stores selected template without requiring the shell to own step state', () => {
    const state = createAgentBuilderFlowInitialState(baseConfig, 'life-1')
    const template = { slug: 'daily-assistant', name: 'Daily Assistant' } as TemplateCatalogEntry
    const next = agentBuilderFlowReducer(state, {
      type: 'TEMPLATE_SELECTED',
      templateSlug: template.slug,
    })

    expect(next.step).toBe('chat_review')
    expect(next.selectedTemplateSlug).toBe('daily-assistant')
  })

  it('reset returns to a clean start state with a new lifecycle id', () => {
    const state = createAgentBuilderFlowInitialState({ ...baseConfig, initialPrompt: 'hello' }, 'life-1')
    const next = agentBuilderFlowReducer(state, { type: 'RESET', lifecycleId: 'life-2' })

    expect(next.lifecycleId).toBe('life-2')
    expect(next.step).toBe('start')
    expect(next.prompt).toBe('')
    expect(next.submittedPrompt).toBeNull()
  })
})

describe('resolveAgentBuilderInitialStartView', () => {
  it('resolves route-backed start view priority', () => {
    expect(resolveAgentBuilderInitialStartView({ initialTemplateSlug: 'x', initialBlank: true })).toBe('template')
    expect(resolveAgentBuilderInitialStartView({ initialBlank: true })).toBe('blank')
    expect(resolveAgentBuilderInitialStartView({ initialUpload: true })).toBe('upload')
    expect(resolveAgentBuilderInitialStartView({ initialDescribe: true })).toBe('describe')
    expect(resolveAgentBuilderInitialStartView({})).toBe('browse')
  })
})
