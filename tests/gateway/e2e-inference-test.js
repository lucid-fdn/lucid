#!/usr/bin/env node
/**
 * End-to-End Inference Pipeline Test
 *
 * Tests the FULL inference path that the LucidMerged frontend uses:
 *   LucidMerged → api.lucid.foundation → (TrustGate? LiteLLM? Lucid-L2?)
 *
 * Validates:
 *   1. Basic inference (no passport) — standard flow
 *   2. Streaming inference — SSE transport
 *   3. Passport-aware inference — X-Lucid-Passport header
 *   4. Backend detection — which backend is actually serving requests
 *
 * Usage:
 *   node tests/gateway/e2e-inference-test.js
 *
 * Reads from .env.local:
 *   LUCID_API_BASE_URL      — e.g. https://api.lucid.foundation
 *   LUCID_API_KEY            — API key (or 'dev-internal-bypass')
 *   LUCIDGATEWAY_PROXY_URL   — (optional) direct LiteLLM/TrustGate URL
 *   LUCIDGATEWAY_MASTER_KEY  — (optional) TrustGate admin key
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

// ── Config ──────────────────────────────────────────────────────────────────

const LUCID_API_BASE = (process.env.LUCID_API_BASE_URL || 'https://api.lucid.foundation').replace(/\/$/, '')
const LUCID_API_KEY = process.env.LUCID_API_KEY && process.env.LUCID_API_KEY !== 'your-key-here'
  ? process.env.LUCID_API_KEY
  : 'dev-internal-bypass'

const TRUSTGATE_URL = (process.env.LUCIDGATEWAY_PROXY_URL || '').replace(/\/$/, '')
const TRUSTGATE_KEY = process.env.LUCIDGATEWAY_MASTER_KEY || ''

// ── Test Models ─────────────────────────────────────────────────────────────
// These are the models the frontend actually sends (from model-selector.tsx)

const TEST_MODELS = [
  // Default model used by the chat route
  { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Default (Llama 3.3 70B)', priority: 'critical' },
  // Popular models users select in the UI
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini', priority: 'critical' },
  { id: 'gpt-4o', label: 'GPT-4o', priority: 'high' },
  { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku', priority: 'high' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek', priority: 'medium' },
]

const STREAMING_MODELS = ['gpt-4o-mini', 'claude-3-5-haiku-latest']

// ── Helpers ──────────────────────────────────────────────────────────────────

async function testEndpoint(url, apiKey, model, options = {}) {
  const { stream = false, passportId = null, policyHeader = null } = options

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  if (passportId) {
    headers['X-Lucid-Passport'] = passportId
  }
  if (policyHeader) {
    headers['X-Lucid-Policy'] = policyHeader
  }

  const body = {
    model,
    messages: [{ role: 'user', content: 'Say "pong" and nothing else.' }],
    max_tokens: 10,
    temperature: 0,
    stream,
  }

  const start = Date.now()
  let res
  try {
    res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    })
  } catch (err) {
    return {
      ok: false,
      latency: Date.now() - start,
      error: err.code === 'ABORT_ERR' ? 'Timeout (30s)' : err.message,
    }
  }

  const latency = Date.now() - start

  // Check response headers for backend detection
  const serverHeader = res.headers.get('server') || ''
  const viaHeader = res.headers.get('via') || ''
  const deprecationHeader = res.headers.get('deprecation') || ''
  const sunsetHeader = res.headers.get('sunset') || ''
  const lucidHeaders = {
    server: serverHeader,
    via: viaHeader,
    deprecation: deprecationHeader,
    sunset: sunsetHeader,
    'x-litellm-version': res.headers.get('x-litellm-version') || '',
    'x-litellm-model-id': res.headers.get('x-litellm-model-id') || '',
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, status: res.status, latency, error: text.slice(0, 300), headers: lucidHeaders }
  }

  if (stream) {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let chunks = 0
    let fullText = ''
    let lucidMeta = null
    try {
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
            if (parsed.lucid) lucidMeta = parsed.lucid
          } catch {}
        }
      }
    } catch (err) {
      return { ok: false, latency: Date.now() - start, error: `Stream error: ${err.message}`, headers: lucidHeaders }
    }
    return { ok: true, status: 200, latency: Date.now() - start, text: fullText, chunks, stream: true, lucidMeta, headers: lucidHeaders }
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content || ''
  const usage = data.usage || {}
  const lucidMeta = data.lucid || null

  return {
    ok: true,
    status: 200,
    latency,
    text: text.slice(0, 50),
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    lucidMeta,
    headers: lucidHeaders,
    model_used: data.model || null,
  }
}

function detectBackend(result) {
  if (!result.ok) return 'UNREACHABLE'
  const h = result.headers || {}

  // LiteLLM adds x-litellm-version header
  if (h['x-litellm-version']) return 'LITELLM'

  // TrustGate adds lucid metadata in response body
  if (result.lucidMeta) return 'TRUSTGATE+PASSPORT'

  // Deprecation header means Lucid-L2 (deprecated inference endpoints)
  if (h.deprecation === 'true') return 'LUCID-L2 (DEPRECATED)'

  // Check for nginx/cloudflare markers
  if (h.server && h.server.includes('nginx')) return 'NGINX_PROXY'
  if (h.server && h.server.includes('cloudflare')) return 'CLOUDFLARE_PROXY'

  return 'UNKNOWN (likely Lucid-L2 direct)'
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗')
  console.log('║     E2E Inference Pipeline Test                                 ║')
  console.log('║     Tests: api.lucid.foundation → TrustGate → LiteLLM          ║')
  console.log('╚══════════════════════════════════════════════════════════════════╝')
  console.log()

  // ── Config summary ──
  console.log('📋 Configuration:')
  console.log(`   LUCID_API_BASE_URL:    ${LUCID_API_BASE}`)
  console.log(`   LUCID_API_KEY:         ${LUCID_API_KEY === 'dev-internal-bypass' ? '⚠️  dev-internal-bypass (placeholder)' : LUCID_API_KEY.slice(0, 8) + '...'}`)
  console.log(`   LUCIDGATEWAY_PROXY_URL: ${TRUSTGATE_URL || '❌ NOT SET'}`)
  console.log(`   LUCIDGATEWAY_MASTER_KEY: ${TRUSTGATE_KEY ? TRUSTGATE_KEY.slice(0, 6) + '...' : '❌ NOT SET'}`)
  console.log()

  const allResults = []

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 1: DNS / Connectivity Check
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('── Test 1: DNS & Connectivity ────────────────────────────────────')

  // Check api.lucid.foundation resolves
  process.stdout.write(`  ${LUCID_API_BASE.padEnd(50)} `)
  try {
    const res = await fetch(`${LUCID_API_BASE}/v1/models`, {
      headers: { 'Authorization': `Bearer ${LUCID_API_KEY}` },
      signal: AbortSignal.timeout(10000),
    })
    const serverH = res.headers.get('server') || 'unknown'
    console.log(`${res.ok ? '✅' : '⚠️'}  HTTP ${res.status}  server: ${serverH}`)
  } catch (err) {
    console.log(`❌  ${err.message}`)
  }

  // Check TrustGate directly if configured
  if (TRUSTGATE_URL) {
    process.stdout.write(`  ${TRUSTGATE_URL.padEnd(50)} `)
    try {
      const res = await fetch(`${TRUSTGATE_URL}/health`, {
        signal: AbortSignal.timeout(10000),
      })
      console.log(`${res.ok ? '✅' : '⚠️'}  HTTP ${res.status}`)
    } catch (err) {
      console.log(`❌  ${err.message}`)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 2: Standard Inference (No Passport) — What the frontend does today
  // ═══════════════════════════════════════════════════════════════════════════
  console.log()
  console.log('── Test 2: Standard Inference (no passport) ──────────────────────')
  console.log('   This is what LucidMerged frontend currently does')
  console.log()

  for (const m of TEST_MODELS) {
    process.stdout.write(`  [${m.priority.toUpperCase().padEnd(8)}] ${m.id.padEnd(48)} `)
    const result = await testEndpoint(LUCID_API_BASE, LUCID_API_KEY, m.id)
    const backend = detectBackend(result)

    if (result.ok) {
      console.log(`✅  ${result.latency}ms  backend: ${backend}  "${result.text}"`)
    } else {
      console.log(`❌  ${result.error?.slice(0, 80)}`)
    }

    allResults.push({ test: 'standard', model: m.id, priority: m.priority, backend, ...result })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 3: Streaming Inference — Vercel AI SDK uses this
  // ═══════════════════════════════════════════════════════════════════════════
  console.log()
  console.log('── Test 3: Streaming Inference (SSE) ─────────────────────────────')
  console.log('   Vercel AI SDK streamText() uses this transport')
  console.log()

  for (const modelId of STREAMING_MODELS) {
    process.stdout.write(`  ${modelId.padEnd(48)} `)
    const result = await testEndpoint(LUCID_API_BASE, LUCID_API_KEY, modelId, { stream: true })

    if (result.ok) {
      console.log(`✅  ${result.latency}ms  ${result.chunks} chunks  "${result.text}"`)
    } else {
      console.log(`❌  ${result.error?.slice(0, 80)}`)
    }

    allResults.push({ test: 'streaming', model: modelId, ...result })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 4: Passport-Aware Inference — Tests TrustGate integration
  // ═══════════════════════════════════════════════════════════════════════════
  console.log()
  console.log('── Test 4: Passport-Aware Inference (X-Lucid-Passport) ───────────')
  console.log('   Tests if TrustGate resolves passport headers')
  console.log()

  // Test with a fake passport ID — should either:
  // a) Be ignored if TrustGate isn't deployed (passthrough to Lucid-L2)
  // b) Return 400 if TrustGate IS deployed (invalid passport)
  // c) Return enriched response with lucid metadata if passport exists

  const passportTests = [
    { passport: null, label: 'No passport (baseline)', model: 'gpt-4o-mini' },
    { passport: 'passport_fake123', label: 'Fake passport ID', model: 'gpt-4o-mini' },
    { passport: 'openai-gpt4o-mini', label: 'Passport alias (openai-gpt4o-mini)', model: 'gpt-4o-mini' },
  ]

  for (const pt of passportTests) {
    process.stdout.write(`  ${pt.label.padEnd(48)} `)
    const result = await testEndpoint(LUCID_API_BASE, LUCID_API_KEY, pt.model, {
      passportId: pt.passport,
    })
    const backend = detectBackend(result)

    if (result.ok) {
      const hasMeta = result.lucidMeta ? '🎫 lucid metadata present' : '⬜ no lucid metadata'
      console.log(`✅  ${result.latency}ms  ${hasMeta}  backend: ${backend}`)
    } else {
      // 400 with passport error = TrustGate IS deployed and rejecting invalid passport
      if (result.status === 400 && result.error?.includes('passport')) {
        console.log(`🎫  HTTP 400 — TrustGate correctly rejected invalid passport`)
      } else {
        console.log(`❌  HTTP ${result.status || '?'}  ${result.error?.slice(0, 80)}`)
      }
    }

    allResults.push({ test: 'passport', label: pt.label, passport: pt.passport, backend, ...result })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 5: Direct TrustGate Test (if configured)
  // ═══════════════════════════════════════════════════════════════════════════
  if (TRUSTGATE_URL && TRUSTGATE_KEY) {
    console.log()
    console.log('── Test 5: Direct TrustGate (bypassing nginx proxy) ─────────────')
    console.log(`   URL: ${TRUSTGATE_URL}`)
    console.log()

    for (const m of TEST_MODELS.slice(0, 3)) {
      process.stdout.write(`  ${m.id.padEnd(48)} `)
      const result = await testEndpoint(TRUSTGATE_URL, TRUSTGATE_KEY, m.id)
      const backend = detectBackend(result)

      if (result.ok) {
        console.log(`✅  ${result.latency}ms  backend: ${backend}  "${result.text}"`)
      } else {
        console.log(`❌  ${result.error?.slice(0, 80)}`)
      }

      allResults.push({ test: 'direct-trustgate', model: m.id, backend, ...result })
    }

    // Test passport on TrustGate directly
    process.stdout.write(`  With X-Lucid-Passport header...`.padEnd(48) + ' ')
    const passportResult = await testEndpoint(TRUSTGATE_URL, TRUSTGATE_KEY, 'gpt-4o-mini', {
      passportId: 'passport_fake123',
    })
    if (passportResult.ok) {
      const hasMeta = passportResult.lucidMeta ? '🎫 lucid metadata' : '⬜ no metadata'
      console.log(`✅  ${passportResult.latency}ms  ${hasMeta}`)
    } else {
      if (passportResult.status === 400) {
        console.log(`🎫  HTTP 400 — TrustGate correctly rejected invalid passport`)
      } else {
        console.log(`❌  ${passportResult.error?.slice(0, 80)}`)
      }
    }
    allResults.push({ test: 'direct-trustgate-passport', ...passportResult })
  } else {
    console.log()
    console.log('── Test 5: Direct TrustGate — SKIPPED ──────────────────────────')
    console.log('   ⚠️  LUCIDGATEWAY_PROXY_URL and/or LUCIDGATEWAY_MASTER_KEY not set')
    console.log('   Set these in .env.local to test TrustGate directly')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log()
  console.log('══════════════════════════════════════════════════════════════════')
  console.log('  SUMMARY')
  console.log('══════════════════════════════════════════════════════════════════')

  const passed = allResults.filter(r => r.ok)
  const failed = allResults.filter(r => !r.ok)
  const standardResults = allResults.filter(r => r.test === 'standard')
  const streamResults = allResults.filter(r => r.test === 'streaming')
  const passportResults = allResults.filter(r => r.test === 'passport')

  console.log(`  Total:        ${passed.length}/${allResults.length} passed`)
  console.log(`  Standard:     ${standardResults.filter(r => r.ok).length}/${standardResults.length}`)
  console.log(`  Streaming:    ${streamResults.filter(r => r.ok).length}/${streamResults.length}`)
  console.log(`  Passport:     ${passportResults.filter(r => r.ok).length}/${passportResults.length}`)

  // Backend detection
  console.log()
  console.log('  Backend Detection:')
  const backends = new Map()
  for (const r of allResults.filter(r => r.ok && r.test === 'standard')) {
    const b = r.backend || 'unknown'
    backends.set(b, (backends.get(b) || 0) + 1)
  }
  for (const [backend, count] of backends) {
    console.log(`    ${backend}: ${count} responses`)
  }

  // Passport support detection
  console.log()
  const passportBaseline = passportResults.find(r => !r.passport)
  const passportFake = passportResults.find(r => r.passport === 'passport_fake123')
  const passportAlias = passportResults.find(r => r.passport === 'openai-gpt4o-mini')

  const trustgateActive = passportFake && (
    passportFake.status === 400 || // Rejects invalid passport = TrustGate active
    (passportFake.lucidMeta) // Returns lucid metadata = TrustGate active
  )

  if (trustgateActive) {
    console.log('  🎫 TrustGate passport resolution: ACTIVE ✅')
  } else {
    console.log('  ⚠️  TrustGate passport resolution: NOT ACTIVE')
    console.log('     Passport headers are being ignored — requests go to Lucid-L2 directly')
  }

  // LiteLLM detection
  const hasLiteLLM = allResults.some(r => r.headers?.['x-litellm-version'])
  if (hasLiteLLM) {
    const version = allResults.find(r => r.headers?.['x-litellm-version'])?.headers['x-litellm-version']
    console.log(`  🔄 LiteLLM detected: v${version} ✅`)
  } else {
    console.log('  ⚠️  LiteLLM: NOT DETECTED in response headers')
  }

  // Deprecation detection
  const hasDeprecation = allResults.some(r => r.headers?.deprecation === 'true')
  if (hasDeprecation) {
    const sunset = allResults.find(r => r.headers?.sunset)?.headers.sunset
    console.log(`  ⏰ Lucid-L2 deprecation headers present (sunset: ${sunset || 'unknown'})`)
  }

  // ── Deployment gap analysis ──
  console.log()
  console.log('══════════════════════════════════════════════════════════════════')
  console.log('  DEPLOYMENT GAP ANALYSIS')
  console.log('══════════════════════════════════════════════════════════════════')

  const gaps = []

  if (LUCID_API_KEY === 'dev-internal-bypass') {
    gaps.push({
      severity: '🔴 HIGH',
      item: 'LUCID_API_KEY is placeholder',
      detail: 'Set LUCID_API_KEY in .env.local to a real TrustGate API key',
      action: 'Generate key in LucidMerged Settings → Gateway → Create Key',
    })
  }

  if (!TRUSTGATE_URL) {
    gaps.push({
      severity: '🟡 MEDIUM',
      item: 'LUCIDGATEWAY_PROXY_URL not set',
      detail: 'No direct TrustGate URL configured for testing',
      action: 'Set LUCIDGATEWAY_PROXY_URL in .env.local (e.g. https://litellm.lucid.foundation)',
    })
  }

  if (!trustgateActive) {
    gaps.push({
      severity: '🔴 HIGH',
      item: 'TrustGate not processing passport headers',
      detail: 'X-Lucid-Passport headers are being ignored — TrustGate is either not deployed or api.lucid.foundation doesn\'t route to it',
      action: 'Deploy TrustGate + nginx reverse proxy so /v1/chat/completions → TrustGate',
    })
  }

  if (!hasLiteLLM) {
    gaps.push({
      severity: '🟡 MEDIUM',
      item: 'LiteLLM not detected in responses',
      detail: 'No x-litellm-version header found — LiteLLM may not be in the inference path',
      action: 'Verify LiteLLM is deployed and TrustGate routes to it',
    })
  }

  const standardFails = standardResults.filter(r => !r.ok)
  if (standardFails.length > 0) {
    gaps.push({
      severity: '🔴 HIGH',
      item: `${standardFails.length} model(s) failing`,
      detail: standardFails.map(f => `${f.model}: ${f.error?.slice(0, 60)}`).join('; '),
      action: 'Fix model routing in LiteLLM config or provider keys',
    })
  }

  const streamFails = streamResults.filter(r => !r.ok)
  if (streamFails.length > 0) {
    gaps.push({
      severity: '🔴 HIGH',
      item: `${streamFails.length} streaming model(s) failing`,
      detail: 'SSE streaming broken — this is what the frontend uses',
      action: 'Fix streaming support in the inference backend',
    })
  }

  if (gaps.length === 0) {
    console.log('  ✅ No gaps detected — inference pipeline is fully operational!')
  } else {
    for (const gap of gaps) {
      console.log()
      console.log(`  ${gap.severity}: ${gap.item}`)
      console.log(`     ${gap.detail}`)
      console.log(`     → ${gap.action}`)
    }
  }

  // ── What's missing for full deployment ──
  console.log()
  console.log('══════════════════════════════════════════════════════════════════')
  console.log('  REMAINING DEPLOYMENT ITEMS')
  console.log('══════════════════════════════════════════════════════════════════')
  console.log()
  console.log('  1. 🗄️  Run DB migrations on Railway Postgres:')
  console.log('     - 002_passport_store.sql (passports table)')
  console.log('     - 003_receipt_events.sql (receipt events table)')
  console.log()
  console.log('  2. 📦 Publish @raijinlabs/passport to GitHub Packages:')
  console.log('     - Push to lucid-plateform-core main → CI auto-publishes')
  console.log('     - Or: cd packages/passport && npm publish')
  console.log('     - Set NODE_AUTH_TOKEN in Lucid-L2 CI for npm install')
  console.log()
  console.log('  3. 🚀 Deploy TrustGate (lucid-plateform-core/apps/trustgate-api):')
  console.log('     - Railway service or Docker (Dockerfile.trustgate)')
  console.log('     - Needs: POSTGRES_URL, LITELLM_BASE_URL, LITELLM_MASTER_KEY')
  console.log()
  console.log('  4. 🌐 Deploy nginx reverse proxy for api.lucid.foundation:')
  console.log('     - /v1/chat/completions → TrustGate (:4010)')
  console.log('     - /v1/embeddings → TrustGate (:4010)')
  console.log('     - Everything else → Lucid-L2 (:5100)')
  console.log('     - Config ready: infra/nginx-gateway/nginx.conf.template')
  console.log()
  console.log('  5. 🔑 Configure LUCID_API_KEY in LucidMerged .env.local:')
  console.log('     - Must be a valid TrustGate API key (not placeholder)')
  console.log()
  console.log('  6. 📊 Run passport data migration:')
  console.log('     - Export from Lucid-L2 file store → Import to Postgres')
  console.log('     - Script: lucid-plateform-core/scripts/migrate-passports-to-postgres.ts')
  console.log()
  console.log('  7. 🔗 Deploy Lucid-L2 with @raijinlabs/passport dependency:')
  console.log('     - receiptConsumer.ts polls receipt_events table')
  console.log('     - Deprecation headers active on inference endpoints')
  console.log()

  // Exit code
  if (standardFails.length > 0 || streamFails.length > 0) {
    console.log('  🔴 RESULT: Some tests FAILED — see above')
    process.exit(1)
  } else {
    console.log('  🟢 RESULT: All inference tests passed')
    if (!trustgateActive) {
      console.log('  ⚠️  BUT: TrustGate passport resolution is not active yet')
    }
    process.exit(0)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})