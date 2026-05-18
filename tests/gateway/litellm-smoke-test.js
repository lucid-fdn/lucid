#!/usr/bin/env node
/**
 * Phase 0 — LiteLLM Smoke Test
 *
 * Validates that LiteLLM can handle every model currently served by
 * llm-proxy (Lucid-L2 MODEL_ALIASES) plus the FREE_TIER_MODELS list
 * used for auto-provisioned gateway keys.
 *
 * Usage:
 *   node tests/gateway/litellm-smoke-test.js
 *
 * Reads from .env.local:
 *   LUCIDGATEWAY_PROXY_URL  — e.g. https://litellm.lucid.foundation
 *   LUCIDGATEWAY_MASTER_KEY — admin/master key
 */

const fs = require('fs')
const path = require('path')

// ── Load .env.local ─────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('❌  .env.local not found at', envPath)
    process.exit(1)
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const PROXY_URL = (process.env.LUCIDGATEWAY_PROXY_URL || '').replace(/\/$/, '')
const MASTER_KEY = process.env.LUCIDGATEWAY_MASTER_KEY || ''

if (!PROXY_URL || !MASTER_KEY) {
  console.error('❌  LUCIDGATEWAY_PROXY_URL and LUCIDGATEWAY_MASTER_KEY must be set in .env.local')
  process.exit(1)
}

// ── Model Test Matrix ───────────────────────────────────────────────────────
// Source 1: Lucid-L2 executionGateway MODEL_ALIASES (what llm-proxy handles)
// Source 2: LucidMerged FREE_TIER_MODELS (what gateway keys use)
// Source 3: LucidMerged models.ts fallback models

const MODELS_TO_TEST = [
  // ── Source: Lucid-L2 MODEL_ALIASES (llm-proxy) ──
  // These are the models that llm-proxy currently routes to providers.
  // LiteLLM MUST support all of these for parity.
  { model: 'gpt-3.5-turbo',      source: 'llm-proxy', provider: 'openai',    type: 'chat' },
  { model: 'gpt-4',              source: 'llm-proxy', provider: 'openai',    type: 'chat' },
  { model: 'gpt-4o',             source: 'llm-proxy', provider: 'openai',    type: 'chat' },
  { model: 'claude-3-sonnet-20240229', source: 'llm-proxy', provider: 'anthropic', type: 'chat' },
  { model: 'claude-3-opus-20240229',   source: 'llm-proxy', provider: 'anthropic', type: 'chat' },
  { model: 'gemini/gemini-pro',   source: 'llm-proxy', provider: 'google',   type: 'chat' },
  { model: 'command-r',          source: 'llm-proxy', provider: 'cohere',   type: 'chat' },

  // ── Source: FREE_TIER_MODELS (gateway keys) ──
  // These are already expected to work through LiteLLM since gateway keys use it.
  { model: 'gpt-4o-mini',        source: 'free-tier', provider: 'openai',    type: 'chat' },
  { model: 'claude-3-5-haiku-latest', source: 'free-tier', provider: 'anthropic', type: 'chat' },
  { model: 'gemini/gemini-2.0-flash', source: 'free-tier', provider: 'google', type: 'chat' },
  { model: 'gemini/gemini-1.5-flash', source: 'free-tier', provider: 'google', type: 'chat' },
  { model: 'mistral/mistral-small-latest', source: 'free-tier', provider: 'mistral', type: 'chat' },
  { model: 'groq/llama-3.1-8b-instant', source: 'free-tier', provider: 'groq', type: 'chat' },
  { model: 'groq/mixtral-8x7b-32768', source: 'free-tier', provider: 'groq', type: 'chat' },
  { model: 'deepseek/deepseek-chat', source: 'free-tier', provider: 'deepseek', type: 'chat' },

  // ── Source: FREE_TIER embedding models ──
  { model: 'text-embedding-3-small', source: 'free-tier', provider: 'openai', type: 'embedding' },
  { model: 'text-embedding-ada-002', source: 'free-tier', provider: 'openai', type: 'embedding' },
]

// Models to additionally test with streaming
const STREAMING_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'claude-3-5-haiku-latest',
  'gemini/gemini-2.0-flash',
  'groq/llama-3.1-8b-instant',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

async function testChatCompletion(model, stream = false) {
  const url = `${PROXY_URL}/v1/chat/completions`
  const body = {
    model,
    messages: [{ role: 'user', content: 'Say "pong" and nothing else.' }],
    max_tokens: 10,
    temperature: 0,
    stream,
  }

  const start = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MASTER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const latency = Date.now() - start

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, status: res.status, latency, error: text.slice(0, 200) }
  }

  if (stream) {
    // Read SSE stream to completion
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let chunks = 0
    let fullText = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      const lines = text.split('\n').filter(l => l.startsWith('data: '))
      for (const line of lines) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content || ''
          fullText += delta
          chunks++
        } catch {}
      }
    }
    return { ok: true, status: 200, latency: Date.now() - start, text: fullText, chunks, stream: true }
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content || ''
  const usage = data.usage || {}
  return {
    ok: true,
    status: 200,
    latency,
    text: text.slice(0, 50),
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
  }
}

async function testEmbedding(model) {
  const url = `${PROXY_URL}/v1/embeddings`
  const body = {
    model,
    input: 'Hello world',
  }

  const start = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MASTER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const latency = Date.now() - start

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, status: res.status, latency, error: text.slice(0, 200) }
  }

  const data = await res.json()
  const dims = data.data?.[0]?.embedding?.length || 0
  return { ok: true, status: 200, latency, dimensions: dims }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║         Phase 0: LiteLLM Smoke Test                        ║')
  console.log('║         Validating parity with llm-proxy                   ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`🌐  Proxy URL:  ${PROXY_URL}`)
  console.log(`🔑  Master Key: ${MASTER_KEY.slice(0, 6)}...${MASTER_KEY.slice(-4)}`)
  console.log(`📋  Models:     ${MODELS_TO_TEST.length} total (${MODELS_TO_TEST.filter(m => m.source === 'llm-proxy').length} from llm-proxy, ${MODELS_TO_TEST.filter(m => m.source === 'free-tier').length} from free-tier)`)
  console.log(`🌊  Streaming:  ${STREAMING_MODELS.length} models`)
  console.log()

  const results = []

  // ── Chat completions (non-streaming) ──
  console.log('── Chat Completions (non-streaming) ──────────────────────────')
  for (const entry of MODELS_TO_TEST.filter(m => m.type === 'chat')) {
    process.stdout.write(`  ${entry.model.padEnd(40)} `)
    try {
      const result = await testChatCompletion(entry.model, false)
      if (result.ok) {
        console.log(`✅  ${result.latency}ms  "${result.text}"`)
      } else {
        console.log(`❌  HTTP ${result.status}  ${result.error}`)
      }
      results.push({ ...entry, test: 'chat', ...result })
    } catch (err) {
      console.log(`💥  ${err.message}`)
      results.push({ ...entry, test: 'chat', ok: false, error: err.message })
    }
  }

  // ── Embeddings ──
  console.log()
  console.log('── Embeddings ────────────────────────────────────────────────')
  for (const entry of MODELS_TO_TEST.filter(m => m.type === 'embedding')) {
    process.stdout.write(`  ${entry.model.padEnd(40)} `)
    try {
      const result = await testEmbedding(entry.model)
      if (result.ok) {
        console.log(`✅  ${result.latency}ms  ${result.dimensions} dims`)
      } else {
        console.log(`❌  HTTP ${result.status}  ${result.error}`)
      }
      results.push({ ...entry, test: 'embedding', ...result })
    } catch (err) {
      console.log(`💥  ${err.message}`)
      results.push({ ...entry, test: 'embedding', ok: false, error: err.message })
    }
  }

  // ── Streaming ──
  console.log()
  console.log('── Streaming ─────────────────────────────────────────────────')
  for (const model of STREAMING_MODELS) {
    process.stdout.write(`  ${model.padEnd(40)} `)
    try {
      const result = await testChatCompletion(model, true)
      if (result.ok) {
        console.log(`✅  ${result.latency}ms  ${result.chunks} chunks  "${result.text}"`)
      } else {
        console.log(`❌  HTTP ${result.status}  ${result.error}`)
      }
      results.push({ model, source: 'streaming', test: 'stream', ...result })
    } catch (err) {
      console.log(`💥  ${err.message}`)
      results.push({ model, source: 'streaming', test: 'stream', ok: false, error: err.message })
    }
  }

  // ── Summary ──
  console.log()
  console.log('══════════════════════════════════════════════════════════════')
  const passed = results.filter(r => r.ok)
  const failed = results.filter(r => !r.ok)
  const llmProxyResults = results.filter(r => r.source === 'llm-proxy')
  const llmProxyPassed = llmProxyResults.filter(r => r.ok)

  console.log(`  Total:       ${passed.length}/${results.length} passed`)
  console.log(`  llm-proxy:   ${llmProxyPassed.length}/${llmProxyResults.length} passed  ← CRITICAL for migration`)
  console.log(`  free-tier:   ${results.filter(r => r.source === 'free-tier' && r.ok).length}/${results.filter(r => r.source === 'free-tier').length} passed`)
  console.log(`  streaming:   ${results.filter(r => r.test === 'stream' && r.ok).length}/${results.filter(r => r.test === 'stream').length} passed`)

  if (failed.length > 0) {
    console.log()
    console.log('  ❌ FAILURES:')
    for (const f of failed) {
      console.log(`     ${f.model} (${f.source}) → ${f.error || `HTTP ${f.status}`}`)
    }
  }

  console.log()
  if (llmProxyPassed.length === llmProxyResults.length) {
    console.log('  🟢  ALL llm-proxy models work through LiteLLM — ready for Phase 1')
  } else {
    console.log('  🔴  Some llm-proxy models FAILED — must fix before proceeding')
  }
  console.log()

  // ── Write report ──
  const reportPath = path.resolve(__dirname, '../../docs/PHASE0_SMOKE_TEST_REPORT.md')
  const report = generateReport(results, passed, failed)
  fs.writeFileSync(reportPath, report, 'utf-8')
  console.log(`  📄 Report saved to docs/PHASE0_SMOKE_TEST_REPORT.md`)

  process.exit(failed.length > 0 ? 1 : 0)
}

function generateReport(results, passed, failed) {
  const now = new Date().toISOString()
  let md = `# Phase 0: LiteLLM Smoke Test Report\n\n`
  md += `**Date:** ${now}\n`
  md += `**Proxy:** ${PROXY_URL}\n`
  md += `**Result:** ${passed.length}/${results.length} passed\n\n`

  md += `## Chat Completions\n\n`
  md += `| Model | Source | Provider | Status | Latency |\n`
  md += `|-------|--------|----------|--------|---------|\n`
  for (const r of results.filter(r => r.test === 'chat')) {
    md += `| \`${r.model}\` | ${r.source} | ${r.provider} | ${r.ok ? '✅' : '❌'} | ${r.latency || '-'}ms |\n`
  }

  md += `\n## Embeddings\n\n`
  md += `| Model | Status | Dimensions | Latency |\n`
  md += `|-------|--------|------------|---------|\n`
  for (const r of results.filter(r => r.test === 'embedding')) {
    md += `| \`${r.model}\` | ${r.ok ? '✅' : '❌'} | ${r.dimensions || '-'} | ${r.latency || '-'}ms |\n`
  }

  md += `\n## Streaming\n\n`
  md += `| Model | Status | Chunks | Latency |\n`
  md += `|-------|--------|--------|---------|\n`
  for (const r of results.filter(r => r.test === 'stream')) {
    md += `| \`${r.model}\` | ${r.ok ? '✅' : '❌'} | ${r.chunks || '-'} | ${r.latency || '-'}ms |\n`
  }

  if (failed.length > 0) {
    md += `\n## Failures\n\n`
    for (const f of failed) {
      md += `- **${f.model}** (${f.source}): ${f.error || `HTTP ${f.status}`}\n`
    }
  }

  md += `\n## Conclusion\n\n`
  const llmProxyFails = failed.filter(f => f.source === 'llm-proxy')
  if (llmProxyFails.length === 0) {
    md += `All llm-proxy models work through LiteLLM. **Ready for Phase 1.**\n`
  } else {
    md += `${llmProxyFails.length} llm-proxy model(s) failed. These must be fixed before proceeding:\n\n`
    for (const f of llmProxyFails) {
      md += `- \`${f.model}\`: ${f.error || `HTTP ${f.status}`}\n`
    }
  }

  return md
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})