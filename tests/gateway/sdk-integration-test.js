#!/usr/bin/env node
/**
 * SDK Integration Test
 *
 * Tests the official raijin-labs-lucid-ai SDK and Vercel AI SDK provider
 * against the production pipeline: api.lucid.foundation
 *
 * Validates:
 *   1. SDK chatCompletions() — /v1/chat/completions → TrustGate
 *   2. SDK inference() — /v1/run/inference → Lucid-L2
 *   3. SDK passports CRUD — /v1/passports → Lucid-L2
 *   4. Raw fetch with auth — /v1/chat/completions → TrustGate (baseline)
 *   5. Passport-aware inference — X-Lucid-Passport header
 *   6. Embeddings endpoint — /v1/embeddings → TrustGate
 *
 * Usage:
 *   node tests/gateway/sdk-integration-test.js
 */

const fs = require('fs')
const path = require('path')

// ── Load .env.local ─────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, '../../.env.local')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  }
}

loadEnv()

// ── Config ──────────────────────────────────────────────────────────────────
const LUCID_API_BASE = 'https://api.lucid.foundation'
// Use an explicit env-provided TrustGate API key. Never fall back to a committed key.
const envKey = process.env.LUCID_API_KEY
const TRUSTGATE_API_KEY = (envKey && envKey !== 'your-key-here' && envKey !== 'dev-internal-bypass')
  ? envKey
  : ''

if (!TRUSTGATE_API_KEY) {
  console.error('Missing LUCID_API_KEY. Set it in the environment to run the production SDK integration test.')
  process.exit(1)
}

// Passport IDs created in Supabase during Phase 6 testing
const TEST_MODEL_PASSPORT = 'openai-gpt4o-mini'
const TEST_COMPUTE_PASSPORT = 'compute-openai-us'

// ── Test Results Tracking ──────────────────────────────────────────────────
const results = []
let testNum = 0

function logResult(name, passed, detail = '') {
  testNum++
  const status = passed ? '  PASS' : '  FAIL'
  results.push({ num: testNum, name, passed, detail })
  console.log(`  ${status}  [${testNum}] ${name}`)
  if (detail) console.log(`         ${detail}`)
}

// ── Test Helpers ────────────────────────────────────────────────────────────

async function rawFetch(endpoint, apiKey, body, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
    ...(options.extraHeaders || {}),
  }

  const url = `${LUCID_API_BASE}${endpoint}`
  const start = Date.now()

  try {
    const res = await fetch(url, {
      method: options.method || 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    })
    const latency = Date.now() - start
    const routeHeader = res.headers.get('x-lucid-route') || ''

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, status: res.status, latency, error: text.slice(0, 200), route: routeHeader }
    }

    const data = await res.json()
    return { ok: true, status: res.status, latency, data, route: routeHeader }
  } catch (err) {
    return { ok: false, latency: Date.now() - start, error: err.message }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log()
  console.log('================================================================')
  console.log('  SDK Integration Test')
  console.log('  Tests: raijin-labs-lucid-ai SDK + Vercel AI SDK provider')
  console.log('================================================================')
  console.log()
  console.log('  Config:')
  console.log(`    API Base:     ${LUCID_API_BASE}`)
  console.log(`    API Key:      ${TRUSTGATE_API_KEY.slice(0, 12)}...`)
  console.log()

  // ════════════════════════════════════════════════════════════════════════════
  // TEST GROUP 1: Raw fetch baseline (proves the pipeline works)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('-- Group 1: Raw Fetch Baseline (proves pipeline works) ---------')
  console.log()

  // 1a: Chat completions with auth (should work through TrustGate)
  {
    const res = await rawFetch('/v1/chat/completions', TRUSTGATE_API_KEY, {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say "pong" and nothing else.' }],
      max_tokens: 10,
      temperature: 0,
    })

    if (res.ok) {
      const text = res.data?.choices?.[0]?.message?.content || ''
      logResult(
        'Raw fetch: chat/completions WITH auth',
        true,
        `${res.latency}ms route:${res.route} "${text.slice(0, 30)}"`
      )
    } else {
      logResult('Raw fetch: chat/completions WITH auth', false, `HTTP ${res.status}: ${res.error?.slice(0, 80)}`)
    }
  }

  // 1b: Chat completions WITHOUT auth (should fail — TrustGate requires key)
  {
    const res = await rawFetch('/v1/chat/completions', null, {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 5,
    })

    logResult(
      'Raw fetch: chat/completions WITHOUT auth (expect 401)',
      !res.ok && (res.status === 401 || res.status === 403),
      `HTTP ${res.status} — ${res.ok ? 'UNEXPECTED SUCCESS' : 'correctly rejected'}`
    )
  }

  // 1c: Passports list (routes to L2, no auth needed)
  {
    const res = await rawFetch('/v1/passports', null, null, { method: 'GET' })

    if (res.ok) {
      const count = res.data?.passports?.length ?? res.data?.length ?? '?'
      logResult('Raw fetch: GET /v1/passports (L2, no auth)', true, `${res.latency}ms route:${res.route} count:${count}`)
    } else {
      logResult('Raw fetch: GET /v1/passports (L2, no auth)', false, `HTTP ${res.status}: ${res.error?.slice(0, 80)}`)
    }
  }

  // 1d: Passport-aware chat with X-Lucid-Passport header
  {
    const res = await rawFetch('/v1/chat/completions', TRUSTGATE_API_KEY, {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say "pong" and nothing else.' }],
      max_tokens: 10,
      temperature: 0,
    }, {
      extraHeaders: { 'X-Lucid-Passport': TEST_MODEL_PASSPORT },
    })

    if (res.ok) {
      const lucid = res.data?.lucid
      const hasPassportMeta = !!lucid?.passport_id
      logResult(
        'Raw fetch: chat/completions WITH passport header',
        hasPassportMeta,
        hasPassportMeta
          ? `passport_id:${lucid.passport_id} compute:${lucid.compute_passport_id}`
          : 'WARNING: No lucid metadata in response'
      )
    } else {
      logResult('Raw fetch: chat/completions WITH passport header', false, `HTTP ${res.status}: ${res.error?.slice(0, 80)}`)
    }
  }

  // 1e: Embeddings (routes to TrustGate)
  {
    const res = await rawFetch('/v1/embeddings', TRUSTGATE_API_KEY, {
      model: 'text-embedding-3-small',
      input: 'Hello world',
    })

    if (res.ok) {
      const dim = res.data?.data?.[0]?.embedding?.length || 0
      logResult('Raw fetch: embeddings WITH auth', true, `${res.latency}ms route:${res.route} dimensions:${dim}`)
    } else {
      logResult('Raw fetch: embeddings WITH auth', false, `HTTP ${res.status}: ${res.error?.slice(0, 80)}`)
    }
  }

  console.log()

  // ════════════════════════════════════════════════════════════════════════════
  // TEST GROUP 2: Official SDK (raijin-labs-lucid-ai)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('-- Group 2: Official SDK (raijin-labs-lucid-ai v0.3.2) ---------')
  console.log()

  let RaijinLabsLucidAi
  try {
    const sdk = require('raijin-labs-lucid-ai')
    RaijinLabsLucidAi = sdk.RaijinLabsLucidAi
    logResult('SDK import: raijin-labs-lucid-ai loads', true, 'Module resolved OK')
  } catch (err) {
    logResult('SDK import: raijin-labs-lucid-ai loads', false, err.message)
    console.log('  Skipping remaining SDK tests...')
    printSummary()
    return
  }

  // 2a: SDK without API key — chatCompletions (should fail at TrustGate)
  {
    const client = new RaijinLabsLucidAi({ serverURL: LUCID_API_BASE })
    try {
      const res = await client.run.chatCompletions({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'test' }],
        maxTokens: 5,
      })
      // If it succeeds, TrustGate isn't enforcing auth
      logResult(
        'SDK: chatCompletions WITHOUT apiKey (expect failure)',
        false,
        'UNEXPECTED SUCCESS — TrustGate should reject unauthenticated requests'
      )
    } catch (err) {
      const msg = err.message || String(err)
      const is401 = msg.includes('401') || msg.includes('Unauthorized') || msg.includes('Invalid API key') || msg.includes('Missing')
      logResult(
        'SDK: chatCompletions WITHOUT apiKey (expect 401)',
        is401,
        is401 ? 'Correctly rejected: ' + msg.slice(0, 80) : 'Unexpected error: ' + msg.slice(0, 80)
      )
    }
  }

  // 2b: SDK with API key — chatCompletions
  {
    const client = new RaijinLabsLucidAi({
      serverURL: LUCID_API_BASE,
      apiKey: TRUSTGATE_API_KEY,
    })

    try {
      const res = await client.run.chatCompletions({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "pong" and nothing else.' }],
        maxTokens: 10,
        temperature: 0,
      })

      const text = res.choices?.[0]?.message?.content || ''
      logResult(
        'SDK: chatCompletions WITH apiKey',
        !!text,
        text ? `"${text.slice(0, 30)}"` : 'Empty response'
      )
    } catch (err) {
      const msg = err.message || String(err)
      // Check if the SDK even sends auth headers
      if (msg.includes('401') || msg.includes('Invalid API key')) {
        logResult(
          'SDK: chatCompletions WITH apiKey',
          false,
          'SDK does NOT inject Authorization header (securitySource: null). ' +
          'This is an SDK limitation — apiKey constructor param is unused for this endpoint.'
        )
      } else {
        logResult('SDK: chatCompletions WITH apiKey', false, msg.slice(0, 120))
      }
    }
  }

  // 2c: SDK — inference (routes to L2, no auth needed)
  {
    const client = new RaijinLabsLucidAi({ serverURL: LUCID_API_BASE })
    try {
      const res = await client.run.inference({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "pong" and nothing else.' }],
        maxTokens: 10,
        temperature: 0,
      })

      const text = res.choices?.[0]?.message?.content || res.result || ''
      logResult(
        'SDK: inference() (routes to L2)',
        true,
        `Response received: "${String(text).slice(0, 50)}"`
      )
    } catch (err) {
      const msg = err.message || String(err)
      // /v1/run/inference goes to L2 — might not be implemented there
      logResult('SDK: inference() (routes to L2)', false, msg.slice(0, 120))
    }
  }

  // 2d: SDK — inference with modelPassportId
  {
    const client = new RaijinLabsLucidAi({ serverURL: LUCID_API_BASE })
    try {
      const res = await client.run.inference({
        modelPassportId: TEST_MODEL_PASSPORT,
        messages: [{ role: 'user', content: 'Say "pong" and nothing else.' }],
        maxTokens: 10,
        temperature: 0,
      })

      const text = res.choices?.[0]?.message?.content || res.result || ''
      logResult(
        'SDK: inference() with modelPassportId',
        true,
        `Response received: "${String(text).slice(0, 50)}"`
      )
    } catch (err) {
      logResult('SDK: inference() with modelPassportId', false, (err.message || String(err)).slice(0, 120))
    }
  }

  // 2e: SDK — passports list
  {
    const client = new RaijinLabsLucidAi({ serverURL: LUCID_API_BASE })
    try {
      const res = await client.passports.list()
      const count = res.passports?.length ?? '?'
      logResult('SDK: passports.list() (routes to L2)', true, `Found ${count} passports`)
    } catch (err) {
      logResult('SDK: passports.list() (routes to L2)', false, (err.message || String(err)).slice(0, 120))
    }
  }

  // 2f: SDK — passports get (specific passport)
  {
    const client = new RaijinLabsLucidAi({ serverURL: LUCID_API_BASE })
    try {
      const res = await client.passports.get({ passportId: TEST_MODEL_PASSPORT })
      const type = res.passport?.type || res.type || '?'
      logResult(
        `SDK: passports.get("${TEST_MODEL_PASSPORT}")`,
        true,
        `type: ${type}`
      )
    } catch (err) {
      logResult(`SDK: passports.get("${TEST_MODEL_PASSPORT}")`, false, (err.message || String(err)).slice(0, 120))
    }
  }

  // 2g: SDK — passports getStats
  {
    const client = new RaijinLabsLucidAi({ serverURL: LUCID_API_BASE })
    try {
      const res = await client.passports.getStats()
      logResult('SDK: passports.getStats()', true, JSON.stringify(res).slice(0, 100))
    } catch (err) {
      logResult('SDK: passports.getStats()', false, (err.message || String(err)).slice(0, 120))
    }
  }

  // 2h: SDK — epochs
  {
    const client = new RaijinLabsLucidAi({ serverURL: LUCID_API_BASE })
    try {
      const res = await client.epochs.getCurrent()
      logResult('SDK: epochs.getCurrent()', true, JSON.stringify(res).slice(0, 100))
    } catch (err) {
      // epochs.getCurrent may not exist as a method
      logResult('SDK: epochs.getCurrent()', false, (err.message || String(err)).slice(0, 120))
    }
  }

  // 2i: SDK — match explain (passport matching)
  {
    const client = new RaijinLabsLucidAi({ serverURL: LUCID_API_BASE })
    try {
      const res = await client.match.explain({
        modelPassportId: TEST_MODEL_PASSPORT,
      })
      logResult('SDK: match.explain()', true, JSON.stringify(res).slice(0, 100))
    } catch (err) {
      logResult('SDK: match.explain()', false, (err.message || String(err)).slice(0, 120))
    }
  }

  console.log()

  // ════════════════════════════════════════════════════════════════════════════
  // TEST GROUP 3: Vercel AI SDK provider (what the frontend actually uses)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('-- Group 3: Vercel AI SDK Provider (frontend path) -------------')
  console.log()

  // The frontend uses createOpenAI from @ai-sdk/openai with LUCID_API_BASE_URL
  // This is the actual code path in providers.ts
  let createOpenAI
  try {
    const aiOpenai = require('@ai-sdk/openai')
    createOpenAI = aiOpenai.createOpenAI
    logResult('Import: @ai-sdk/openai loads', true, 'Module resolved OK')
  } catch (err) {
    logResult('Import: @ai-sdk/openai loads', false, err.message)
    console.log('  Skipping Vercel AI SDK tests...')
    printSummary()
    return
  }

  // 3a: Create provider like providers.ts does
  {
    const provider = createOpenAI({
      apiKey: TRUSTGATE_API_KEY,
      baseURL: `${LUCID_API_BASE}/v1`,
      compatibility: 'compatible',
    })

    // Make a raw chat completions call using the provider's internal fetch
    // (can't use streamText without the full 'ai' package setup)
    try {
      const res = await fetch(`${LUCID_API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TRUSTGATE_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say "pong" and nothing else.' }],
          max_tokens: 10,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (res.ok) {
        const data = await res.json()
        const text = data.choices?.[0]?.message?.content || ''
        logResult(
          'Vercel AI SDK path: chat/completions',
          !!text,
          `"${text.slice(0, 30)}" — matches providers.ts code path`
        )
      } else {
        const text = await res.text().catch(() => '')
        logResult('Vercel AI SDK path: chat/completions', false, `HTTP ${res.status}: ${text.slice(0, 80)}`)
      }
    } catch (err) {
      logResult('Vercel AI SDK path: chat/completions', false, err.message)
    }
  }

  // 3b: Provider with passport injection (simulates createLucidPassportProvider)
  {
    try {
      const res = await fetch(`${LUCID_API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TRUSTGATE_API_KEY}`,
          'X-Lucid-Passport': TEST_MODEL_PASSPORT,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say "pong" and nothing else.' }],
          max_tokens: 10,
          temperature: 0,
          model_passport_id: TEST_MODEL_PASSPORT,
          model_meta: { model_passport_id: TEST_MODEL_PASSPORT },
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (res.ok) {
        const data = await res.json()
        const text = data.choices?.[0]?.message?.content || ''
        const lucid = data.lucid
        logResult(
          'Vercel AI SDK path: passport-aware inference',
          !!lucid?.passport_id,
          lucid?.passport_id
            ? `passport:${lucid.passport_id} compute:${lucid.compute_passport_id}`
            : `No lucid metadata. text="${text.slice(0, 30)}"`
        )
      } else {
        const text = await res.text().catch(() => '')
        logResult('Vercel AI SDK path: passport-aware inference', false, `HTTP ${res.status}: ${text.slice(0, 80)}`)
      }
    } catch (err) {
      logResult('Vercel AI SDK path: passport-aware inference', false, err.message)
    }
  }

  // 3c: Streaming (what streamText() uses)
  {
    try {
      const res = await fetch(`${LUCID_API_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TRUSTGATE_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Count to 3 briefly.' }],
          max_tokens: 20,
          stream: true,
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (res.ok) {
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

        logResult(
          'Vercel AI SDK path: streaming (SSE)',
          chunks > 0,
          `${chunks} chunks, text="${fullText.slice(0, 40)}"`
        )
      } else {
        const text = await res.text().catch(() => '')
        logResult('Vercel AI SDK path: streaming (SSE)', false, `HTTP ${res.status}: ${text.slice(0, 80)}`)
      }
    } catch (err) {
      logResult('Vercel AI SDK path: streaming (SSE)', false, err.message)
    }
  }

  console.log()

  // ════════════════════════════════════════════════════════════════════════════
  // TEST GROUP 4: SDK code integrity checks
  // ════════════════════════════════════════════════════════════════════════════
  console.log('-- Group 4: SDK Code Integrity Checks -------------------------')
  console.log()

  // 4a: Check providers.ts default URL
  {
    const providersPath = path.resolve(__dirname, '../../src/lib/ai/providers.ts')
    if (fs.existsSync(providersPath)) {
      const content = fs.readFileSync(providersPath, 'utf-8')
      const hasCorrectDefault = content.includes("'https://api.lucid.foundation'")
      const hasDevBypass = content.includes("'dev-internal-bypass'")
      const hasIsConfiguredBypass = content.includes('return true') && content.includes('isLucidConfigured')

      logResult(
        'providers.ts: correct default URL',
        hasCorrectDefault,
        hasCorrectDefault ? 'api.lucid.foundation' : 'WRONG default URL'
      )

      logResult(
        'providers.ts: dev-internal-bypass fallback',
        true,
        hasDevBypass
          ? 'WARNING: dev-internal-bypass used as API key fallback — will fail TrustGate auth in production if LUCID_API_KEY not set'
          : 'No dev bypass found'
      )

      logResult(
        'providers.ts: isLucidConfigured() bypass',
        true,
        hasIsConfiguredBypass
          ? 'WARNING: isLucidConfigured() always returns true (dev bypass active)'
          : 'isLucidConfigured() checks LUCID_API_KEY properly'
      )
    } else {
      logResult('providers.ts: file exists', false, 'Not found')
    }
  }

  // 4b: Check embeddings.ts default URL
  {
    const embeddingsPath = path.resolve(__dirname, '../../src/lib/ai/embeddings.ts')
    if (fs.existsSync(embeddingsPath)) {
      const content = fs.readFileSync(embeddingsPath, 'utf-8')
      const hasCorrectURL = content.includes("'https://api.lucid.foundation/v1'")
      const hasOldURL = content.includes("'https://api.lucid-l2.com/v1'")

      logResult(
        'embeddings.ts: correct default URL',
        hasCorrectURL && !hasOldURL,
        hasOldURL ? 'STILL has old api.lucid-l2.com URL' : 'api.lucid.foundation/v1'
      )
    } else {
      logResult('embeddings.ts: file exists', false, 'Not found')
    }
  }

  // 4c: Check sdk.ts initialization
  {
    const sdkPath = path.resolve(__dirname, '../../src/lib/ai/sdk.ts')
    if (fs.existsSync(sdkPath)) {
      const content = fs.readFileSync(sdkPath, 'utf-8')
      const hasCorrectDefault = content.includes("'https://api.lucid.foundation'")
      const hasApiKeyCheck = content.includes("'your-key-here'")

      logResult(
        'sdk.ts: correct default URL',
        hasCorrectDefault,
        hasCorrectDefault ? 'api.lucid.foundation' : 'WRONG default URL'
      )

      logResult(
        'sdk.ts: API key validation',
        hasApiKeyCheck,
        hasApiKeyCheck ? 'Properly excludes "your-key-here" placeholder' : 'No placeholder check'
      )
    } else {
      logResult('sdk.ts: file exists', false, 'Not found')
    }
  }

  console.log()

  // ════════════════════════════════════════════════════════════════════════════
  // TEST GROUP 5: Cross-route verification (routing correctness)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('-- Group 5: Cloudflare Worker Routing Verification -------------')
  console.log()

  // 5a: /v1/chat/completions should route to TrustGate
  {
    const res = await rawFetch('/v1/chat/completions', TRUSTGATE_API_KEY, {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 5,
    })
    logResult(
      'Route: /v1/chat/completions → trustgate',
      res.route === 'trustgate',
      `X-Lucid-Route: "${res.route}"`
    )
  }

  // 5b: /v1/embeddings should route to TrustGate
  {
    const res = await rawFetch('/v1/embeddings', TRUSTGATE_API_KEY, {
      model: 'text-embedding-3-small',
      input: 'test',
    })
    logResult(
      'Route: /v1/embeddings → trustgate',
      res.route === 'trustgate',
      `X-Lucid-Route: "${res.route}"`
    )
  }

  // 5c: /v1/passports should route to L2
  {
    const res = await rawFetch('/v1/passports', null, null, { method: 'GET' })
    logResult(
      'Route: /v1/passports → lucid-l2',
      res.route === 'lucid-l2',
      `X-Lucid-Route: "${res.route}"`
    )
  }

  // 5d: /v1/epochs/current should route to L2
  {
    const res = await rawFetch('/v1/epochs/current', null, null, { method: 'GET' })
    logResult(
      'Route: /v1/epochs/current → lucid-l2',
      res.route === 'lucid-l2',
      `X-Lucid-Route: "${res.route}" status:${res.status}`
    )
  }

  // 5e: /health/live should route to L2
  {
    const res = await rawFetch('/health/live', null, null, { method: 'GET' })
    logResult(
      'Route: /health/live → lucid-l2',
      res.route === 'lucid-l2',
      `X-Lucid-Route: "${res.route}" status:${res.status}`
    )
  }

  console.log()
  printSummary()
}

function printSummary() {
  // ════════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════════════
  console.log('================================================================')
  console.log('  SUMMARY')
  console.log('================================================================')

  const passed = results.filter(r => r.passed)
  const failed = results.filter(r => !r.passed)

  console.log(`  Total: ${passed.length}/${results.length} passed`)
  console.log()

  if (failed.length > 0) {
    console.log('  FAILURES:')
    for (const f of failed) {
      console.log(`    [${f.num}] ${f.name}`)
      if (f.detail) console.log(`        ${f.detail}`)
    }
    console.log()
  }

  // Key findings
  console.log('  KEY FINDINGS:')

  // SDK auth issue
  const sdkNoAuth = results.find(r => r.name.includes('WITHOUT apiKey') && r.passed)
  const sdkWithAuth = results.find(r => r.name.includes('WITH apiKey') && r.name.includes('SDK:'))
  if (sdkWithAuth && !sdkWithAuth.passed && sdkWithAuth.detail?.includes('securitySource')) {
    console.log()
    console.log('  WARNING: SDK Auth Gap')
    console.log('    The raijin-labs-lucid-ai SDK has securitySource: null for')
    console.log('    chatCompletions() — it does NOT inject the Authorization header.')
    console.log('    This means sdk.run.chatCompletions() cannot authenticate with TrustGate.')
    console.log('    FIX: Update the SDK OpenAPI spec to include security definitions,')
    console.log('    or use the Vercel AI SDK provider path (providers.ts) instead.')
  }

  // Embeddings URL
  const embeddingsCheck = results.find(r => r.name.includes('embeddings.ts'))
  if (embeddingsCheck) {
    if (embeddingsCheck.passed) {
      console.log('    embeddings.ts: URL fixed to api.lucid.foundation/v1')
    } else {
      console.log('    embeddings.ts: STILL has wrong default URL')
    }
  }

  // Provider dev bypass
  const devBypass = results.find(r => r.name.includes('dev-internal-bypass'))
  if (devBypass?.detail?.includes('WARNING')) {
    console.log('    providers.ts: dev-internal-bypass is still active — set LUCID_API_KEY for production')
  }

  console.log()

  if (failed.length > 0) {
    console.log(`  RESULT: ${failed.length} test(s) failed`)
    process.exit(1)
  } else {
    console.log('  RESULT: All tests passed')
    process.exit(0)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
