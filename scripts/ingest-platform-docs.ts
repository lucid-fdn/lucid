#!/usr/bin/env npx tsx
/**
 * Ingest Platform Documentation as System-Scope RAG Documents
 *
 * Reads all markdown files from docs/platform/ and ingests them into the
 * RAG knowledge base with scope='system' — visible to ALL orgs.
 *
 * Usage:
 *   npx tsx scripts/ingest-platform-docs.ts              # Ingest all docs
 *   npx tsx scripts/ingest-platform-docs.ts --dry-run    # Preview without ingesting
 *   npx tsx scripts/ingest-platform-docs.ts --clean      # Delete existing system docs first
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL    — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   — Service role key (bypasses RLS)
 *   OPENAI_API_KEY              — For generating embeddings (text-embedding-3-small)
 *                                 Falls back to TRUSTGATE_API_KEY + LUCID_API_BASE_URL if not set
 *
 * This script is self-contained and does NOT import from src/ — it can run
 * independently for use in a separate docs repo.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })
// Standalone maintenance script: intentionally avoids importing app-only Supabase helpers.
// eslint-disable-next-line no-restricted-imports
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, basename, dirname } from 'path'

// ── Config ──────────────────────────────────────────────────────────────

const DOCS_DIR = join(__dirname, '..', 'docs', 'platform')
const CHUNK_SIZE = 2000 // chars
const CHUNK_OVERLAP = 200 // chars
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536
const BATCH_SIZE = 50
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000' // sentinel for system docs
const EMBEDDING_REQUEST_TIMEOUT_MS = readPositiveInt(process.env.PLATFORM_DOCS_EMBEDDING_TIMEOUT_MS, 30_000)

// ── Args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const CLEAN = args.includes('--clean')

// ── Supabase Client ─────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const openaiKey = process.env.OPENAI_API_KEY
const trustgateKey = (process.env.TRUSTGATE_API_KEY || '').replace(/\\n$/, '')
const lucidApiBase = (process.env.LUCID_API_BASE_URL || 'https://api.lucid.foundation').replace(/\\n$/, '')

// Resolve embedding endpoint: OpenAI direct or TrustGate proxy
const embeddingApiUrl = openaiKey
  ? 'https://api.openai.com/v1/embeddings'
  : `${lucidApiBase}/v1/embeddings`
const embeddingApiKey = openaiKey || trustgateKey

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!embeddingApiKey) {
  console.error('Missing OPENAI_API_KEY or TRUSTGATE_API_KEY (needed for embeddings)')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ── Markdown Discovery ──────────────────────────────────────────────────

interface DocFile {
  path: string
  relativePath: string
  title: string
  category: string
  content: string
}

function discoverDocs(dir: string): DocFile[] {
  const docs: DocFile[] = []

  function walk(currentDir: string) {
    const entries = readdirSync(currentDir)
    for (const entry of entries) {
      const fullPath = join(currentDir, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (entry.endsWith('.md') && entry !== 'README.md') {
        const content = readFileSync(fullPath, 'utf-8')
        const rel = relative(dir, fullPath)
        const category = dirname(rel).replace(/\//g, ' > ')
        const titleMatch = content.match(/^#\s+(.+)$/m)
        const title = titleMatch ? titleMatch[1] : basename(entry, '.md')

        docs.push({
          path: fullPath,
          relativePath: rel,
          title,
          category: category === '.' ? 'General' : category,
          content,
        })
      }
    }
  }

  walk(dir)
  return docs
}

// ── Markdown-Aware Chunking ─────────────────────────────────────────────

interface Chunk {
  text: string
  index: number
  sectionHeading: string | null
}

function chunkMarkdown(content: string): Chunk[] {
  const chunks: Chunk[] = []
  let chunkIndex = 0

  // Split by headings (## and below)
  const sections = content.split(/(?=^#{2,4}\s)/m)

  for (const section of sections) {
    const headingMatch = section.match(/^(#{2,4})\s+(.+)$/m)
    const sectionHeading = headingMatch ? headingMatch[2].trim() : null
    const sectionText = section.trim()

    if (!sectionText) continue

    if (sectionText.length <= CHUNK_SIZE) {
      chunks.push({ text: sectionText, index: chunkIndex++, sectionHeading })
    } else {
      // Split by paragraphs, respecting code blocks
      const paragraphs = splitPreservingCodeBlocks(sectionText)
      let buffer = ''

      for (const para of paragraphs) {
        if (buffer.length + para.length + 2 > CHUNK_SIZE && buffer) {
          chunks.push({ text: buffer.trim(), index: chunkIndex++, sectionHeading })
          // Keep overlap from end of previous chunk
          const words = buffer.split(/\s+/)
          const overlapWords = Math.ceil(CHUNK_OVERLAP / 5) // rough word estimate
          buffer = words.slice(-overlapWords).join(' ') + '\n\n' + para
        } else {
          buffer += (buffer ? '\n\n' : '') + para
        }
      }

      if (buffer.trim()) {
        chunks.push({ text: buffer.trim(), index: chunkIndex++, sectionHeading })
      }
    }
  }

  return chunks
}

function splitPreservingCodeBlocks(text: string): string[] {
  const parts: string[] = []
  const codeBlockRegex = /```[\s\S]*?```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Text before code block
    const before = text.slice(lastIndex, match.index).trim()
    if (before) {
      parts.push(...before.split(/\n{2,}/).filter(Boolean))
    }
    // Code block as one unit
    parts.push(match[0])
    lastIndex = match.index + match[0].length
  }

  // Remaining text
  const remaining = text.slice(lastIndex).trim()
  if (remaining) {
    parts.push(...remaining.split(/\n{2,}/).filter(Boolean))
  }

  return parts
}

// ── Embeddings ──────────────────────────────────────────────────────────

async function generateEmbeddings(
  texts: string[],
): Promise<{ embeddings: number[][]; tokens: number }> {
  const response = await fetch(embeddingApiUrl, {
    method: 'POST',
    signal: AbortSignal.timeout(EMBEDDING_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${embeddingApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Embedding API error: ${response.status} ${err}`)
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>
    usage: { total_tokens: number }
  }

  return {
    embeddings: data.data.map((d) => d.embedding),
    tokens: data.usage.total_tokens,
  }
}

// ── Context Prefix ──────────────────────────────────────────────────────

function buildContextPrefix(
  docTitle: string,
  sectionHeading: string | null,
): string {
  let prefix = `Document: ${docTitle}`
  if (sectionHeading) {
    prefix += ` > Section: ${sectionHeading}`
  }
  return prefix + '\n\n'
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

// ── Clean Existing System Docs ──────────────────────────────────────────

async function cleanSystemDocs(): Promise<number> {
  const { data, error } = await supabase
    .from('rag_documents')
    .delete()
    .eq('scope', 'system')
    .select('id')

  if (error) {
    throw new Error(`Failed to clean system docs: ${error.message}`)
  }

  return data?.length || 0
}

// ── Ingest a Single Document ────────────────────────────────────────────

async function ingestDoc(doc: DocFile): Promise<{ chunks: number; tokens: number }> {
  // 1. Insert document record
  const { data: docRow, error: insertError } = await supabase
    .from('rag_documents')
    .insert({
      org_id: null,
      user_id: SYSTEM_USER_ID,
      title: doc.title,
      scope: 'system',
      source_type: 'api',
      file_name: doc.relativePath,
      raw_content: doc.content,
      status: 'processing',
      metadata: { category: doc.category, source: 'platform-docs' },
    })
    .select('id')
    .single()

  if (insertError || !docRow) {
    throw new Error(`Failed to insert doc "${doc.title}": ${insertError?.message}`)
  }

  const documentId = docRow.id

  // 2. Chunk
  const chunks = chunkMarkdown(doc.content)

  // 3. Embed in batches
  let totalTokens = 0
  const allRows: Array<Record<string, unknown>> = []

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)
    const texts = batch.map((c) => {
      const prefix = buildContextPrefix(doc.title, c.sectionHeading)
      return `${prefix}${c.text}`
    })

    const { embeddings, tokens } = await generateEmbeddings(texts)
    totalTokens += tokens

    for (let j = 0; j < batch.length; j++) {
      allRows.push({
        document_id: documentId,
        org_id: null,
        project_id: null,
        scope: 'system',
        content: batch[j].text,
        chunk_index: batch[j].index,
        embedding: `[${embeddings[j].join(',')}]`,
        token_count: Math.ceil(batch[j].text.length / 4),
        metadata: {
          category: doc.category,
          section_heading: batch[j].sectionHeading,
        },
      })
    }
  }

  // 4. Insert chunks
  const { error: chunkError } = await supabase.from('rag_chunks').insert(allRows)
  if (chunkError) {
    throw new Error(`Failed to insert chunks for "${doc.title}": ${chunkError.message}`)
  }

  // 5. Update document status
  await supabase
    .from('rag_documents')
    .update({
      status: 'ready',
      chunk_count: chunks.length,
      total_tokens: totalTokens,
    })
    .eq('id', documentId)

  return { chunks: chunks.length, tokens: totalTokens }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('Lucid Platform Docs — RAG Ingestion')
  console.log('====================================\n')

  // Discover docs
  const docs = discoverDocs(DOCS_DIR)
  console.log(`Found ${docs.length} documents in docs/platform/\n`)

  for (const doc of docs) {
    const chunks = chunkMarkdown(doc.content)
    console.log(`  ${doc.relativePath}`)
    console.log(`    Title: ${doc.title}`)
    console.log(`    Category: ${doc.category}`)
    console.log(`    Chunks: ${chunks.length}`)
    console.log()
  }

  if (DRY_RUN) {
    const totalChunks = docs.reduce((sum, d) => sum + chunkMarkdown(d.content).length, 0)
    console.log(`DRY RUN — ${docs.length} docs, ${totalChunks} total chunks`)
    console.log('Run without --dry-run to ingest.')
    return
  }

  // Clean existing system docs if requested
  if (CLEAN) {
    console.log('Cleaning existing system docs...')
    const deleted = await cleanSystemDocs()
    console.log(`  Deleted ${deleted} existing system documents\n`)
  }

  // Ingest
  let totalChunks = 0
  let totalTokens = 0
  let errors = 0

  for (const doc of docs) {
    process.stdout.write(`  Ingesting "${doc.title}"...`)
    try {
      const result = await ingestDoc(doc)
      totalChunks += result.chunks
      totalTokens += result.tokens
      console.log(` ${result.chunks} chunks, ${result.tokens} tokens`)
    } catch (err) {
      errors++
      console.log(` ERROR: ${(err as Error).message}`)
    }
  }

  console.log('\n====================================')
  console.log(`Done: ${docs.length - errors} docs, ${totalChunks} chunks, ${totalTokens} tokens`)
  if (errors > 0) {
    console.log(`  ${errors} errors`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
