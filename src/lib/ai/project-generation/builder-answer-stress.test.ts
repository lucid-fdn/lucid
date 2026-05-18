import { describe, expect, it } from 'vitest'

import type { UnifiedSkillItem } from '@contracts/unified-skill'

import { buildProjectBuilderMetaReply } from './chat'
import type { GenerationDraft } from './schemas'
import {
  classifyBuilderTurn,
  shouldUseDeterministicBuilderTurnClassification,
  type BuilderQuestionTopic,
  type BuilderTurnType,
} from './turn-routing'

const draft: GenerationDraft = {
  version: '1.0',
  mode: 'blank-agent',
  project: {
    name: 'Personal Assistant',
    description: 'Helps with planning, email, notes, and tasks.',
  },
  agent: {
    kind: 'agent',
    system_prompt: 'Help the user manage their day.',
    skills: ['bear-notes'],
    plugins: ['google-workspace'],
    channel_hints: [
      { channel_type: 'slack', required: true, setup_note: 'Use Slack for team messages.' },
    ],
    default_schedules: [
      {
        cron: '0 8 * * 1-5',
        prompt: 'Prepare the weekday plan.',
        description: 'Weekday planning',
        optional: false,
      },
    ],
  },
  runtime: {
    mode: 'shared',
  },
}

const skills: UnifiedSkillItem[] = [
  {
    id: 'google-workspace',
    slug: 'google-workspace',
    name: 'Google Workspace',
    description: 'Calendar and Gmail access',
    category: 'productivity',
    item_type: 'plugin',
    section: 'installed',
    installed: true,
    is_active: true,
    installation_id: null,
    activation_id: null,
    tools: null,
    enabled_tools: null,
    tool_count: 0,
    can_act: true,
    always_on: false,
    removable: true,
    connection_status: 'setup_required',
    auth_provider: 'google',
    connection_id: null,
    health_status: null,
    health_message: null,
    expires_at: null,
    content_chars: null,
    version: '1',
    author: null,
    source: 'catalog',
    verified: true,
  },
]

const answerOnlyCases: Array<{
  prompt: string
  type: BuilderTurnType
  topic: BuilderQuestionTopic
  mustContain: string[]
  mustNotContain?: string[]
}> = [
  {
    prompt: 'what engines are available?',
    type: 'product_question',
    topic: 'engine',
    mustContain: ['OpenClaw', 'Hermes'],
    mustNotContain: ['bear-notes', 'I\'m shaping'],
  },
  {
    prompt: 'is gpt-4o-mini the engine?',
    type: 'product_question',
    topic: 'engine',
    mustContain: ['not the language model'],
    mustNotContain: ['Right now it includes'],
  },
  {
    prompt: 'what are runtimes?',
    type: 'product_question',
    topic: 'runtime',
    mustContain: ['Shared', 'Dedicated', 'Bring your own'],
    mustNotContain: ['bear-notes'],
  },
  {
    prompt: 'explain channels',
    type: 'product_question',
    topic: 'channels',
    mustContain: ['Slack', 'Discord', 'Telegram'],
  },
  {
    prompt: 'what are skills and integrations?',
    type: 'product_question',
    topic: 'capabilities',
    mustContain: ['skills', 'plugins', 'grouped step'],
  },
  {
    prompt: 'how do templates work?',
    type: 'product_question',
    topic: 'template',
    mustContain: ['prebuilt starting points'],
  },
  {
    prompt: 'what is Lucid?',
    type: 'product_question',
    topic: 'lucid',
    mustContain: ['agent-building platform'],
  },
  {
    prompt: 'what happens after I create the agent?',
    type: 'product_question',
    topic: 'workflow',
    mustContain: ['create the agent', 'test or deploy'],
  },
  {
    prompt: 'who founded the company?',
    type: 'product_question',
    topic: 'company',
    mustContain: ['official Lucid'],
    mustNotContain: ['founded by'],
  },
  {
    prompt: 'what are you doing?',
    type: 'builder_status_question',
    topic: 'status',
    mustContain: ['Personal Assistant', 'bear-notes'],
  },
  {
    prompt: 'what tools did you add?',
    type: 'builder_status_question',
    topic: 'status',
    mustContain: ['bear-notes', 'Google Workspace'],
  },
  {
    prompt: 'where will it run?',
    type: 'builder_status_question',
    topic: 'status',
    mustContain: ['Personal Assistant'],
  },
  {
    prompt: 'does it have a schedule?',
    type: 'builder_status_question',
    topic: 'status',
    mustContain: ['recurring schedule configured'],
  },
  {
    prompt: "what's missing before we create?",
    type: 'builder_status_question',
    topic: 'status',
    mustContain: ['connect Google Workspace'],
  },
]

const mutationCases = [
  'add Slack',
  'please remove the schedule',
  'can you add Notion?',
  'could you switch the engine to Hermes?',
  'rename it to Daily Operator',
  'use the support template',
  'connect Google Workspace',
  'make the tone more formal',
  'set channel to Discord',
  'configure a weekday schedule',
]

const localActionCases = [
  'skip',
  'skip this',
  'skip this for now',
  'Skip this for now.',
]

const clarificationCases = [
  'focus on calendar planning',
  'optimize for communication',
  'keep this as a single agent',
  'convert this into a coordinated team',
]

const mutationVerbs = [
  'added',
  'updated',
  'changed',
  'created',
  'renamed',
  'removed',
  'connected',
  'switched',
]

const forbiddenMutationClaimPattern = new RegExp(`\\b(I\\s+)?(${mutationVerbs.join('|')})\\b`, 'i')

const productQuestionMatrix: Array<{
  topic: BuilderQuestionTopic
  nouns: string[]
  expectedType: BuilderTurnType
  expectedAnswer: RegExp
}> = [
  {
    topic: 'engine',
    nouns: ['engines', 'OpenClaw', 'Hermes', 'execution engine', 'model vs engine'],
    expectedType: 'product_question',
    expectedAnswer: /OpenClaw|Hermes|not the language model/i,
  },
  {
    topic: 'runtime',
    nouns: ['runtimes', 'Shared runtime', 'Dedicated runtime', 'Bring your own runtime', 'deployment worker'],
    expectedType: 'product_question',
    expectedAnswer: /Shared|Dedicated|Bring your own/i,
  },
  {
    topic: 'channels',
    nouns: ['channels', 'Slack channel', 'Telegram channel', 'Teams channel', 'web chat channel'],
    expectedType: 'product_question',
    expectedAnswer: /Slack|Discord|Telegram|WhatsApp|Teams|Lucid web chat/i,
  },
  {
    topic: 'capabilities',
    nouns: ['skills', 'tools', 'integrations', 'connected apps', 'OAuth apps'],
    expectedType: 'product_question',
    expectedAnswer: /skills|plugins|tool connections|grouped step/i,
  },
  {
    topic: 'template',
    nouns: ['templates', 'official templates', 'community templates', 'suggested template', 'base template'],
    expectedType: 'product_question',
    expectedAnswer: /prebuilt starting points|template match|blank setup/i,
  },
  {
    topic: 'lucid',
    nouns: ['Lucid', 'Lucid platform', 'Lucid AI', 'this platform', 'agent platform'],
    expectedType: 'product_question',
    expectedAnswer: /agent-building platform|agents|tools|channels|runtimes/i,
  },
  {
    topic: 'company',
    nouns: ['the company', 'Lucid pricing', 'billing', 'legal terms', 'security posture'],
    expectedType: 'product_question',
    expectedAnswer: /official Lucid|source of truth|pricing|legal|private company/i,
  },
  {
    topic: 'workflow',
    nouns: ['builder flow', 'creation flow', 'setup flow', 'connect required apps', 'test session'],
    expectedType: 'product_question',
    expectedAnswer: /draft|connect required apps|review|create|test|deploy/i,
  },
]

const productQuestionFrames = [
  'what are {noun}?',
  'explain {noun}',
  'describe {noun}',
  'how do {noun} work?',
  'can I use {noun} later?',
  'should I configure {noun} now?',
]

const currentDraftQuestionFrames = [
  'what are you doing?',
  'what did you add?',
  'what tools did you add?',
  'which tools are selected?',
  'which channels did you pick?',
  'where will it run?',
  'does it have a schedule?',
  'what is missing before we create?',
  'are we ready to create?',
  'what can it do right now?',
]

const explicitMutationFrames = [
  'create an agent that can {target}',
  'build an assistant to {target}',
  'add {target}',
  'please add {target}',
  'can you add {target}?',
  'could you switch {target}?',
  'remove {target}',
  'set {target}',
  'configure {target}',
  'connect {target}',
  'use {target}',
]

const mutationTargets = [
  'Slack',
  'Google',
  'Notion',
  'Linear',
  'perform all my tasks and answer DMs on X',
  'triage tasks and reply to Twitter DMs',
  'the schedule',
  'the channel',
  'the engine',
  'the runtime',
  'the template',
  'the tone',
]

const exploratoryFrames = [
  'can I add {target} later?',
  'should we add {target}?',
  'what if we add {target}?',
  'what happens if we connect {target}?',
]

const diverseProductQuestionFrames = [
  'Quick question: what are {noun}?',
  'please explain {noun}',
  'pls explain {noun}',
  'help me understand {noun}',
  'I want to understand {noun}',
  'just explain {noun}, do not change anything',
  'do not change anything, what are {noun}?',
  'ONLY DESCRIBE {noun}',
]

const diverseCurrentDraftQuestions = [
  'quick question: what did you include for this agent?',
  'please tell me, what is configured in the current draft?',
  'do not change anything, what tools are selected?',
  'just answer: why did you choose Slack?',
  'what can this agent do now??',
  'tell me what is missing before creating it',
  'without changing setup, where does it work?',
  'only describe the current setup',
]

const answerOnlyBoundaryPrompts = [
  'do not change anything, can you add Slack later?',
  'without changing setup, explain adding Google',
  'just explain whether we should connect Notion',
  'only answer this: should we switch the engine?',
  'no need to configure it, what happens if we add Telegram?',
]

const implicitCreationPrompts = [
  'daily assistant',
  'daily asisitant',
  'personal asistant',
  'email assistant',
  'calendar assistant',
  'task agent',
  'support bot',
  'research copilot',
  'sales operator',
  'assistant for email',
  'planning assistant',
  'reminders agent',
]

const implicitCreationQuestionBoundaries = [
  'what is a daily assistant?',
  'what is a daily asisitant?',
  'explain personal assistant',
  'describe support bot',
  'can I use a daily assistant later?',
  'should I create an assistant?',
  'what happens after I create the agent?',
]

function fillFrame(frame: string, value: string): string {
  return frame.replace('{noun}', value).replace('{target}', value)
}

describe('agent builder answer stress pack', () => {
  it.each(answerOnlyCases)('answers without mutation for "$prompt"', (testCase) => {
    const classification = classifyBuilderTurn({ prompt: testCase.prompt, draft })
    expect(classification.type).toBe(testCase.type)
    expect(classification.topic).toBe(testCase.topic)

    const answer = buildProjectBuilderMetaReply({
      prompt: testCase.prompt,
      draft,
      classification,
      availableUnifiedSkills: skills,
    })

    for (const expected of testCase.mustContain) {
      expect(answer).toContain(expected)
    }

    for (const forbidden of testCase.mustNotContain ?? []) {
      expect(answer).not.toContain(forbidden)
    }

    expect(answer).not.toMatch(forbiddenMutationClaimPattern)
  })

  it.each(mutationCases)('routes explicit setup change to mutation path: "%s"', (prompt) => {
    const classification = classifyBuilderTurn({ prompt, draft })

    expect(classification.type).toBe('config_change')
  })

  it.each(localActionCases)('routes local UI action without builder mutation: "%s"', (prompt) => {
    const classification = classifyBuilderTurn({ prompt, draft })
    const answer = buildProjectBuilderMetaReply({ prompt, draft, classification })

    expect(classification.type).toBe('local_ui_action')
    expect(answer).toBe('I left the current setup unchanged.')
  })

  it.each(clarificationCases)('routes guided clarification answer correctly: "%s"', (prompt) => {
    const classification = classifyBuilderTurn({ prompt, draft })

    expect(classification.type).toBe('clarification_answer')
  })

  it('keeps a ready draft answer concise and non-blocking', () => {
    const readyDraft: GenerationDraft = {
      ...draft,
      agent: {
        ...draft.agent!,
        plugins: [],
      },
    }

    const answer = buildProjectBuilderMetaReply({
      prompt: 'are we ready to create?',
      draft: readyDraft,
      classification: classifyBuilderTurn({ prompt: 'are we ready to create?', draft: readyDraft }),
      availableUnifiedSkills: skills,
    })

    expect(answer).toContain('ready to create now')
    expect(answer).not.toContain('connect Google Workspace')
    expect(answer).not.toMatch(forbiddenMutationClaimPattern)
  })

  it('passes a deterministic combinatorial product-question fuzz matrix', () => {
    const cases = productQuestionMatrix.flatMap((group) => (
      group.nouns.flatMap((noun) => (
        productQuestionFrames.map((frame) => ({
          prompt: fillFrame(frame, noun),
          ...group,
        }))
      ))
    ))

    expect(cases).toHaveLength(240)

    for (const testCase of cases) {
      const classification = classifyBuilderTurn({ prompt: testCase.prompt, draft })
      expect(classification.type, testCase.prompt).toBe(testCase.expectedType)
      expect(classification.topic, testCase.prompt).toBe(testCase.topic)

      const answer = buildProjectBuilderMetaReply({
        prompt: testCase.prompt,
        draft,
        classification,
        availableUnifiedSkills: skills,
      })

      expect(answer, testCase.prompt).toMatch(testCase.expectedAnswer)
      expect(answer, testCase.prompt).not.toMatch(forbiddenMutationClaimPattern)
    }
  })

  it('passes a deterministic combinatorial current-draft question fuzz matrix', () => {
    const prefixes = ['', 'please tell me, ', 'quick question: ']
    const suffixes = ['', '?', ' in this setup?', ' for this agent?']
    const cases = prefixes.flatMap((prefix) => (
      currentDraftQuestionFrames.flatMap((frame) => (
        suffixes.map((suffix) => `${prefix}${frame}${suffix}`)
      ))
    ))

    expect(cases).toHaveLength(120)

    for (const prompt of cases) {
      const classification = classifyBuilderTurn({ prompt, draft })
      const answer = buildProjectBuilderMetaReply({
        prompt,
        draft,
        classification,
        availableUnifiedSkills: skills,
      })

      expect(classification.type, prompt).toBe('builder_status_question')
      expect(classification.topic, prompt).toBe('status')
      expect(answer, prompt).toContain('Personal Assistant')
      expect(answer, prompt).not.toMatch(forbiddenMutationClaimPattern)
    }
  })

  it('keeps explicit change requests mutable while exploratory questions stay answer-only', () => {
    const mutationPrompts = explicitMutationFrames.flatMap((frame) => (
      mutationTargets.map((target) => fillFrame(frame, target))
    ))
    const exploratoryPrompts = exploratoryFrames.flatMap((frame) => (
      mutationTargets.map((target) => fillFrame(frame, target))
    ))

    expect(mutationPrompts).toHaveLength(132)
    expect(exploratoryPrompts).toHaveLength(48)

    for (const prompt of mutationPrompts) {
      expect(classifyBuilderTurn({ prompt, draft }).type, prompt).toBe('config_change')
    }

    for (const prompt of exploratoryPrompts) {
      const classification = classifyBuilderTurn({ prompt, draft })
      expect(classification.type, prompt).not.toBe('config_change')

      const answer = buildProjectBuilderMetaReply({
        prompt,
        draft,
        classification,
        availableUnifiedSkills: skills,
      })

      expect(answer, prompt).not.toMatch(forbiddenMutationClaimPattern)
    }
  })

  it('routes implicit assistant creation phrases while preserving nearby answer-only questions', () => {
    for (const prompt of implicitCreationPrompts) {
      const classification = classifyBuilderTurn({ prompt })

      expect(classification.type, prompt).toBe('config_change')
      expect(classification.reason, prompt).toBe('matched implicit builder creation request')
      expect(shouldUseDeterministicBuilderTurnClassification(classification), prompt).toBe(true)
    }

    for (const prompt of implicitCreationQuestionBoundaries) {
      const classification = classifyBuilderTurn({ prompt, draft })

      expect(classification.type, prompt).not.toBe('config_change')
      expect(shouldUseDeterministicBuilderTurnClassification(classification), prompt).toBe(true)
    }
  })

  it('passes a diversified product/company/workflow phrasing matrix', () => {
    const cases = productQuestionMatrix.flatMap((group) => (
      group.nouns.flatMap((noun) => (
        diverseProductQuestionFrames.map((frame) => ({
          prompt: fillFrame(frame, noun),
          ...group,
        }))
      ))
    ))

    expect(cases).toHaveLength(320)

    for (const testCase of cases) {
      const classification = classifyBuilderTurn({ prompt: testCase.prompt, draft })
      const answer = buildProjectBuilderMetaReply({
        prompt: testCase.prompt,
        draft,
        classification,
        availableUnifiedSkills: skills,
      })

      expect(classification.type, testCase.prompt).toBe(testCase.expectedType)
      expect(classification.topic, testCase.prompt).toBe(testCase.topic)
      expect(answer, testCase.prompt).toMatch(testCase.expectedAnswer)
      expect(answer, testCase.prompt).not.toMatch(forbiddenMutationClaimPattern)
    }
  })

  it('passes diverse current-project and answer-only boundary prompts', () => {
    for (const prompt of diverseCurrentDraftQuestions) {
      const classification = classifyBuilderTurn({ prompt, draft })
      const answer = buildProjectBuilderMetaReply({
        prompt,
        draft,
        classification,
        availableUnifiedSkills: skills,
      })

      expect(classification.type, prompt).toBe('builder_status_question')
      expect(classification.topic, prompt).toBe('status')
      expect(answer, prompt).toContain('Personal Assistant')
      expect(answer, prompt).not.toMatch(forbiddenMutationClaimPattern)
    }

    for (const prompt of answerOnlyBoundaryPrompts) {
      const classification = classifyBuilderTurn({ prompt, draft })
      const answer = buildProjectBuilderMetaReply({
        prompt,
        draft,
        classification,
        availableUnifiedSkills: skills,
      })

      expect(classification.type, prompt).not.toBe('config_change')
      expect(answer, prompt).not.toMatch(forbiddenMutationClaimPattern)
    }
  })
})
