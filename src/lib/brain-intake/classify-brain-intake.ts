import type { SharedContextRecordType } from '@contracts/shared-context'

import type {
  BrainIntakeClassifyRequest,
  BrainIntakeClassifyResponse,
  BrainIntakeDestination,
  BrainIntakeDraftItem,
  BrainIntakeKind,
} from './schema'
import { compareBrainIntakeItems } from './compare-brain-intake'
import { buildBrainIntakePreview } from './preview-brain-intake'
import { rankBrainIntakeItems } from './rank-brain-intake'
import { validateBrainIntakeItems } from './validate-brain-intake'

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/gi

const CONTEXT_KEYWORDS = [
  'always',
  'never',
  'must',
  'should',
  'do not',
  "don't",
  'policy',
  'rule',
  'principle',
  'thesis',
  'strategy',
  'risk',
  'decision',
  'decided',
  'remember',
]

const DOCUMENT_MIN_LENGTH = 900

export function classifyBrainIntake(input: BrainIntakeClassifyRequest): BrainIntakeClassifyResponse {
  const text = input.text.trim()
  const urls = extractUrls(text)
  const textWithoutUrls = urls.reduce((value, url) => value.replace(url, ''), text).trim()
  const items: BrainIntakeDraftItem[] = []

  urls.forEach((url, index) => {
    items.push({
      id: `source-${index}-${stableHash(url)}`,
      kind: 'source_url',
      destination: 'knowledge_source',
      selected: true,
      title: deriveUrlTitle(url),
      body: url,
      url,
      confidence: 0.96,
      requiresReview: false,
      warnings: [],
      suggestedScope: 'workspace',
      trustLevel: 'observed',
      priority: 'normal',
      freshness: 'unknown',
      recommendedAction: 'store',
      explanation: 'Detected URL and classified it as a source.',
      citations: [{ label: deriveUrlTitle(url), url }],
      extractedFacts: [],
      conflicts: [],
    })
  })

  if (textWithoutUrls) {
    items.push(...classifyTextInput(textWithoutUrls))
  }

  input.files.forEach((file, index) => {
    const textContent = file.text?.trim()
    items.push({
      id: `file-${index}-${stableHash(file.name)}`,
      kind: 'document',
      destination: textContent ? 'knowledge_document' : 'knowledge_document',
      selected: true,
      title: file.name.replace(/\.[^.]+$/, '') || file.name,
      body: textContent || `File dropped: ${file.name}`,
      fileName: file.name,
      mimeType: file.type || null,
      confidence: textContent ? 0.9 : 0.72,
      requiresReview: !textContent,
      warnings: textContent
        ? []
        : ['This file could not be read as text in the browser. Use server extraction or the document uploader before saving it as searchable knowledge.'],
      suggestedScope: 'workspace',
      trustLevel: textContent ? 'operator_approved' : 'observed',
      priority: 'normal',
      freshness: 'unknown',
      recommendedAction: textContent ? 'store' : 'review',
      explanation: textContent
        ? 'Readable file content will be ingested as a document.'
        : 'Unreadable browser file requires extraction before full ingestion.',
      citations: [{ label: file.name, fileName: file.name }],
      extractedFacts: [],
      conflicts: [],
    })
  })

  const compared = compareBrainIntakeItems(items)
  const ranked = validateBrainIntakeItems(rankBrainIntakeItems(compared))
  const preview = buildBrainIntakePreview(ranked)
  return {
    items: ranked,
    ...preview,
  }
}

function classifyTextInput(text: string): BrainIntakeDraftItem[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => !isLowSignalSourceFragment(line))
    .filter(Boolean)
  const hasQuestionLine = lines.some(isRecallQuestion)
  const shouldSegment = lines.length > 1 && lines.length <= 7 && hasQuestionLine
  if (!shouldSegment) return [classifyTextBlock(text)]
  return lines.map(classifyTextBlock)
}

function classifyTextBlock(text: string): BrainIntakeDraftItem {
  const normalized = text.toLowerCase()
  const isQuestion = isRecallQuestion(text)
  const isDocument = text.length >= DOCUMENT_MIN_LENGTH || text.split(/\n/).length >= 8
  const isContext = CONTEXT_KEYWORDS.some((keyword) => normalized.includes(keyword))

  if (isQuestion && text.length < 500) {
    return createItem({
      kind: 'recall_question',
      destination: 'recall_test',
      title: 'Recall test',
      body: text,
      confidence: 0.92,
    })
  }

  if (isDocument) {
    return createItem({
      kind: 'document',
      destination: 'knowledge_document',
      title: deriveTitle(text, 'Document'),
      body: text,
      confidence: 0.86,
    })
  }

  if (isContext) {
    const recordType = classifyContextRecordType(normalized)
    return createItem({
      kind: 'instruction',
      destination: 'context',
      title: deriveTitle(text, contextTitlePrefix(recordType)),
      body: text,
      contextRecordType: recordType,
      confidence: 0.84,
      requiresReview: recordType === 'risk' || recordType === 'policy',
    })
  }

  return createItem({
    kind: 'fact',
    destination: 'knowledge_fact',
    title: deriveTitle(text, 'Fact'),
    body: text,
    confidence: 0.78,
  })
}

function isRecallQuestion(text: string): boolean {
  return /\?$/.test(text.trim()) || /^(what|who|where|when|why|how|can|do|does|should|is|are)\b/i.test(text)
}

function isLowSignalSourceFragment(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!normalized) return true
  if (normalized.length > 80) return false
  return /\b(docs|documentation|source|sources|link|links|url|urls)\b/.test(normalized) &&
    /\b(here|at|live|lives|is|are|see|read|available)\b/.test(normalized)
}

function createItem(input: {
  kind: BrainIntakeKind
  destination: BrainIntakeDestination
  title: string
  body: string
  confidence: number
  requiresReview?: boolean
  contextRecordType?: SharedContextRecordType
}): BrainIntakeDraftItem {
  return {
    id: `${input.destination}-${stableHash(`${input.title}:${input.body}`)}`,
    kind: input.kind,
    destination: input.destination,
    selected: true,
    title: input.title,
    body: input.body,
    confidence: input.confidence,
    requiresReview: input.requiresReview ?? false,
    warnings: [],
    contextRecordType: input.contextRecordType,
    suggestedScope: 'workspace',
    trustLevel: input.destination === 'context' ? 'operator_approved' : 'observed',
    priority: 'normal',
    freshness: 'unknown',
    recommendedAction: input.destination === 'recall_test' ? 'test_recall' : 'store',
    explanation: 'Classified by deterministic Brain intake.',
    citations: [],
    extractedFacts: input.destination === 'knowledge_fact'
      ? [{ text: input.body, confidence: input.confidence, citationKeys: [] }]
      : [],
    conflicts: [],
  }
}

function classifyContextRecordType(normalized: string): SharedContextRecordType {
  if (/\b(risk|danger|blocker|concern|avoid|unsafe|compliance)\b/.test(normalized)) return 'risk'
  if (/\b(decided|decision|we will|we chose|approved)\b/.test(normalized)) return 'decision'
  if (/\b(policy|rule|must|never|always|required|do not|don't)\b/.test(normalized)) return 'policy'
  if (/\b(question|unknown|figure out|need to know)\b/.test(normalized)) return 'open_question'
  if (/\b(signal|trend|market|customer says|competitor)\b/.test(normalized)) return 'signal'
  if (/\b(thesis|strategy|positioning|belief|we believe)\b/.test(normalized)) return 'thesis'
  return 'memory'
}

function contextTitlePrefix(type: SharedContextRecordType): string {
  if (type === 'policy') return 'Policy'
  if (type === 'risk') return 'Risk'
  if (type === 'decision') return 'Decision'
  if (type === 'open_question') return 'Open question'
  if (type === 'signal') return 'Signal'
  if (type === 'thesis') return 'Thesis'
  return 'Context'
}

function extractUrls(text: string): string[] {
  return Array.from(new Set(text.match(URL_PATTERN) ?? [])).map((url) => url.replace(/[.,;:!?]+$/, ''))
}

function deriveUrlTitle(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return 'Source URL'
  }
}

function deriveTitle(text: string, fallback: string): string {
  const firstLine = text
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean)
  if (!firstLine) return fallback
  const cleaned = firstLine.replace(/^[-*#\s]+/, '').trim()
  if (cleaned.length <= 80) return cleaned
  return `${cleaned.slice(0, 77).trim()}...`
}

function stableHash(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}
