#!/usr/bin/env node
/* eslint-disable no-console */

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const baseURL = process.env.SMOKE_BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const authFile = process.env.E2E_AUTH_STATE || '.playwright/auth/user.json'

function loadEnv(file = '.env.local') {
  const env = {}
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    value = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
    env[key] = value
  }
  return { ...env, ...process.env }
}

const env = loadEnv()
const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
}
if (!fs.existsSync(authFile)) {
  throw new Error(`Missing Playwright auth state: ${authFile}`)
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
})

async function insertOne(table, row) {
  const { data, error } = await supabase.from(table).insert(row).select('*').single()
  if (error) throw new Error(`${table} insert failed: ${error.message}`)
  return data
}

async function postJson(page, url, data, label, csrfToken = null) {
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await page.request.post(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      data,
      failOnStatusCode: false,
      timeout: 180_000,
    })
    const body = await response.json().catch(async () => ({ text: await response.text().catch(() => '') }))
    if (response.ok()) return body

    if (response.status() === 429 && attempt < maxAttempts) {
      const retryAfter = Number(response.headers()['retry-after'])
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 65_000
      console.warn(`${label} hit rate limit; retrying in ${Math.round(waitMs / 1000)}s`)
      await new Promise((resolve) => setTimeout(resolve, waitMs))
      continue
    }

    throw new Error(`${label} failed ${response.status()}: ${JSON.stringify(body).slice(0, 1000)}`)
  }
  throw new Error(`${label} failed after ${maxAttempts} attempts`)
}

async function classifyStress(page, orgId) {
  const cases = [
    {
      name: 'policy-plus-source',
      text: 'Never mention unreleased pricing without approval. Docs: https://docs.example.com/pricing',
      expect: ['context', 'knowledge_source'],
    },
    {
      name: 'plain-fact',
      text: 'Starter support SLA is two business days for non-urgent tickets.',
      expect: ['knowledge_fact'],
    },
    {
      name: 'recall-question',
      text: 'What should agents recall about our refund policy?',
      expect: ['recall_test'],
    },
    {
      name: 'long-document',
      text: Array.from({ length: 20 }, (_, index) => (
        `Section ${index}: Customer onboarding playbook step with detailed instructions and owner.`
      )).join('\n'),
      expect: ['knowledge_document'],
    },
    {
      name: 'sensitive-secret',
      text: 'The API key is sk-secret-value and support should use it for testing.',
      expect: ['context'],
      reviewAtLeast: 1,
      warning: 'sensitive',
    },
    {
      name: 'private-url',
      text: 'Internal docs are at http://localhost:3000/private',
      expect: ['knowledge_source', 'knowledge_fact'],
      reviewAtLeast: 1,
      warning: 'Private-network',
    },
    {
      name: 'same-url-twice',
      text: 'https://docs.example.com/product https://docs.example.com/product/',
      expect: ['knowledge_source'],
      duplicateCount: 1,
    },
    {
      name: 'mixed-policy-source-recall',
      text: [
        'Always cite Citrine Ledger launch policy before answering.',
        'Launch docs: https://example.com/citrine',
        'What should agents recall about Citrine Ledger?',
      ].join('\n'),
      expect: ['context', 'knowledge_source', 'recall_test'],
    },
  ]

  const results = []
  for (const test of cases) {
    const body = await postJson(page, '/api/brain/intake/classify', {
      orgId,
      scopeId: orgId,
      text: test.text,
      files: [],
    }, `classify ${test.name}`)

    const destinations = body.items.map((item) => item.destination)
    const warnings = body.items.flatMap((item) => item.warnings || [])
    const reviewCount = body.items.filter((item) => item.requiresReview || item.recommendedAction === 'review').length

    for (const expected of test.expect) {
      if (!destinations.includes(expected)) {
        throw new Error(`${test.name}: missing ${expected}; got ${destinations.join(',')}`)
      }
    }
    if (typeof test.reviewAtLeast === 'number' && reviewCount < test.reviewAtLeast) {
      throw new Error(`${test.name}: expected review >= ${test.reviewAtLeast}, got ${reviewCount}`)
    }
    if (test.warning && !warnings.some((warning) => warning.includes(test.warning))) {
      throw new Error(`${test.name}: missing warning containing ${test.warning}; got ${warnings.join(' | ')}`)
    }
    if (typeof test.duplicateCount === 'number' && body.quality.duplicateCount !== test.duplicateCount) {
      throw new Error(`${test.name}: expected duplicateCount ${test.duplicateCount}, got ${body.quality.duplicateCount}`)
    }

    results.push({
      name: test.name,
      summary: body.summary,
      destinations,
      quality: body.quality,
      preview: body.preview,
    })
  }
  return results
}

async function extractSmoke(page, orgId, csrfToken) {
  async function postFile(file) {
    const response = await page.request.post('/api/brain/intake/extract', {
      headers: { 'x-csrf-token': csrfToken },
      multipart: { orgId, files: file },
      failOnStatusCode: false,
      timeout: 120_000,
    })
    const body = await response.json().catch(async () => ({ text: await response.text().catch(() => '') }))
    if (!response.ok()) {
      throw new Error(`extract ${file.name} failed ${response.status()}: ${JSON.stringify(body).slice(0, 1000)}`)
    }
    return body
  }

  const text = await postFile({
    name: 'brain-note.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Brain Note\nRemember Citrine Ledger.'),
  })
  const pdf = await postFile({
    name: 'deck.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 fake'),
  })

  if (!text.files?.[0]?.text?.includes('Citrine Ledger')) {
    throw new Error(`Text extraction did not return expected content: ${JSON.stringify(text)}`)
  }
  if (pdf.files?.[0]?.text) {
    throw new Error(`Unsupported PDF should not be fake-extracted: ${JSON.stringify(pdf)}`)
  }
  if (!pdf.warnings?.some((warning) => warning.includes('deck.pdf'))) {
    throw new Error(`Unsupported PDF did not return warning: ${JSON.stringify(pdf)}`)
  }

  return {
    text: { name: text.files[0].name, hasText: Boolean(text.files[0].text) },
    pdf: { name: pdf.files[0].name, hasText: Boolean(pdf.files[0].text), warnings: pdf.warnings },
  }
}

async function commitAndQuerySmoke(page, org, csrfToken) {
  const marker = `brain-intake-acceptance-${Date.now()}`
  const classified = await postJson(page, '/api/brain/intake/classify', {
    orgId: org.id,
    scopeId: org.id,
    text: [
      `Always cite the Citrine Ledger launch policy before answering launch questions. ${marker}`,
      `Launch policy docs live at https://example.com/${marker}`,
      `What should agents recall about Citrine Ledger launch policy ${marker}?`,
    ].join('\n'),
    files: [{
      name: 'launch-playbook.md',
      type: 'text/markdown',
      size: 120,
      text: `# Launch Playbook\nCitrine Ledger evidence marker ${marker}.`,
    }],
  }, 'classify commit smoke')

  const destinations = classified.items.map((item) => item.destination)
  const contextCount = destinations.filter((destination) => destination === 'context').length
  if (contextCount !== 1) {
    throw new Error(`Expected exactly one context item, got ${contextCount}: ${destinations.join(',')}`)
  }
  for (const expected of ['context', 'knowledge_source', 'recall_test', 'knowledge_document']) {
    if (!destinations.includes(expected)) {
      throw new Error(`Commit smoke missing ${expected}; got ${destinations.join(',')}`)
    }
  }

  const committed = await postJson(page, '/api/brain/intake/commit', {
    orgId: org.id,
    scopeId: org.id,
    items: classified.items,
  }, 'commit smoke', csrfToken)

  const created = committed.results.filter((result) => result.status === 'created')
  const recallSkipped = committed.results.filter((result) => result.recallQuery)
  if (created.length < 3) {
    throw new Error(`Expected at least 3 created items, got ${JSON.stringify(committed)}`)
  }
  if (recallSkipped.length < 1) {
    throw new Error(`Expected recall test skip, got ${JSON.stringify(committed)}`)
  }

  const queried = await postJson(page, '/api/brain/query', {
    org_id: org.id,
    query: `Citrine Ledger launch policy ${marker}`,
    mode: 'evidence',
    layers: ['facts', 'guidance', 'documents', 'sources', 'evidence'],
  }, 'query smoke')

  const packetText = JSON.stringify(queried).toLowerCase()
  if (!packetText.includes(marker.toLowerCase()) && !packetText.includes('citrine ledger')) {
    throw new Error(`Brain query packet missing marker/evidence: ${JSON.stringify(queried).slice(0, 1000)}`)
  }

  return {
    marker,
    classified: {
      summary: classified.summary,
      destinations,
      actions: classified.items.map((item) => item.recommendedAction),
      quality: classified.quality,
      preview: classified.preview,
    },
    committed,
    queryItems: queried.packet?.items?.length ?? null,
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ baseURL, storageState: authFile })
  const page = await context.newPage()
  let orgId = null

  try {
    const meResponse = await page.request.get('/api/user/me', { failOnStatusCode: false, timeout: 120_000 })
    if (!meResponse.ok()) throw new Error(`/api/user/me failed ${meResponse.status()}: ${await meResponse.text().catch(() => '')}`)
    const me = await meResponse.json()
    const userId = me.user?.id
    if (!userId) throw new Error('Authenticated state did not return a user id.')

    const stamp = Date.now()
    const org = await insertOne('organizations', {
      slug: `brain_intake_acceptance_${stamp}`,
      name: `Brain Intake Acceptance ${stamp}`,
      type: 'team',
      metadata: { brain_intake_acceptance: true },
      created_by: userId,
    })
    orgId = org.id
    await insertOne('organization_members', {
      organization_id: org.id,
      user_id: userId,
      role: 'owner',
    })

    const csrfResponse = await page.request.get('/api/auth/csrf', { timeout: 120_000 })
    if (!csrfResponse.ok()) throw new Error(`/api/auth/csrf failed ${csrfResponse.status()}`)
    const csrfToken = (await csrfResponse.json()).token
    if (!csrfToken) throw new Error('Missing CSRF token.')

    const classifyResults = await classifyStress(page, org.id)
    const extraction = await extractSmoke(page, org.id, csrfToken)
    const commit = await commitAndQuerySmoke(page, org, csrfToken)

    console.log(JSON.stringify({
      ok: true,
      baseURL,
      org: { id: org.id, slug: org.slug },
      classifyCases: classifyResults.length,
      extraction,
      commit,
    }, null, 2))
  } finally {
    await browser.close()
    if (orgId) await supabase.from('organizations').delete().eq('id', orgId)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
