import crypto from 'node:crypto'

import type { KnowledgeImportPayloadItem } from '@contracts/knowledge-imports'
import type { KnowledgeImportSourceType, ParsedKnowledgeImportItem } from './types'

const MAX_CHUNK_CHARS = 6_000
const MAX_ITEMS = 100
type RawTextChunk = {
  index: number
  parser: string
  title?: string
  content: string
}

export function parseKnowledgeImportPayload(input: {
  sourceType: KnowledgeImportSourceType
  rawText?: string | null
  items?: KnowledgeImportPayloadItem[] | null
  metadata?: Record<string, unknown>
}): ParsedKnowledgeImportItem[] {
  const parsedItems: ParsedKnowledgeImportItem[] = []

  for (const item of input.items ?? []) {
    const content = normalizeImportContent(item.content)
    if (!content) continue
    parsedItems.push({
      key: sanitizeItemKey(item.key ?? stableItemKey(content, parsedItems.length)),
      type: normalizeItemType(item.type),
      title: normalizeTitle(item.title, parsedItems.length),
      content,
      metadata: {
        ...input.metadata,
        ...item.metadata,
        parser: 'explicit_items',
      },
    })
  }

  const rawText = normalizeImportContent(input.rawText ?? '')
  if (rawText) {
    for (const chunk of splitRawTextIntoChunks(rawText)) {
      parsedItems.push({
        key: sanitizeItemKey(stableItemKey(chunk.content, parsedItems.length)),
        type: inferItemType(input.sourceType),
        title: chunk.title ?? normalizeTitle(undefined, parsedItems.length),
        content: chunk.content,
        metadata: {
          ...input.metadata,
          parser: chunk.parser,
          chunk_index: chunk.index,
        },
      })
      if (parsedItems.length >= MAX_ITEMS) break
    }
  }

  return uniquifyKeys(parsedItems.slice(0, MAX_ITEMS))
}

function splitRawTextIntoChunks(rawText: string): RawTextChunk[] {
  const structured = parseStructuredText(rawText)
  if (structured.length > 0) return structured

  const headedSections = rawText
    .split(/\n(?=#{1,3}\s+)/g)
    .map((section) => section.trim())
    .filter(Boolean)

  const sections = headedSections.length > 1 ? headedSections : splitByParagraphBudget(rawText)
  return sections.flatMap((section, sectionIndex) => {
    const lines = section.split('\n')
    const heading = lines[0]?.match(/^#{1,3}\s+(.+)$/)
    const body = heading ? lines.slice(1).join('\n').trim() : section
    const title = heading?.[1]?.trim()
    return splitByParagraphBudget(body).map((content, chunkIndex) => {
      const chunk: RawTextChunk = {
        index: sectionIndex + chunkIndex,
        parser: heading ? 'markdown_sections' : 'paragraph_chunks',
        content,
      }
      if (title && chunkIndex === 0) chunk.title = title
      return chunk
    })
  })
}

function parseStructuredText(rawText: string): RawTextChunk[] {
  const trimmed = rawText.trim()
  if (!trimmed) return []

  const jsonItems = parseJsonImportItems(trimmed)
  if (jsonItems.length > 0) return jsonItems

  const delimitedItems = parseDelimitedRecords(trimmed)
  if (delimitedItems.length > 0) return delimitedItems

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length < 2 || !lines.every((line) => line.startsWith('{'))) return []

  const jsonlItems = lines
    .map((line, index) => {
      try {
        const item = parseStructuredObject(JSON.parse(line))
        if (!item) return null
        return structuredChunk(index, 'jsonl_records', item)
      } catch {
        return null
      }
    })
    .filter((item): item is RawTextChunk => Boolean(item))

  return jsonlItems.length > 0 ? jsonlItems : []
}

function parseDelimitedRecords(rawText: string): RawTextChunk[] {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length < 2) return []

  const delimiter = inferDelimiter(lines[0])
  if (!delimiter) return []

  const headers = splitDelimitedLine(lines[0], delimiter).map((header) => header.trim().toLowerCase())
  if (headers.length < 2) return []
  const contentIndex = headers.findIndex((header) => ['content', 'text', 'body', 'message', 'summary', 'transcript'].includes(header))
  if (contentIndex < 0) return []
  const titleIndex = headers.findIndex((header) => ['title', 'subject', 'name', 'id'].includes(header))
  const roleIndex = headers.findIndex((header) => ['role', 'speaker', 'author'].includes(header))
  const timestampIndex = headers.findIndex((header) => ['timestamp', 'created_at', 'createdat', 'time'].includes(header))

  return lines
    .slice(1)
    .map((line, index) => {
      const cells = splitDelimitedLine(line, delimiter)
      const content = cells[contentIndex]?.trim()
      if (!content) return null
      const prefix = [cells[timestampIndex]?.trim(), cells[roleIndex]?.trim()].filter(Boolean).join(' ')
      const item = {
        title: titleIndex >= 0 ? cells[titleIndex]?.trim() : undefined,
        content: prefix ? `${prefix}: ${content}` : content,
      }
      return structuredChunk(index, 'csv_records', item)
    })
    .filter((item): item is RawTextChunk => Boolean(item))
}

function inferDelimiter(headerLine: string): ',' | '\t' | null {
  const commaCount = (headerLine.match(/,/g) ?? []).length
  const tabCount = (headerLine.match(/\t/g) ?? []).length
  if (tabCount > 0 && tabCount >= commaCount) return '\t'
  if (commaCount > 0) return ','
  return null
}

function splitDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
  if (delimiter === '\t') return line.split('\t')
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
      continue
    }
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === delimiter && !quoted) {
      cells.push(current)
      current = ''
      continue
    }
    current += char
  }
  cells.push(current)
  return cells
}

function parseJsonImportItems(rawText: string): RawTextChunk[] {
  if (!rawText.startsWith('{') && !rawText.startsWith('[')) return []
  try {
    const parsed = JSON.parse(rawText) as unknown
    const parsedRecord = readRecord(parsed)
    const records = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsedRecord.items)
        ? parsedRecord.items
        : Array.isArray(parsedRecord.messages)
          ? parsedRecord.messages
          : [parsed]

    return (records as unknown[])
      .map((record, index) => {
        const item = parseStructuredObject(record)
        if (!item) return null
        return structuredChunk(index, 'json_records', item)
      })
      .filter((item): item is RawTextChunk => Boolean(item))
  } catch {
    return []
  }
}

function structuredChunk(
  index: number,
  parser: string,
  item: { title?: string; content: string },
): RawTextChunk {
  const chunk: RawTextChunk = {
    index,
    parser,
    content: item.content,
  }
  if (item.title) chunk.title = item.title
  return chunk
}

function parseStructuredObject(value: unknown): { title?: string; content: string } | null {
  const record = readRecord(value)
  if (Object.keys(record).length === 0) {
    return typeof value === 'string' && value.trim() ? { content: value.trim() } : null
  }

  const content = readFirstString(record, ['content', 'text', 'body', 'message', 'summary', 'transcript'])
  if (!content) return null

  const title = readFirstString(record, ['title', 'subject', 'name', 'id'])
  const role = readFirstString(record, ['role', 'speaker', 'author'])
  const timestamp = readFirstString(record, ['timestamp', 'created_at', 'createdAt', 'time'])
  const prefix = [timestamp, role].filter(Boolean).join(' ')
  return {
    title,
    content: prefix ? `${prefix}: ${content}` : content,
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readFirstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function splitByParagraphBudget(content: string): string[] {
  const paragraphs = content.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
  if (paragraphs.length === 0) return []

  const chunks: string[] = []
  let current = ''
  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph
      continue
    }
    if (current.length + paragraph.length + 2 <= MAX_CHUNK_CHARS) {
      current = `${current}\n\n${paragraph}`
      continue
    }
    chunks.push(current)
    current = paragraph
  }
  if (current) chunks.push(current)

  return chunks.flatMap((chunk) => chunk.length <= MAX_CHUNK_CHARS ? [chunk] : hardSplit(chunk, MAX_CHUNK_CHARS))
}

function hardSplit(content: string, size: number): string[] {
  const chunks: string[] = []
  for (let index = 0; index < content.length; index += size) {
    chunks.push(content.slice(index, index + size).trim())
  }
  return chunks.filter(Boolean)
}

function normalizeImportContent(content: string | null | undefined): string {
  return (content ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function normalizeItemType(type: string | null | undefined): string {
  return (type?.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'document').slice(0, 120)
}

function normalizeTitle(title: string | null | undefined, index: number): string {
  const normalized = title?.trim()
  return normalized ? normalized.slice(0, 500) : `Imported item ${index + 1}`
}

function inferItemType(sourceType: KnowledgeImportSourceType): string {
  if (sourceType === 'channel_transcript' || sourceType === 'meeting_notes') return 'transcript'
  if (sourceType === 'browser_artifact') return 'browser_artifact'
  if (sourceType === 'repo_docs') return 'repo_doc'
  if (sourceType === 'codex_session' || sourceType === 'claude_code_session' || sourceType === 'cursor_export') return 'agent_session'
  return 'document'
}

function stableItemKey(content: string, index: number): string {
  const digest = crypto.createHash('sha256').update(content).digest('hex').slice(0, 24)
  return `item-${index + 1}-${digest}`
}

function sanitizeItemKey(key: string): string {
  const sanitized = key.trim().replace(/[^a-zA-Z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '')
  return (sanitized || 'item').slice(0, 500)
}

function uniquifyKeys(items: ParsedKnowledgeImportItem[]): ParsedKnowledgeImportItem[] {
  const counts = new Map<string, number>()
  return items.map((item) => {
    const count = counts.get(item.key) ?? 0
    counts.set(item.key, count + 1)
    return count === 0 ? item : { ...item, key: `${item.key}-${count + 1}`.slice(0, 500) }
  })
}
