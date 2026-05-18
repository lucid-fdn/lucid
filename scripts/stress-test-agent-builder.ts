import { config } from 'dotenv'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import Module from 'node:module'
import { join } from 'node:path'

import type { TemplateCatalogEntry } from '@contracts/template'
import { TemplateCatalogEntrySchema } from '@contracts/template'
import type { UnifiedSkillItem } from '@contracts/unified-skill'

import type { BuilderQuestionTopic, BuilderTurnClassification, BuilderTurnType } from '@/lib/ai/project-generation/turn-routing'
import type { GenerationDraft, GeneratedBlueprintResult } from '@/lib/ai/project-generation/schemas'

installServerOnlyShim()
config({ path: '.env.local' })
config()

type AppModules = {
  getPlatformTemplateSeeds: typeof import('@/lib/templates/registry').getPlatformTemplateSeeds
  generateProjectBlueprint: typeof import('@/lib/ai/project-generation/generate-blueprint').generateProjectBlueprint
  buildProjectBuilderMetaReply: typeof import('@/lib/ai/project-generation/chat').buildProjectBuilderMetaReply
  classifyBuilderTurn: typeof import('@/lib/ai/project-generation/turn-routing').classifyBuilderTurn
}

type GenerationExpectation = {
  topology?: 'single-agent' | 'team' | 'clarify'
  mode?: 'blank-agent' | 'blank-team' | 'template'
  templateSlug?: string
  topTemplateSlug?: string
  topTemplateSlugs?: string[]
  disallowedTemplateSlugs?: string[]
  requireCapabilitySuggestion?: boolean
  requireMissingInputs?: boolean
  minTeamMembers?: number
  noClarification?: boolean
}

type RoutingExpectation = {
  type: BuilderTurnType
  topic?: BuilderQuestionTopic
  answerMatches?: RegExp[]
  answerMustNotMatch?: RegExp[]
}

type StressCase =
  | {
      id: string
      kind: 'generation'
      prompt: string
      expected: GenerationExpectation
    }
  | {
      id: string
      kind: 'routing'
      prompt: string
      expected: RoutingExpectation
    }

type CaseResult = {
  id: string
  kind: StressCase['kind']
  prompt: string
  ok: boolean
  durationMs: number
  failures: string[]
  observed: Record<string, unknown>
}

const args = new Map<string, string | boolean>()
for (const arg of process.argv.slice(2)) {
  if (!arg.startsWith('--')) continue
  const [key, value] = arg.slice(2).split('=')
  args.set(key, value ?? true)
}

const limit = Number(args.get('limit') ?? process.env.AGENT_BUILDER_STRESS_LIMIT ?? 320)
const concurrency = Math.max(1, Number(args.get('concurrency') ?? process.env.AGENT_BUILDER_STRESS_CONCURRENCY ?? 3))
const strongModel = String(args.get('strong-model') ?? process.env.AGENT_BUILDER_STRESS_STRONG_MODEL ?? 'openai/gpt-4.1-mini')
const fastModel = String(args.get('fast-model') ?? process.env.AGENT_BUILDER_STRESS_FAST_MODEL ?? strongModel)
const requireLiveProvider = args.get('offline') !== true

if (requireLiveProvider && !hasLiveAiProvider()) {
  throw new Error('Live builder stress requires OPENAI_API_KEY, TRUSTGATE_API_KEY, or LUCID_API_KEY. Use --offline only for deterministic local routing checks.')
}

let appModules: AppModules
let templates: TemplateCatalogEntry[] = []
const unifiedSkills = buildUnifiedSkills()
let cases: StressCase[] = []
const startedAt = Date.now()

const originalLog = console.log
const originalWarn = console.warn
if (args.get('verbose') !== true) {
  console.log = (...parts: unknown[]) => {
    if (String(parts[0] ?? '').startsWith('[builder:')) return
    originalLog(...parts)
  }
  console.warn = (...parts: unknown[]) => {
    if (String(parts[0] ?? '').startsWith('[builder:')) return
    originalWarn(...parts)
  }
}

main().catch((error) => {
  originalWarn(error)
  process.exitCode = 1
})

async function main() {
  appModules = await loadAppModules()
  templates = buildTemplateCatalog(appModules.getPlatformTemplateSeeds)
  cases = buildStressCases().slice(0, limit)

  const results = await runPool(cases, concurrency, runCase)
  const failed = results.filter((result) => !result.ok)
  const generationResults = results.filter((result) => result.kind === 'generation')
  const routingResults = results.filter((result) => result.kind === 'routing')
  const durations = results.map((result) => result.durationMs).sort((a, b) => a - b)
  const report = {
    generatedAt: new Date().toISOString(),
    mode: requireLiveProvider ? 'live' : 'offline',
    models: { strongModel, fastModel },
    concurrency,
    durationMs: Date.now() - startedAt,
    totals: {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      generation: generationResults.length,
      routing: routingResults.length,
    },
    latency: {
      p50: percentile(durations, 0.5),
      p90: percentile(durations, 0.9),
      p95: percentile(durations, 0.95),
      max: durations.at(-1) ?? 0,
    },
    failures: failed,
    results,
  }

  mkdirSync('logs', { recursive: true })
  const reportPath = join('logs', `agent-builder-stress-${Date.now()}.json`)
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  originalLog(JSON.stringify({
    reportPath,
    mode: report.mode,
    models: report.models,
    totals: report.totals,
    latency: report.latency,
  }, null, 2))

  if (failed.length > 0) {
    for (const failure of failed.slice(0, 20)) {
      originalWarn(`[builder-stress:failed] ${failure.id}: ${failure.failures.join('; ')}`)
    }
    process.exitCode = 1
  }
}

async function runCase(testCase: StressCase): Promise<CaseResult> {
  const start = Date.now()
  try {
    if (testCase.kind === 'routing') {
      const classification = appModules.classifyBuilderTurn({ prompt: testCase.prompt, draft: sampleDraft })
      const answer = appModules.buildProjectBuilderMetaReply({
        prompt: testCase.prompt,
        draft: sampleDraft,
        classification,
        availableUnifiedSkills: unifiedSkills,
      })
      const failures = evaluateRouting(testCase.expected, classification, answer)
      return {
        id: testCase.id,
        kind: testCase.kind,
        prompt: testCase.prompt,
        ok: failures.length === 0,
        durationMs: Date.now() - start,
        failures,
        observed: {
          type: classification.type,
          topic: classification.topic,
          answer,
        },
      }
    }

    const result = await appModules.generateProjectBlueprint({
      prompt: testCase.prompt,
      templates,
      strongModel,
      fastModel,
      strongModelId: strongModel,
      preferredMode: 'auto',
      planningBackend: 'local-orchestrator',
      availableUnifiedSkills: unifiedSkills,
      telemetry: {
        orgId: 'builder-stress',
        modelId: strongModel,
        fastModelId: fastModel,
      },
    })
    const failures = evaluateGeneration(testCase.expected, result)
    return {
      id: testCase.id,
      kind: testCase.kind,
      prompt: testCase.prompt,
      ok: failures.length === 0,
      durationMs: Date.now() - start,
      failures,
      observed: summarizeGenerationResult(result),
    }
  } catch (error) {
    return {
      id: testCase.id,
      kind: testCase.kind,
      prompt: testCase.prompt,
      ok: false,
      durationMs: Date.now() - start,
      failures: [error instanceof Error ? error.message : String(error)],
      observed: {},
    }
  }
}

function evaluateGeneration(expected: GenerationExpectation, result: GeneratedBlueprintResult): string[] {
  const failures: string[] = []
  const topology = result.topology_decision?.topology
  const topTemplate = result.template_matches[0]?.slug
  const selectedTemplate = result.selected_template?.slug
  const teamMembers = result.draft.team?.members.length ?? 0
  const capabilitySuggestions = [
    ...(result.suggested_capabilities?.skills ?? []),
    ...(result.suggested_capabilities?.plugins ?? []),
    ...(result.suggested_capabilities?.tool_servers ?? []),
  ]
  const draftCapabilityCount = countDraftCapabilities(result.draft)
  const projectName = result.draft.project.name

  if (expected.topology && topology !== expected.topology) {
    failures.push(`expected topology ${expected.topology}, got ${topology ?? 'none'}`)
  }
  if (expected.mode && result.mode !== expected.mode) {
    failures.push(`expected mode ${expected.mode}, got ${result.mode}`)
  }
  if (expected.templateSlug && selectedTemplate !== expected.templateSlug) {
    failures.push(`expected selected template ${expected.templateSlug}, got ${selectedTemplate ?? 'none'}`)
  }
  if (expected.topTemplateSlug && topTemplate !== expected.topTemplateSlug) {
    failures.push(`expected top template ${expected.topTemplateSlug}, got ${topTemplate ?? 'none'}`)
  }
  if (expected.topTemplateSlugs && !expected.topTemplateSlugs.includes(topTemplate ?? '')) {
    failures.push(`expected top template in ${expected.topTemplateSlugs.join(', ')}, got ${topTemplate ?? 'none'}`)
  }
  if (expected.disallowedTemplateSlugs?.includes(topTemplate ?? '')) {
    failures.push(`disallowed top template ${topTemplate}`)
  }
  if (expected.disallowedTemplateSlugs?.includes(selectedTemplate ?? '')) {
    failures.push(`disallowed selected template ${selectedTemplate}`)
  }
  if (
    expected.requireCapabilitySuggestion
    && capabilitySuggestions.length === 0
    && result.suggested_integrations.length === 0
    && draftCapabilityCount === 0
  ) {
    failures.push('expected at least one capability, selected capability, or integration suggestion')
  }
  if (expected.requireMissingInputs && result.missing_required_inputs.length === 0) {
    failures.push('expected missing required template inputs')
  }
  if (typeof expected.minTeamMembers === 'number' && teamMembers < expected.minTeamMembers) {
    failures.push(`expected at least ${expected.minTeamMembers} team members, got ${teamMembers}`)
  }
  if (expected.noClarification && result.clarification?.needed) {
    failures.push('did not expect clarification')
  }
  if (/^(create|build|start|make|launch|set up)\b/i.test(projectName)) {
    failures.push(`project name kept command verb: ${projectName}`)
  }
  if (/\b(assistnat|assisntat|asisntat|asisitant|assistante)\b/i.test(projectName)) {
    failures.push(`project name kept assistant typo: ${projectName}`)
  }
  if ((result.suggested_capabilities?.skills ?? []).some((skill) => skill.source === 'internal')) {
    failures.push('suggested internal skill to user')
  }
  return failures
}

function evaluateRouting(
  expected: RoutingExpectation,
  classification: BuilderTurnClassification,
  answer: string,
): string[] {
  const failures: string[] = []
  if (classification.type !== expected.type) {
    failures.push(`expected route ${expected.type}, got ${classification.type}`)
  }
  if (expected.topic && classification.topic !== expected.topic) {
    failures.push(`expected topic ${expected.topic}, got ${classification.topic ?? 'none'}`)
  }
  for (const pattern of expected.answerMatches ?? []) {
    if (!pattern.test(answer)) failures.push(`answer did not match ${pattern}`)
  }
  for (const pattern of expected.answerMustNotMatch ?? []) {
    if (pattern.test(answer)) failures.push(`answer matched forbidden ${pattern}`)
  }
  return failures
}

function summarizeGenerationResult(result: GeneratedBlueprintResult): Record<string, unknown> {
  return {
    mode: result.mode,
    projectName: result.draft.project.name,
    topology: result.topology_decision?.topology,
    topologySource: result.topology_decision?.source,
    selectedTemplate: result.selected_template?.slug ?? null,
    topTemplate: result.template_matches[0]?.slug ?? null,
    topTemplateScore: result.template_matches[0]?.score ?? null,
    missingRequiredInputs: result.missing_required_inputs.map((input) => input.key),
    suggestedIntegrations: result.suggested_integrations,
    suggestedSkills: result.suggested_capabilities?.skills?.map((skill) => `${skill.source}:${skill.slug}`) ?? [],
    suggestedPlugins: result.suggested_capabilities?.plugins?.map((plugin) => plugin.slug) ?? [],
    teamMembers: result.draft.team?.members.map((member) => member.role) ?? [],
    draftSkills: result.draft.agent?.skills ?? result.draft.team?.members.flatMap((member) => member.skills ?? []) ?? [],
    draftPlugins: result.draft.agent?.plugins ?? result.draft.team?.members.flatMap((member) => member.plugins ?? []) ?? [],
    warnings: result.warnings,
  }
}

function countDraftCapabilities(draft: GenerationDraft): number {
  return [
    ...(draft.agent?.skills ?? []),
    ...(draft.agent?.plugins ?? []),
    ...(draft.agent?.tool_servers ?? []),
    ...(draft.team?.members.flatMap((member) => member.skills ?? []) ?? []),
    ...(draft.team?.members.flatMap((member) => member.plugins ?? []) ?? []),
    ...(draft.team?.members.flatMap((member) => member.tool_servers ?? []) ?? []),
  ].length
}

function buildStressCases(): StressCase[] {
  const cases: StressCase[] = []
  let counter = 0
  const addGeneration = (prompt: string, expected: GenerationExpectation) => {
    cases.push({ id: `gen-${String(++counter).padStart(3, '0')}`, kind: 'generation', prompt, expected })
  }
  const addRouting = (prompt: string, expected: RoutingExpectation) => {
    cases.push({ id: `route-${String(++counter).padStart(3, '0')}`, kind: 'routing', prompt, expected })
  }

  const personalObjects = [
    'daily assistant',
    'personal assistant',
    'calendar and email assistant',
    'assistant for reminders notes and tasks',
    'personal operator for inbox calendar and tasks',
    'daily assistnat',
    'daily assisntat',
    'daily asisitant',
  ]
  for (const prompt of buildPromptVariants(personalObjects, ['create', 'build', 'start', 'make'])) {
    addGeneration(prompt, {
      topology: 'single-agent',
      disallowedTemplateSlugs: ['sales-outreach-lemlist', 'contract-sentinel', 'churn-radar'],
      requireCapabilitySuggestion: true,
      noClarification: true,
    })
  }

  const supportObjects = [
    'support agent for billing questions and escalations',
    'customer support bot for refunds and troubleshooting',
    'helpdesk triage agent for product questions',
    'tier one support agent with escalation routing',
  ]
  for (const prompt of buildPromptVariants(supportObjects, ['create', 'build', 'set up'])) {
    addGeneration(prompt, {
      topology: 'single-agent',
      topTemplateSlugs: ['support-agent', 'tier1-support'],
      disallowedTemplateSlugs: ['sales-outreach-lemlist', 'personal-agent'],
      requireCapabilitySuggestion: true,
    })
  }

  const salesObjects = [
    'sales outreach agent for prospect follow up',
    'CRM assistant for lead follow-up and pipeline triage',
    'prospecting assistant for account research',
    'Lemlist campaign launcher for outbound emails',
  ]
  for (const prompt of buildPromptVariants(salesObjects, ['create', 'build', 'launch'])) {
    addGeneration(prompt, {
      topology: 'single-agent',
      disallowedTemplateSlugs: ['personal-agent', 'support-agent'],
      requireCapabilitySuggestion: true,
    })
  }

  const monitoringObjects = [
    'brand monitor that tracks mentions and sentiment',
    'engineering monitor for GitHub incidents and Slack alerts',
    'customer churn radar for renewal risk',
    'competitive intelligence monitor for market research',
  ]
  for (const prompt of buildPromptVariants(monitoringObjects, ['create', 'build', 'set up'])) {
    addGeneration(prompt, {
      topology: 'single-agent',
      disallowedTemplateSlugs: ['sales-outreach-lemlist', 'personal-agent'],
      requireCapabilitySuggestion: true,
    })
  }

  const teamObjects = [
    'content team with research writing editing and publishing',
    'marketing campaign team with planning copy QA and reporting',
    'social media team for calendar community and performance reporting',
    'executive briefing team for metrics risks and decisions',
  ]
  for (const prompt of buildPromptVariants(teamObjects, ['create', 'build', 'set up'])) {
    addGeneration(prompt, {
      topology: 'team',
      minTeamMembers: 2,
      noClarification: true,
    })
  }

  for (const template of templates.filter((template) => template.params.some((param) => param.required)).slice(0, 14)) {
    addGeneration(`Use the "${template.name}" template as the starting point.`, {
      mode: 'template',
      templateSlug: template.slug,
      requireMissingInputs: true,
      ...(template.kind === 'team' ? { minTeamMembers: 2 } : {}),
    })
  }

  for (const prompt of [
    'build something to run growth',
    'make an agent or team for operations',
    'I need help automating everything around go to market',
    'set up a system to handle all my business workflows',
    'create something for marketing sales and support',
    'I want automation for the whole company',
  ]) {
    addGeneration(prompt, {
      topology: 'clarify',
      requireCapabilitySuggestion: false,
    })
  }

  const questionCases: Array<[string, BuilderQuestionTopic, RegExp[]]> = [
    ['what engines are available?', 'engine', [/OpenClaw/i, /Hermes/i]],
    ['is gpt-4o-mini the engine?', 'engine', [/not the language model/i]],
    ['what are runtimes?', 'runtime', [/Shared/i, /Dedicated/i, /Bring your own/i]],
    ['how do channels work?', 'channels', [/Slack|Discord|Telegram/i]],
    ['what are skills and integrations?', 'capabilities', [/skills/i, /plugins|tool connections|grouped step/i]],
    ['how do templates work?', 'template', [/prebuilt starting points|template/i]],
    ['what is Lucid?', 'lucid', [/agent-building platform/i]],
    ['what happens after I create the agent?', 'workflow', [/create the agent|test|deploy/i]],
    ['who founded the company?', 'company', [/official Lucid|source of truth/i]],
    ["what's missing before we create?", 'status', [/Before creating|connect|choose|Nothing critical/i]],
    ['what are you doing?', 'status', [/Personal Assistant/i]],
    ['what tools did you add?', 'status', [/Google Workspace|bear-notes/i]],
  ]
  const questionPrefixes = ['', 'quick question: ', 'please explain: ', 'just answer: ']
  for (const [base, topic, answerMatches] of questionCases) {
    for (const prefix of questionPrefixes) {
      addRouting(`${prefix}${base}`, {
        type: topic === 'status' ? 'builder_status_question' : 'product_question',
        topic,
        answerMatches,
        answerMustNotMatch: [/^\s*(Added|Updated|Changed|Created|Removed|Connected)\b/i],
      })
    }
  }

  for (const prompt of [
    'add Slack',
    'please remove the schedule',
    'can you add Notion?',
    'could you switch the engine to Hermes?',
    'rename it to Daily Operator',
    'set channel to Discord',
    'configure a weekday schedule',
    'connect Google Workspace',
  ]) {
    addRouting(prompt, { type: 'config_change' })
  }

  for (const prompt of ['skip', 'skip this', 'skip this for now', 'Skip this for now.']) {
    addRouting(prompt, { type: 'local_ui_action', answerMatches: [/unchanged/i] })
  }

  for (const prompt of [
    'focus on calendar planning',
    'optimize for communication',
    'keep this as a single agent',
    'convert this into a coordinated team',
  ]) {
    addRouting(prompt, { type: 'clarification_answer' })
  }

  return cases
}

function buildPromptVariants(objects: string[], verbs: string[]): string[] {
  const variants: string[] = []
  const contexts = ['', ' for my startup', ' for a small team']
  for (const object of objects) {
    for (const verb of verbs) {
      for (const context of contexts) {
        variants.push(`${verb} ${object}${context}`)
      }
    }
  }
  return variants
}

function buildTemplateCatalog(
  getPlatformTemplateSeeds: AppModules['getPlatformTemplateSeeds'],
): TemplateCatalogEntry[] {
  const now = '2026-01-01T00:00:00.000Z'
  return getPlatformTemplateSeeds().map((seed) => TemplateCatalogEntrySchema.parse({
    id: stableUuid(seed.slug),
    slug: seed.slug,
    name: seed.name,
    description: seed.description ?? null,
    category: seed.category,
    kind: seed.kind,
    source: 'platform',
    status: 'approved',
    is_public: true,
    owner_org_id: null,
    spec: seed.spec,
    params: seed.params ?? [],
    preview_prompt: seed.preview_prompt ?? null,
    tags: seed.tags ?? [],
    install_count: 0,
    created_by: null,
    created_at: now,
    updated_at: now,
    version: seed.version ?? '1.0.0',
    changelog: null,
    forked_from_id: null,
    forked_from_ver: null,
    component_type: null,
    cert_status: 'uncertified',
    cert_score: null,
    cert_checked_at: null,
    outcome_data: {},
  }))
}

function buildUnifiedSkills(): UnifiedSkillItem[] {
  return [
    makePlugin('google-workspace', 'Google Workspace', 'Gmail, Calendar, Drive, and Tasks access.', 'productivity', 'google'),
    makePlugin('asana', 'Asana', 'Task and project management.', 'productivity', 'asana'),
    makePlugin('notion', 'Notion', 'Pages, notes, and knowledge base access.', 'productivity', 'notion'),
    makePlugin('linear', 'Linear', 'Issue and engineering workflow access.', 'engineering', 'linear'),
    makePlugin('slack', 'Slack', 'Team messages and channel updates.', 'communication', 'slack'),
    makePlugin('github', 'GitHub', 'Repository, pull request, and issue access.', 'engineering', 'github'),
    makePlugin('hubspot', 'HubSpot', 'CRM and pipeline access.', 'sales', 'hubspot'),
    makePlugin('stripe', 'Stripe', 'Customer billing and payment context.', 'finance', 'stripe'),
    makeSkill('bear-notes', 'Bear Notes', 'Local note capture and personal knowledge.', 'productivity'),
    makeSkill('browser-research', 'Browser Research', 'Research public websites and summarize findings.', 'research'),
    makeSkill('content-drafting', 'Content Drafting', 'Draft, edit, and polish content.', 'content'),
  ]
}

function makePlugin(
  slug: string,
  name: string,
  description: string,
  category: string,
  authProvider: string,
): UnifiedSkillItem {
  return {
    id: slug,
    slug,
    name,
    description,
    category,
    item_type: 'plugin',
    section: 'installed',
    installed: true,
    is_active: true,
    installation_id: null,
    activation_id: null,
    tools: [],
    enabled_tools: [],
    tool_count: 0,
    can_act: true,
    always_on: false,
    removable: true,
    connection_status: 'setup_required',
    auth_provider: authProvider,
    connection_id: null,
    health_status: null,
    health_message: null,
    expires_at: null,
    content_chars: null,
    version: '1.0.0',
    author: null,
    source: 'catalog',
    verified: true,
  }
}

function makeSkill(slug: string, name: string, description: string, category: string): UnifiedSkillItem {
  return {
    id: slug,
    slug,
    name,
    description,
    category,
    item_type: 'skill',
    section: 'installed',
    installed: true,
    is_active: true,
    installation_id: null,
    activation_id: slug,
    tools: [],
    enabled_tools: [],
    tool_count: 0,
    can_act: false,
    always_on: false,
    removable: true,
    connection_status: null,
    auth_provider: null,
    connection_id: null,
    health_status: null,
    health_message: null,
    expires_at: null,
    content_chars: null,
    version: '1.0.0',
    author: null,
    source: 'catalog',
    verified: true,
  }
}

const sampleDraft: GenerationDraft = {
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

function stableUuid(seed: string): string {
  const hex = createHash('sha1').update(`agent-builder-stress:${seed}`).digest('hex').slice(0, 32)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}

async function runPool<T, R>(
  items: T[],
  workerCount: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex++
      results[current] = await worker(items[current] as T)
    }
  }))
  return results
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1))
  return values[index] ?? 0
}

function hasLiveAiProvider(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim()
      || process.env.TRUSTGATE_API_KEY?.trim()
      || process.env.LUCID_API_KEY?.trim(),
  )
}

function installServerOnlyShim(): void {
  const moduleWithLoader = Module as typeof Module & {
    _load?: (request: string, parent: unknown, isMain: boolean) => unknown
  }
  const originalLoad = moduleWithLoader._load
  if (!originalLoad) return

  moduleWithLoader._load = function loadWithServerOnlyShim(
    request: string,
    parent: unknown,
    isMain: boolean,
  ) {
    if (request === 'server-only') return {}
    return originalLoad.apply(this, [request, parent, isMain])
  }
}

async function loadAppModules(): Promise<AppModules> {
  const [
    registry,
    generation,
    chat,
    routing,
  ] = await Promise.all([
    import('@/lib/templates/registry'),
    import('@/lib/ai/project-generation/generate-blueprint'),
    import('@/lib/ai/project-generation/chat'),
    import('@/lib/ai/project-generation/turn-routing'),
  ])

  return {
    getPlatformTemplateSeeds: registry.getPlatformTemplateSeeds,
    generateProjectBlueprint: generation.generateProjectBlueprint,
    buildProjectBuilderMetaReply: chat.buildProjectBuilderMetaReply,
    classifyBuilderTurn: routing.classifyBuilderTurn,
  }
}
