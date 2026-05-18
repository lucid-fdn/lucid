#!/usr/bin/env node
/* eslint-disable no-restricted-imports */

import { chromium, request } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const baseURL = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const authFile = process.env.E2E_AUTH_STATE || '.playwright/auth/user.json'
const screenshotDir = process.env.KNOWLEDGE_UI_SCREENSHOT_DIR || '.playwright/knowledge-ui'

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
  throw new Error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
})

function hash(input) {
  return crypto.createHash('md5').update(input).digest('hex')
}

async function insertOne(table, row) {
  const { data, error } = await supabase.from(table).insert(row).select('*').single()
  if (error) throw new Error(`${table} insert failed: ${error.message}`)
  return data
}

async function insertMany(table, rows) {
  const { data, error } = await supabase.from(table).insert(rows).select('*')
  if (error) throw new Error(`${table} insert failed: ${error.message}`)
  return data || []
}

async function expectDb(table, filters, predicate, label, timeoutMs = 30_000) {
  const startedAt = Date.now()
  let lastData = null
  let lastError = null

  while (Date.now() - startedAt < timeoutMs) {
    let query = supabase.from(table).select('*')
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value)
    const { data, error } = await query
    lastData = data
    lastError = error
    if (error) throw new Error(`${label}: ${error.message}`)
    if (predicate(data || [])) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  if (lastError) throw new Error(`${label}: ${lastError.message}`)
  throw new Error(`${label}: predicate failed with ${JSON.stringify(lastData)}`)
}

async function getTextVisible(page, text) {
  const locator = page.getByText(text, { exact: false })
  const count = await locator.count()
  if (!count) return false
  return locator.first().isVisible().catch(() => false)
}

async function waitForText(page, text, timeout = 30_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout })
}

async function ensureBrowserCsrf(page) {
  const response = await page.request.get('/api/auth/csrf', { timeout: 60_000 })
  if (!response.ok()) {
    throw new Error(`/api/auth/csrf failed ${response.status()}`)
  }
  await page.evaluate(() => {
    if (!document.cookie.includes('csrf-token=')) {
      throw new Error('CSRF cookie was not visible to the browser context')
    }
  })
}

function cardForText(page, text) {
  return page
    .locator('div, article, section, li')
    .filter({ hasText: text })
    .filter({ has: page.locator('button') })
    .last()
}

async function clickAndWaitForResponse(page, locator, urlPart, label) {
  let lastText = ''
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const [response] = await Promise.all([
      page.waitForResponse((candidate) => candidate.url().includes(urlPart), { timeout: 60_000 }),
      locator.click(),
    ])
    if (response.ok()) return response
    lastText = await response.text().catch(() => '')
    if (response.status() !== 429 || attempt === 1) {
      throw new Error(`${label} failed with ${response.status()}: ${lastText}`)
    }
    await page.waitForTimeout(61_000)
  }
  throw new Error(`${label} failed after retry: ${lastText}`)
}

async function refreshLocalAuthState() {
  const email = env.E2E_AUTH_EMAIL?.trim() || 'e2e-local@raijinlabs.io'
  const password = env.E2E_AUTH_PASSWORD?.trim() || 'LucidE2E!23456'
  const api = await request.newContext({ baseURL })
  try {
    const response = await api.post('/api/auth/local-login', {
      headers: { 'Content-Type': 'application/json' },
      data: { email, password, mode: 'login' },
      failOnStatusCode: false,
      timeout: 120_000,
    })
    if (!response.ok()) {
      console.warn(`Could not refresh local auth state through /api/auth/local-login: ${response.status()}`)
      return false
    }
    fs.mkdirSync(path.dirname(authFile), { recursive: true })
    await api.storageState({ path: authFile })
    return true
  } finally {
    await api.dispose()
  }
}

async function seedKnowledgeFixture(page) {
  const meResponse = await page.request.get('/api/user/me')
  if (!meResponse.ok()) throw new Error(`/api/user/me failed ${meResponse.status()}`)
  const me = await meResponse.json()
  const userId = me.user?.id
  if (!userId) throw new Error('No authenticated user id')

  const stamp = Date.now()
  const slug = `knowledge_ui_${stamp}`
  let orgId = null

  try {
    await supabase.from('organizations').delete().like('slug', 'knowledge_ui_%')

    const org = await insertOne('organizations', {
      slug,
      name: `Knowledge UI ${stamp}`,
      type: 'team',
      metadata: { retail_personal_org: true, e2e_knowledge_ui: true, stamp },
    })
    orgId = org.id

    await insertOne('organization_members', {
      organization_id: org.id,
      user_id: userId,
      role: 'owner',
    })

    const project = await insertOne('projects', {
      org_id: org.id,
      name: 'Knowledge QA Project',
      slug: 'knowledge-qa-project',
      created_by: userId,
      is_default: true,
    })

    await insertOne('environments', {
      project_id: project.id,
      name: 'Development',
      is_default: true,
    }).catch(() => null)

    const crew = await insertOne('crews', {
      org_id: org.id,
      project_id: project.id,
      name: 'Knowledge QA Team',
      objective: 'Validate team memory UI semantics',
      status: 'active',
    })

    const sourceA = await insertOne('knowledge_sources', {
      org_id: org.id,
      project_id: project.id,
      source_type: 'manual',
      source_ref: `seed-source-a-${stamp}`,
      source_key: `seed-source-a-${stamp}`,
      label: 'E2E Operator Runbook',
      visibility: 'project',
      trust_level: 'operator_approved',
      federation_policy: 'source_scoped',
      retention_policy: 'audit',
      status: 'active',
      include_in_retrieval: true,
      refresh_policy: 'scheduled',
      refresh_interval_seconds: 3600,
      refresh_status: 'ok',
      next_refresh_at: new Date(Date.now() - 60_000).toISOString(),
      metadata: { stamp },
    })

    const sourceB = await insertOne('knowledge_sources', {
      org_id: org.id,
      project_id: project.id,
      source_type: 'url',
      source_ref: `https://example.com/knowledge-ui-${stamp}`,
      source_key: `seed-source-b-${stamp}`,
      label: 'E2E Stale Marketing URL',
      visibility: 'org',
      trust_level: 'observed',
      federation_policy: 'org_federated',
      retention_policy: 'standard',
      status: 'stale',
      include_in_retrieval: false,
      refresh_policy: 'manual',
      refresh_status: 'failed',
      refresh_error: 'seeded stale source',
      metadata: { stamp },
    })

    const projectTruth = 'E2E Memory QA requires source-backed project facts before release.'
    const projectPage = await insertOne('knowledge_pages', {
      org_id: org.id,
      project_id: project.id,
      source_id: sourceA.id,
      scope_type: 'project',
      subject: 'E2E Project Release Rule',
      slug: `e2e-project-release-rule-${stamp}`,
      compiled_truth: projectTruth,
      status: 'active',
      trust_level: 'operator_approved',
      confidence: 0.91,
      content_hash: hash(projectTruth),
      evidence: [{ kind: 'run', runId: `run-e2e-knowledge-${stamp}`, label: 'Seeded Agent Ops run' }],
      metadata: { stamp, sourceId: sourceA.id },
    })

    const teamTruth = 'The Knowledge QA Team reviews memory corrections before promotion.'
    await insertOne('knowledge_pages', {
      org_id: org.id,
      project_id: project.id,
      team_id: crew.id,
      source_id: sourceB.id,
      scope_type: 'team',
      subject: 'E2E Team Review Rule',
      slug: `e2e-team-review-rule-${stamp}`,
      compiled_truth: teamTruth,
      status: 'active',
      trust_level: 'observed',
      confidence: 0.72,
      content_hash: hash(teamTruth),
      evidence: [],
      metadata: { stamp, sourceId: sourceB.id },
    })

    await insertMany('org_board_memory', [
      {
        org_id: org.id,
        content: `E2E org policy ${stamp}: memory answers must cite evidence.`,
        content_hash: hash(`policy-${stamp}`),
        category: 'policy',
        importance: 0.89,
        source: 'operator',
      },
      {
        org_id: org.id,
        content: `E2E org context ${stamp}: prefer concise recall summaries.`,
        content_hash: hash(`context-${stamp}`),
        category: 'context',
        importance: 0.68,
        source: 'operator',
      },
    ])

    await insertMany('knowledge_entities', [
      {
        org_id: org.id,
        project_id: project.id,
        source_id: sourceA.id,
        entity_type: 'project',
        canonical_name: `E2E Knowledge Project ${stamp}`,
        normalized_name: `e2e knowledge project ${stamp}`,
        description: 'Seeded project entity',
        status: 'active',
        confidence: 0.9,
        metadata: { stamp },
      },
      {
        org_id: org.id,
        team_id: crew.id,
        source_id: sourceB.id,
        entity_type: 'topic',
        canonical_name: `E2E Memory Topic ${stamp}`,
        normalized_name: `e2e memory topic ${stamp}`,
        description: 'Seeded topic entity',
        status: 'active',
        confidence: 0.8,
        metadata: { stamp },
      },
    ])

    const events = await insertMany('knowledge_maintenance_events', ['acknowledge', 'resolve', 'dismiss'].map((kind) => ({
      org_id: org.id,
      project_id: project.id,
      source_id: sourceA.id,
      page_id: projectPage.id,
      event_type: 'approval_required',
      severity: 'critical',
      title: `E2E ${kind} finding ${stamp}`,
      summary: `Seeded ${kind} finding for Knowledge UI action validation.`,
      status: 'open',
      confidence: 0.88,
      evidence: [{ kind: 'approval', label: `Seed ${kind}` }],
      metadata: { stamp, kind },
      idempotency_key: `e2e-${kind}-${stamp}`,
    })))

    const outbox = await insertOne('knowledge_l2_projection_outbox', {
      org_id: org.id,
      project_id: project.id,
      source_id: sourceA.id,
      page_id: projectPage.id,
      local_resource_type: 'knowledge_page',
      local_resource_id: projectPage.id,
      projection_policy: 'commitment_only',
      namespace: `e2e.knowledge.${stamp}`,
      content_hash: hash(projectTruth),
      payload_redacted: { subject: projectPage.subject },
      status: 'projected',
      metadata: { stamp },
      projected_at: new Date().toISOString(),
    })

    await insertOne('knowledge_l2_projection_receipts', {
      org_id: org.id,
      outbox_id: outbox.id,
      local_resource_type: 'knowledge_page',
      local_resource_id: projectPage.id,
      namespace: `e2e.knowledge.${stamp}`,
      l2_memory_id: `l2-e2e-${stamp}`,
      content_hash: hash(projectTruth),
      receipt_hash: hash(`receipt-${stamp}`),
      snapshot_cid: `bafy-e2e-${stamp}`,
      anchor_epoch_id: `epoch-${stamp}`,
      anchor_status: 'verified',
      verification_status: 'verified',
      verification_payload: { stamp },
    })

    const candidates = await insertMany('knowledge_engine_home_projection_candidates', [
      {
        org_id: org.id,
        project_id: project.id,
        engine: 'hermes',
        home_kind: 'hermes_hhv',
        home_authority: 'local_authoritative',
        resource_type: 'memory',
        projection_policy: 'promote_to_project_brain',
        status: 'candidate',
        path: `/hhv/e2e/promote-${stamp}`,
        content_hash: hash(`candidate-promote-${stamp}`),
        summary: `E2E promoted engine-home summary ${stamp}`,
        payload_redacted: { stamp },
        source_snapshot_id: `snap-promote-${stamp}`,
        metadata: { stamp },
      },
      {
        org_id: org.id,
        project_id: project.id,
        engine: 'openclaw',
        home_kind: 'openclaw_ohv',
        home_authority: 'evaluation_only',
        resource_type: 'local_skill',
        projection_policy: 'candidate_only',
        status: 'candidate',
        path: `/ohv/e2e/reject-${stamp}`,
        content_hash: hash(`candidate-reject-${stamp}`),
        summary: `E2E rejected engine-home summary ${stamp}`,
        payload_redacted: { stamp },
        source_snapshot_id: `snap-reject-${stamp}`,
        metadata: { stamp },
      },
    ])

    await insertOne('knowledge_retrieval_eval_cases', {
      org_id: org.id,
      project_id: project.id,
      slug: `e2e-project-release-rule-${stamp}`,
      category: 'project_fact',
      query: 'What does E2E Memory QA require before release?',
      expected_item_ids: [projectPage.id],
      expected_citation_keys: [`run:run-e2e-knowledge-${stamp}`],
      required_layers: ['project_brain'],
      baseline_top_item_id: projectPage.id,
      status: 'active',
      metadata: { stamp, maxLatencyMs: 5000 },
    })

    return { stamp, org, project, crew, sourceA, events, candidates }
  } catch (error) {
    if (orgId) await supabase.from('organizations').delete().eq('id', orgId)
    throw error
  }
}

async function main() {
  fs.mkdirSync(screenshotDir, { recursive: true })
  await refreshLocalAuthState()
  if (!fs.existsSync(authFile)) throw new Error(`Missing Playwright auth state: ${authFile}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    baseURL,
    storageState: authFile,
    viewport: { width: 1440, height: 1100 },
  })
  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  const failedResponses = []
  let activeOrgId = null

  function shouldTrackFailedResponse(url) {
    if (url.includes('/api/workspace?') || url.includes('/api/crews?')) {
      return activeOrgId ? url.includes(activeOrgId) : false
    }
    return true
  }

  function isTransientRateLimitPageError(message) {
    return [
      'Archive source failed',
      'Finding acknowledged',
      'Finding resolved',
      'Finding dismissed',
    ].some((expected) => message.includes(expected))
  }

  page.on('console', (msg) => {
    const text = msg.text()
    if (
      msg.type() === 'error'
      && !text.includes('Failed to load resource: the server responded with a status of 400')
      && !text.includes('Failed to load resource: the server responded with a status of 429')
      && !text.includes('Failed to load resource: the server responded with a status of 404')
      && !text.includes('Failed to load resource: the server responded with a status of 403')
      && !text.includes("Framing 'https://auth.privy.io/' violates")
      && !text.includes('Error checking Cross-Origin-Opener-Policy')
    ) {
      consoleErrors.push(text)
    }
  })
  page.on('pageerror', (error) => {
    if (!isTransientRateLimitPageError(error.message)) pageErrors.push(error.message)
  })
  page.on('response', (response) => {
    if (
      response.status() >= 400
      && response.status() !== 429
      && response.url().startsWith(baseURL)
      && !response.url().includes('/_next/static/')
      && !response.url().includes('/agents-preview/knowledge')
      && shouldTrackFailedResponse(response.url())
    ) {
      failedResponses.push(`${response.status()} ${response.url()}`)
    }
  })

  const fixture = await seedKnowledgeFixture(page)
  const { stamp, org, project, crew, sourceA, events, candidates } = fixture
  activeOrgId = org.id

  await page.goto(`/${org.slug}/mission-control/knowledge`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  await page.screenshot({ path: path.join(screenshotDir, 'mission-control-knowledge-seeded.png'), fullPage: true })

  for (const text of [
    '1 project · 1 team pages',
    '1/2',
    '1 stale or failed refresh signals',
    'active entities available for graph-aware retrieval',
    '3 critical findings need review',
    'Why Lucid Knows This',
    'E2E Project Release Rule',
    'E2E Team Review Rule',
    '50%',
    '1/2 scoped facts have evidence',
    '8/7',
    'channels/runtimes use the shared Knowledge API contract',
    'correct, archive',
    'Benchmarks',
    'E2E Operator Runbook',
    'E2E Stale Marketing URL',
    'Engine Home Candidates',
    `/hhv/e2e/promote-${stamp}`,
    `/ohv/e2e/reject-${stamp}`,
    'Verifiable Memory Proofs',
    `e2e.knowledge.${stamp}`,
  ]) {
    if (!(await getTextVisible(page, text))) {
      throw new Error(`Expected visible text missing: ${text}`)
    }
  }

  await page.goto(`/${org.slug}/knowledge`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  await ensureBrowserCsrf(page)
  await page.screenshot({ path: path.join(screenshotDir, 'knowledge-manager-seeded.png'), fullPage: true })
  for (const text of [
    'Workspace Brain',
    'What agents know, believe, obey, cite, and recall.',
    'Your agents have one source of truth.',
    'Add to Brain',
    'Context',
    'Knowledge',
    'Health',
  ]) {
    if (!(await getTextVisible(page, text))) {
      throw new Error(`Expected Knowledge Manager text missing: ${text}`)
    }
  }

  await page.getByRole('button', { name: 'Knowledge', exact: true }).click()
  await waitForText(page, 'Knowledge base')
  for (const text of [
    'Manage what agents can retrieve and cite.',
    'All',
    'Facts',
    'Documents',
    'Sources',
  ]) {
    if (!(await getTextVisible(page, text))) {
      throw new Error(`Expected Knowledge library text missing: ${text}`)
    }
  }

  const managerFactSubject = `E2E Manager Fact ${stamp}`
  const managerFactTruth = `E2E Manager Fact ${stamp}: self-serve facts write into shared memory.`
  await page.getByRole('button', { name: 'Facts', exact: true }).click()
  await waitForText(page, 'E2E Project Release Rule')
  await page.getByRole('button', { name: /^Add fact$/ }).first().click()
  await page.getByLabel('Fact title').fill(managerFactSubject)
  await page.getByLabel('What should agents know?').fill(managerFactTruth)
  await clickAndWaitForResponse(
    page,
    page.getByRole('button', { name: 'Save fact' }),
    '/api/knowledge/facts',
    'knowledge manager save fact',
  )
  await page.goto(`/${org.slug}/knowledge?tab=knowledge&section=facts`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await ensureBrowserCsrf(page)
  await waitForText(page, managerFactSubject, 60_000)
  await expectDb('org_board_memory', { org_id: org.id }, (rows) => rows.some((row) => row.content === managerFactTruth), 'knowledge manager fact persisted')

  const managerFactEdited = `${managerFactTruth} Edited safely.`
  await cardForText(page, managerFactSubject).getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('What should agents know?').fill(managerFactEdited)
  await clickAndWaitForResponse(
    page,
    page.getByRole('button', { name: 'Update fact' }),
    '/api/knowledge/facts/',
    'knowledge manager edit fact',
  )
  await page.goto(`/${org.slug}/knowledge?tab=knowledge&section=facts`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await ensureBrowserCsrf(page)
  await waitForText(page, 'Edited safely', 60_000)
  await expectDb('org_board_memory', { org_id: org.id }, (rows) => rows.some((row) => row.content === managerFactEdited), 'knowledge manager fact edited')

  await cardForText(page, managerFactSubject).getByRole('button', { name: 'Archive' }).click()
  await expectDb('org_board_memory', { org_id: org.id }, (rows) => rows.some((row) => row.content === managerFactEdited && row.is_archived === true), 'knowledge manager fact archived')

  const managerDeleteSubject = `E2E Delete Fact ${stamp}`
  const managerDeleteTruth = `E2E Delete Fact ${stamp}: delete action removes board memory.`
  await page.getByRole('button', { name: /^Add fact$/ }).first().click()
  await page.getByLabel('Fact title').fill(managerDeleteSubject)
  await page.getByLabel('What should agents know?').fill(managerDeleteTruth)
  await clickAndWaitForResponse(
    page,
    page.getByRole('button', { name: 'Save fact' }),
    '/api/knowledge/facts',
    'knowledge manager save delete fact',
  )
  await page.goto(`/${org.slug}/knowledge?tab=knowledge&section=facts`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await ensureBrowserCsrf(page)
  await waitForText(page, managerDeleteSubject)
  await cardForText(page, managerDeleteSubject).getByRole('button', { name: 'Delete' }).click()
  await expectDb('org_board_memory', { org_id: org.id }, (rows) => !rows.some((row) => row.content === managerDeleteTruth), 'knowledge manager fact deleted')

  await page.getByRole('button', { name: 'Documents', exact: true }).click()
  await page.getByRole('button', { name: /^Upload document$/ }).first().click()
  await page.getByLabel('Document title').fill(`E2E Manager Document ${stamp}`)
  await page.getByLabel('Document content').fill(`# E2E Manager Document ${stamp}\n\nSelf-serve document ingestion should index chunks for shared RAG recall.`)
  await clickAndWaitForResponse(
    page,
    page.getByRole('button', { name: 'Upload document' }).nth(1),
    '/api/knowledge/documents',
    'knowledge manager upload document',
  )
  await waitForText(page, `E2E Manager Document ${stamp}`, 60_000)
  await expectDb('rag_documents', { org_id: org.id, title: `E2E Manager Document ${stamp}` }, (rows) => rows.some((row) => row.status === 'ready'), 'knowledge manager document indexed', 90_000)
  await cardForText(page, `E2E Manager Document ${stamp}`).getByRole('button', { name: 'Delete document' }).click()
  await expectDb('rag_documents', { org_id: org.id, title: `E2E Manager Document ${stamp}` }, (rows) => rows.length === 0, 'knowledge manager document deleted')

  const managerSourceLabel = `E2E Manager Source ${stamp}`
  const managerSourceEdited = `E2E Manager Source Edited ${stamp}`
  await page.getByRole('button', { name: 'Sources', exact: true }).click()
  await waitForText(page, 'E2E Operator Runbook')
  await page.getByRole('button', { name: 'Add source' }).first().click()
  await page.getByLabel('Source name').fill(managerSourceLabel)
  await page.getByLabel('URL').fill(`https://example.com/e2e-manager-source-${stamp}`)
  await clickAndWaitForResponse(
    page,
    page.getByRole('button', { name: 'Create source' }),
    '/api/knowledge/sources',
    'knowledge manager add source',
  )
  await page.goto(`/${org.slug}/knowledge?tab=knowledge&section=sources`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await ensureBrowserCsrf(page)
  await waitForText(page, managerSourceLabel, 60_000)
  await expectDb('knowledge_sources', { org_id: org.id, label: managerSourceLabel }, (rows) => rows.length === 1, 'knowledge manager source persisted')
  await cardForText(page, managerSourceLabel).getByRole('button', { name: 'Edit source' }).click()
  await page.getByLabel('Source name').fill(managerSourceEdited)
  await clickAndWaitForResponse(
    page,
    page.getByRole('button', { name: 'Update source' }),
    '/api/knowledge/sources/',
    'knowledge manager edit source',
  )
  await page.goto(`/${org.slug}/knowledge?tab=knowledge&section=sources`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await ensureBrowserCsrf(page)
  await waitForText(page, managerSourceEdited, 60_000)
  await expectDb('knowledge_sources', { org_id: org.id, label: managerSourceEdited }, (rows) => rows.length === 1, 'knowledge manager source edited')
  await clickAndWaitForResponse(
    page,
    cardForText(page, managerSourceEdited).getByRole('button', { name: 'Archive source' }),
    '/api/knowledge/sources/',
    'knowledge manager archive source',
  )
  await expectDb('knowledge_sources', { org_id: org.id, label: managerSourceEdited }, (rows) => rows[0]?.status === 'archived', 'knowledge manager source archived')

  await page.keyboard.press('t')
  await waitForText(page, 'Recall test')
  await page.getByLabel('Question').fill('What does E2E Memory QA require before release?')
  await clickAndWaitForResponse(
    page,
    page.getByRole('button', { name: /^Test$/ }),
    '/api/knowledge/test-recall',
    'knowledge manager test recall',
  )
  await waitForText(page, 'Ready for agents', 60_000)

  await page.goto(`/${org.slug}/mission-control/knowledge`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})

  const addedMemory = `E2E UI remembered fact ${stamp}: shared memory mutation works.`
  await page.getByLabel('Remember this for the organization').fill(addedMemory)
  await clickAndWaitForResponse(
    page,
    page.getByRole('button', { name: 'Remember' }),
    `/api/orgs/${org.id}/board-memory`,
    'remember memory',
  )
  await waitForText(page, addedMemory)
  await expectDb('org_board_memory', { org_id: org.id }, (rows) => rows.some((row) => row.content === addedMemory), 'remember persisted')
  await clickAndWaitForResponse(
    page,
    cardForText(page, addedMemory).getByRole('button', { name: 'Forget memory' }),
    `/api/orgs/${org.id}/board-memory`,
    'forget memory',
  )
  await page.getByText(addedMemory).waitFor({ state: 'hidden', timeout: 30_000 })
  await expectDb('org_board_memory', { org_id: org.id }, (rows) => !rows.some((row) => row.content === addedMemory), 'forget persisted')

  const correctedSubject = `E2E Corrected Knowledge ${stamp}`
  await page.getByRole('textbox', { name: 'Project id', exact: true }).fill(project.id)
  await page.getByLabel('Subject to correct or promote').fill(correctedSubject)
  await page.getByLabel('Corrected truth').fill(`Corrected truth ${stamp} is now operator approved.`)
  await page.getByRole('button', { name: 'Correct knowledge' }).click()
  await waitForText(page, correctedSubject)
  await expectDb(
    'knowledge_pages',
    { org_id: org.id, subject: correctedSubject },
    (rows) => rows.length === 1 && rows[0].trust_level === 'operator_approved',
    'correct knowledge persisted',
  )

  await cardForText(page, 'E2E Operator Runbook').getByRole('button', { name: 'Disable retrieval' }).click()
  await expectDb('knowledge_sources', { id: sourceA.id }, (rows) => rows[0]?.include_in_retrieval === false, 'source retrieval toggled off')
  await waitForText(page, 'E2E Operator Runbook')
  await cardForText(page, 'E2E Operator Runbook').getByRole('button', { name: 'Pause source' }).click()
  await expectDb('knowledge_sources', { id: sourceA.id }, (rows) => rows[0]?.status === 'paused', 'source paused')
  await cardForText(page, 'E2E Operator Runbook').getByRole('button', { name: 'Archive source' }).click()
  await expectDb('knowledge_sources', { id: sourceA.id }, (rows) => rows[0]?.status === 'archived', 'source archived')

  await clickAndWaitForResponse(
    page,
    page.getByRole('button', { name: 'Refresh due' }),
    '/api/knowledge/sources/refresh/run',
    'source refresh',
  )

  await clickAndWaitForResponse(
    page,
    cardForText(page, `E2E acknowledge finding ${stamp}`).getByRole('button', { name: 'acknowledged' }),
    `/api/knowledge/maintenance/events/${events[0].id}`,
    'acknowledge finding',
  )
  await expectDb('knowledge_maintenance_events', { id: events[0].id }, (rows) => rows[0]?.status === 'acknowledged', 'finding acknowledged')
  await clickAndWaitForResponse(
    page,
    cardForText(page, `E2E resolve finding ${stamp}`).getByRole('button', { name: 'resolved' }),
    `/api/knowledge/maintenance/events/${events[1].id}`,
    'resolve finding',
  )
  await expectDb('knowledge_maintenance_events', { id: events[1].id }, (rows) => rows[0]?.status === 'resolved', 'finding resolved')
  await clickAndWaitForResponse(
    page,
    cardForText(page, `E2E dismiss finding ${stamp}`).getByRole('button', { name: 'dismissed' }),
    `/api/knowledge/maintenance/events/${events[2].id}`,
    'dismiss finding',
  )
  await expectDb('knowledge_maintenance_events', { id: events[2].id }, (rows) => rows[0]?.status === 'dismissed', 'finding dismissed')

  await clickAndWaitForResponse(
    page,
    page.getByRole('button', { name: 'Run now' }),
    '/api/knowledge/maintenance/run',
    'brain ops',
  )

  await clickAndWaitForResponse(
    page,
    page.getByRole('button', { name: 'Replay now' }),
    '/api/knowledge/evals/replay',
    'retrieval eval replay',
  )
  await expectDb(
    'knowledge_retrieval_eval_runs',
    { org_id: org.id },
    (rows) => rows.some((row) => Number(row.case_count) >= 1),
    'eval replay recorded',
  )

  await clickAndWaitForResponse(
    page,
    cardForText(page, `/hhv/e2e/promote-${stamp}`).getByRole('button', { name: 'Promote' }),
    `/api/knowledge/engine-home/candidates/${candidates[0].id}`,
    'engine-home promote',
  )
  await expectDb(
    'knowledge_engine_home_projection_candidates',
    { id: candidates[0].id },
    (rows) => rows[0]?.status === 'promoted' && rows[0]?.promotion_target_id,
    'engine candidate promoted',
  )
  await clickAndWaitForResponse(
    page,
    cardForText(page, `/ohv/e2e/reject-${stamp}`).getByRole('button', { name: 'Reject' }),
    `/api/knowledge/engine-home/candidates/${candidates[1].id}`,
    'engine-home reject',
  )
  await expectDb('knowledge_engine_home_projection_candidates', { id: candidates[1].id }, (rows) => rows[0]?.status === 'rejected', 'engine candidate rejected')

  await page.goto('/agents-preview/knowledge', { waitUntil: 'domcontentloaded', timeout: 240_000 })
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  await page.screenshot({ path: path.join(screenshotDir, 'retail-knowledge-editor.png'), fullPage: true })
  const retailEditorAvailable = await getTextVisible(page, 'Knowledge') && await getTextVisible(page, 'Saved facts')
  if (retailEditorAvailable) {
    const retailFact = `E2E retail fact ${stamp}: retail editor writes board memory.`
    await page.getByPlaceholder('e.g. We ship orders on Mondays and Thursdays only.').fill(retailFact)
    await page.getByRole('button', { name: 'Add to knowledge' }).click()
    await waitForText(page, retailFact)
    await expectDb('org_board_memory', { org_id: org.id }, (rows) => rows.some((row) => row.content === retailFact), 'retail add persisted')
    await page
      .getByRole('listitem')
      .filter({ hasText: retailFact })
      .getByRole('button', { name: 'Delete knowledge entry' })
      .click()
    await page.getByText(retailFact).waitFor({ state: 'hidden', timeout: 30_000 })
    await expectDb('org_board_memory', { org_id: org.id }, (rows) => !rows.some((row) => row.content === retailFact), 'retail delete persisted')
  }

  const loadGateTeamTruth = `E2E team operating context ${stamp}: required team brain recall survives governed source actions.`
  const loadGateTeamPage = await insertOne('knowledge_pages', {
    org_id: org.id,
    project_id: project.id,
    team_id: crew.id,
    source_id: null,
    scope_type: 'team',
    subject: `E2E Load Team Recall ${stamp}`,
    slug: `e2e-load-team-recall-${stamp}`,
    compiled_truth: loadGateTeamTruth,
    status: 'active',
    trust_level: 'operator_approved',
    confidence: 0.95,
    content_hash: hash(loadGateTeamTruth),
    evidence: [{ kind: 'run', runId: `run-e2e-load-team-${stamp}`, label: 'Seeded retrieval load gate' }],
    metadata: { stamp, purpose: 'retrieval_load_gate' },
  })

  const mockResponse = await page.request.get('http://127.0.0.1:8789/__requests', { failOnStatusCode: false }).catch(() => null)
  const triggerBodies = mockResponse?.ok()
    ? (await mockResponse.json()).filter((request) => request.url === '/trigger').map((request) => JSON.parse(request.body))
    : []
  if (mockResponse?.ok() && !triggerBodies.some((body) => body.event_type === 'knowledge_source_refresh' && body.org_id === org.id)) {
    throw new Error('source refresh did not reach worker trigger')
  }
  if (mockResponse?.ok() && !triggerBodies.some((body) => body.event_type === 'knowledge_brain_ops' && body.org_id === org.id)) {
    throw new Error('brain ops did not reach worker trigger')
  }

  if (pageErrors.length || consoleErrors.length || failedResponses.length) {
    throw new Error(JSON.stringify({ pageErrors, consoleErrors, failedResponses }, null, 2))
  }

  const result = {
    status: 'pass',
    orgId: org.id,
    projectId: project.id,
    teamId: crew.id,
    slug: org.slug,
    retrievalGate: {
      teamPageId: loadGateTeamPage.id,
    },
    retailEditorAvailable,
    screenshots: [
      path.resolve(screenshotDir, 'mission-control-knowledge-seeded.png'),
      path.resolve(screenshotDir, 'knowledge-manager-seeded.png'),
      path.resolve(screenshotDir, 'retail-knowledge-editor.png'),
    ],
    workerTriggerEvents: triggerBodies.filter((body) => body.org_id === org.id),
  }
  console.log(JSON.stringify(result, null, 2))
  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
