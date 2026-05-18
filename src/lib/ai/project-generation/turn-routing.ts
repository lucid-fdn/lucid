import type { GenerationDraft } from './schemas'
import { normalizeBuilderText } from './normalization'

export type BuilderTurnType =
  | 'product_question'
  | 'builder_status_question'
  | 'local_ui_action'
  | 'config_change'
  | 'clarification_answer'

export type BuilderQuestionTopic =
  | 'engine'
  | 'runtime'
  | 'channels'
  | 'capabilities'
  | 'template'
  | 'validation'
  | 'lucid'
  | 'company'
  | 'workflow'
  | 'status'
  | 'general'

export interface BuilderTurnClassification {
  type: BuilderTurnType
  reason: string
  topic?: BuilderQuestionTopic
  confidence?: number
}

const LOCAL_ACTION_PATTERNS = [
  /^skip(?: this)?(?: for now)?[.!?]?$/i,
]

const CLARIFICATION_ANSWER_PATTERNS = [
  /\bfocus\b.+\b(calendar|email|task|tasks|planning|communication|execution)\b/i,
  /\boptimi[sz]e\b.+\b(communication|planning|execution)\b/i,
  /\bkeep this as a single agent\b/i,
  /\bconvert this into (?:a )?(?:coordinated )?team\b/i,
]

const CONFIG_CHANGE_REQUEST_PATTERNS = [
  /^(?:please\s+)?(?:add|remove|change|switch|set|make|use|connect|enable|disable|rename|update|configure)\b/i,
  /^(?:can|could|would)\s+you\s+(?:please\s+)?(?:add|remove|change|switch|set|make|use|connect|enable|disable|rename|update|configure)\b/i,
  /\b(?:add|remove|change|switch|set|make|use|connect|enable|disable|rename|update|configure)\s+(?:slack|discord|telegram|whatsapp|teams|gmail|google|asana|notion|linear|schedule|channel|engine|runtime|template|tone|name|skill|tool|integration)\b/i,
]

const BUILDER_CREATION_REQUEST_PATTERNS = [
  /^(?:please\s+)?(?:create|build|make|start|launch|set\s+up|setup)\s+(?:(?:a|an|the|my|our)\s+)?(?:new\s+)?(?:agent|assistant|bot|copilot|operator|project)\b/i,
  /^(?:i\s+)?(?:need|want)\s+(?:(?:a|an|the|my|our)\s+)?(?:new\s+)?(?:agent|assistant|bot|copilot|operator)\b/i,
  /\b(?:create|build|make|start|launch|set\s+up|setup)\b.+\b(?:agent|assistant|bot|copilot|operator)\b/i,
]

const BUILDER_CREATION_ACTION_TERMS = ['create', 'build', 'make', 'start', 'launch', 'setup'] as const
const BUILDER_CREATION_OBJECT_TERMS = ['agent', 'assistant', 'bot', 'copilot', 'operator', 'project'] as const
const BUILDER_CREATION_DESCRIPTOR_TERMS = [
  'daily',
  'personal',
  'executive',
  'research',
  'sales',
  'support',
  'customer',
  'calendar',
  'email',
  'task',
  'tasks',
  'notes',
  'reminders',
  'scheduler',
  'planning',
  'ops',
] as const

const EXPLORATORY_QUESTION_PATTERNS = [
  /^(?:what if|what happens if|should we|should i|can i|could i|would it)\b/i,
]

const ANSWER_ONLY_INTENT_PATTERNS = [
  /\b(?:do not|don't|dont|without|no need to)\s+(?:change|changing|modify|modifying|update|updating|edit|editing|add|adding|remove|removing|connect|connecting|configure|configuring|switch|switching)\b/i,
  /\b(?:just|only)\s+(?:explain|tell me|answer|describe)\b/i,
]

export function classifyBuilderTurn(input: {
  prompt: string
  draft?: GenerationDraft
}): BuilderTurnClassification {
  const prompt = input.prompt.trim()
  if (!prompt) {
    return { type: 'config_change', reason: 'empty prompt defaults to config change path' }
  }

  if (LOCAL_ACTION_PATTERNS.some((pattern) => pattern.test(prompt))) {
    return { type: 'local_ui_action', reason: 'matched local ui action pattern' }
  }

  if (CLARIFICATION_ANSWER_PATTERNS.some((pattern) => pattern.test(prompt))) {
    return { type: 'clarification_answer', reason: 'matched clarification answer pattern' }
  }

  const normalizedPrompt = normalizeBuilderText(prompt)
  if (
    !ANSWER_ONLY_INTENT_PATTERNS.some((pattern) => pattern.test(prompt))
    && isStructuredBuilderBrief(prompt)
  ) {
    return {
      type: 'config_change',
      topic: 'general',
      reason: 'matched structured builder brief',
      confidence: 0.9,
    }
  }

  if (
    !ANSWER_ONLY_INTENT_PATTERNS.some((pattern) => pattern.test(prompt))
    && (!isInformationSeekingPrompt(prompt) || isActionableBuilderRequestQuestion(prompt))
    && (
      BUILDER_CREATION_REQUEST_PATTERNS.some((pattern) => pattern.test(normalizedPrompt))
      || hasFuzzyBuilderCreationIntent(normalizedPrompt)
    )
  ) {
    return {
      type: 'config_change',
      topic: 'general',
      reason: 'matched explicit builder creation request',
      confidence: 0.95,
    }
  }

  if (
    !ANSWER_ONLY_INTENT_PATTERNS.some((pattern) => pattern.test(prompt))
    && !EXPLORATORY_QUESTION_PATTERNS.some((pattern) => pattern.test(prompt))
    && !isInformationSeekingPrompt(prompt)
    && hasImplicitBuilderCreationIntent(normalizedPrompt)
  ) {
    return {
      type: 'config_change',
      topic: 'general',
      reason: 'matched implicit builder creation request',
      confidence: 0.85,
    }
  }

  if (
    !ANSWER_ONLY_INTENT_PATTERNS.some((pattern) => pattern.test(prompt))
    &&
    !EXPLORATORY_QUESTION_PATTERNS.some((pattern) => pattern.test(prompt))
    && CONFIG_CHANGE_REQUEST_PATTERNS.some((pattern) => pattern.test(prompt))
  ) {
    return { type: 'config_change', reason: 'matched explicit configuration change request' }
  }

  if (isInformationSeekingPrompt(prompt)) {
    const topic = detectQuestionTopic(prompt)
    if (topic === 'lucid' || topic === 'company' || topic === 'workflow') {
      return {
        type: 'product_question',
        topic,
        reason: 'fallback knowledge-domain question route; answer-only to prevent accidental mutation',
        confidence: 0.65,
      }
    }

    if (input.draft && isDraftStatusQuestion(prompt)) {
      return {
        type: 'builder_status_question',
        topic: 'status',
        reason: 'fallback draft-status question route; answer-only to prevent accidental mutation',
        confidence: 0.6,
      }
    }

    return {
      type: topic === 'status' ? 'builder_status_question' : 'product_question',
      topic,
      reason: 'fallback question route; answer-only to prevent accidental mutation',
      confidence: 0.5,
    }
  }

  return { type: 'config_change', reason: 'default config change path' }
}

export function shouldUseDeterministicBuilderTurnClassification(classification: BuilderTurnClassification): boolean {
  if (classification.type === 'local_ui_action' || classification.type === 'clarification_answer') return true
  if (classification.type === 'config_change') {
    return classification.reason === 'matched explicit configuration change request'
      || classification.reason === 'matched explicit builder creation request'
      || classification.reason === 'matched implicit builder creation request'
      || classification.reason === 'matched structured builder brief'
  }
  if (classification.type === 'builder_status_question' || classification.type === 'product_question') {
    return true
  }
  return false
}

export function isQuestionLikeBuilderPrompt(prompt: string): boolean {
  return prompt.includes('?') || /^(what|which|why|how|when|where|who|can|could|should|do|does|did|is|are)\b/i.test(prompt)
}

function isInformationSeekingPrompt(prompt: string): boolean {
  return (
    isQuestionLikeBuilderPrompt(prompt)
    || /^(?:tell|explain|describe|show|quick question|pls explain|please explain|help me understand|i want to understand)\b/i.test(prompt)
    || ANSWER_ONLY_INTENT_PATTERNS.some((pattern) => pattern.test(prompt))
  )
}

function isActionableBuilderRequestQuestion(prompt: string): boolean {
  return /^(?:can|could|would)\s+you\s+(?:please\s+)?(?:create|build|make|start|launch|set\s+up|setup|add|remove|change|switch|set|use|connect|enable|disable|rename|update|configure)\b/i.test(prompt)
}

function isStructuredBuilderBrief(prompt: string): boolean {
  const lower = prompt.toLowerCase()
  if (!/\b(outcome|goal|objective)\s*:/.test(lower)) return false

  const hasAudience = /\b(audience|team|user|users)\s*:/.test(lower)
  const hasCapabilities = /\b(needed integrations|integrations|tools|skills|capabilities)\s*:/.test(lower)
  const hasConstraints = /\b(constraints|requirements|preferences)\s*:/.test(lower)
  return [hasAudience, hasCapabilities, hasConstraints].filter(Boolean).length >= 1
}

function isDraftStatusQuestion(prompt: string): boolean {
  const lower = prompt.toLowerCase()
  const referencesCurrentDraft = /\b(you|we|it|this|current|selected|chosen|added|included|using|configured|setup|agent|project|draft)\b/.test(lower)
  const asksAboutCurrentState = /\b(doing|missing|ready|next|required|requirements?|validate|validation|valid|indicate|needed|need|add|added|include|included|select|selected|choose|chose|chosen|pick|picked|using|configured|scheduled|connected|work|run|create|created|before|can it do|can it use|does it have|what can it)\b/.test(lower)
    || /\bwhat can (?:this|the|my|our)?\s*(?:agent|setup|draft|project)\b/.test(lower)

  return referencesCurrentDraft && asksAboutCurrentState
}

function detectQuestionTopic(prompt: string): BuilderQuestionTopic {
  const lower = prompt.toLowerCase()

  if (/\b(company|team behind|founded|founder|pricing|price|cost|billing|legal|terms|privacy|security|compliance|support|contact|hiring|funding|investor)\b/.test(lower)) {
    return 'company'
  }
  if (/\b(lucid|lucid ai|lucid platform|agent platform|this platform)\b/.test(lower)) {
    return 'lucid'
  }
  if (/\b(builder flow|creation flow|setup flow|onboarding|after create|after creation|after i create|what happens next|next after|connect apps|connect required apps|test session|deploy step|review step)\b/.test(lower)) {
    return 'workflow'
  }
  if (/\b(requirements?|required|validate|validation|valid|ready to create|before creating|before create|needs? to be indicated|what should i indicate|what do i need to indicate|what info do you need|required inputs?)\b/.test(lower)) {
    return 'validation'
  }
  if (/\b(engine|engines|openclaw|hermes|model vs engine|execution engine)\b/.test(lower)) {
    return 'engine'
  }
  if (/\b(runtime|runtimes|shared|dedicated|bring your own|byo|worker|deploy|deployment)\b/.test(lower)) {
    return 'runtime'
  }
  if (/\b(channel|channels|slack|discord|telegram|whatsapp|teams|web chat|chat channel)\b/.test(lower)) {
    return 'channels'
  }
  if (/\b(skill|skills|tool|tools|capabilit|integration|integrations|oauth|connect|apps?|google|gmail|calendar|asana|notion|linear)\b/.test(lower)) {
    return 'capabilities'
  }
  if (/\b(template|templates|base|suggested template|official template|community template)\b/.test(lower)) {
    return 'template'
  }
  if (/\b(missing|ready|before we create|before creating|what are you doing|current setup|setup status|next step)\b/.test(lower)) {
    return 'status'
  }
  return 'general'
}

function hasFuzzyBuilderCreationIntent(prompt: string): boolean {
  const tokens = tokenizeForIntent(prompt)
  if (tokens.length === 0) return false

  const firstContentIndex = tokens.findIndex((token) => !isIntentFiller(token))
  const scanTokens = firstContentIndex >= 0 ? tokens.slice(firstContentIndex, firstContentIndex + 8) : tokens.slice(0, 8)
  const actionIndex = scanTokens.findIndex((token) => isNearAnyTerm(token, BUILDER_CREATION_ACTION_TERMS))
  if (actionIndex < 0) return false

  return scanTokens
    .slice(actionIndex + 1, actionIndex + 7)
    .some((token) => isNearAnyTerm(token, BUILDER_CREATION_OBJECT_TERMS))
}

function hasImplicitBuilderCreationIntent(prompt: string): boolean {
  const tokens = tokenizeForIntent(prompt).filter((token) => !isIntentFiller(token))
  if (tokens.length === 0 || tokens.length > 6) return false

  const hasBuilderObject = tokens.some((token) => isNearAnyTerm(token, BUILDER_CREATION_OBJECT_TERMS))
  if (!hasBuilderObject) return false

  const hasDescriptor = tokens.some((token) => isNearAnyTerm(token, BUILDER_CREATION_DESCRIPTOR_TERMS))
  return hasDescriptor || tokens.length <= 3
}

function tokenizeForIntent(prompt: string): string[] {
  return prompt
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function isIntentFiller(token: string): boolean {
  return /^(please|pls|can|could|would|you|i|we|need|want|a|an|the|my|our|new)$/.test(token)
}

function isNearAnyTerm(token: string, terms: readonly string[]): boolean {
  return terms.some((term) => isNearIntentTerm(token, term))
}

function isNearIntentTerm(token: string, term: string): boolean {
  if (token === term) return true
  if (token.length < 4 && token !== term) return false
  const distance = boundedLevenshtein(token, term, maxIntentDistance(term))
  if (distance === null) return false
  const lengthRatio = Math.min(token.length, term.length) / Math.max(token.length, term.length)
  return lengthRatio >= 0.72
}

function maxIntentDistance(term: string): number {
  if (term.length <= 4) return 1
  if (term.length <= 7) return 2
  return 3
}

function boundedLevenshtein(left: string, right: string, maxDistance: number): number | null {
  if (Math.abs(left.length - right.length) > maxDistance) return null
  if (left === right) return 0

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = new Array<number>(right.length + 1)

  for (let i = 0; i < left.length; i += 1) {
    current[0] = i + 1
    let rowMin = current[0]
    for (let j = 0; j < right.length; j += 1) {
      const cost = left[i] === right[j] ? 0 : 1
      current[j + 1] = Math.min(
        current[j]! + 1,
        previous[j + 1]! + 1,
        previous[j]! + cost,
      )
      rowMin = Math.min(rowMin, current[j + 1]!)
    }
    if (rowMin > maxDistance) return null
    for (let j = 0; j < previous.length; j += 1) {
      previous[j] = current[j]!
    }
  }

  const distance = previous[right.length]!
  return distance <= maxDistance ? distance : null
}
