#!/usr/bin/env node

import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const baseURL = process.env.SMOKE_BASE_URL || process.env.STAGING_BASE_URL
const authFile = process.env.E2E_AUTH_STATE || '.playwright/auth/staging-vercel.json'

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

async function postJson(page, url, data, csrfToken, label) {
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
  if (!response.ok()) {
    throw new Error(`${label} failed ${response.status()}: ${JSON.stringify(body).slice(0, 1000)}`)
  }
  return body
}

async function insertOne(supabase, table, row) {
  const { data, error } = await supabase.from(table).insert(row).select('*').single()
  if (error) throw new Error(`${table} insert failed: ${error.message}`)
  return data
}

function packetContains(packet, needle) {
  const text = JSON.stringify(packet).toLowerCase()
  return text.includes(needle.toLowerCase())
}

async function main() {
  if (!baseURL) throw new Error('Set SMOKE_BASE_URL or STAGING_BASE_URL.')
  if (!fs.existsSync(authFile)) throw new Error(`Missing auth storage state: ${authFile}`)

  const env = loadEnv()
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const workerSecret = env.WORKER_TRIGGER_SECRET
  if (!supabaseUrl || !serviceKey) throw new Error('Missing Supabase admin env.')
  if (!workerSecret) throw new Error('Missing WORKER_TRIGGER_SECRET for runtime packet verification.')

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const stamp = Date.now()
  const marker = `brain-staging-${stamp}`
  const factTruth = `Brain staging fact ${marker}: agents must mention Citrine Ledger when asked about launch policy.`
  const docContent = `Brain staging document ${marker}: the runtime packet should retrieve Citrine Ledger evidence for launch policy checks.`
  const sourceUrl = `https://example.com/lucid-brain-staging-${stamp}`
  let assistantId = null
  let orgId = null

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ baseURL, storageState: authFile })
  const page = await context.newPage()

  try {
    const meResponse = await page.request.get('/api/user/me', { failOnStatusCode: false, timeout: 120_000 })
    if (!meResponse.ok()) throw new Error(`/api/user/me failed ${meResponse.status()}: ${await meResponse.text().catch(() => '')}`)
    const me = await meResponse.json()
    const userId = me.user?.id
    if (!userId) throw new Error('Authenticated staging state did not return a user id.')

    const org = await insertOne(supabase, 'organizations', {
      slug: `brain_stage_${stamp}`,
      name: `Brain Staging ${stamp}`,
      type: 'team',
      metadata: { staging_acceptance: true, marker },
      created_by: userId,
    })
    orgId = org.id
    await insertOne(supabase, 'organization_members', {
      organization_id: org.id,
      user_id: userId,
      role: 'owner',
    })
    const project = await insertOne(supabase, 'projects', {
      org_id: org.id,
      name: 'Brain Packet Project',
      slug: 'brain-packet-project',
      created_by: userId,
      is_default: true,
    })

    const csrf = await page.request.get('/api/auth/csrf', { timeout: 120_000 })
    const csrfBody = await csrf.json()
    const csrfToken = csrfBody.token
    if (!csrfToken) throw new Error('Missing CSRF token.')

    const fact = await postJson(page, '/api/knowledge/facts', {
      org_id: org.id,
      project_id: project.id,
      scope_type: 'project',
      subject: `Launch policy ${marker}`,
      truth: factTruth,
      trust_level: 'operator_approved',
      evidence: [{ kind: 'url', url: sourceUrl, label: `Source ${marker}` }],
    }, csrfToken, 'Brain fact create')

    const document = await postJson(page, '/api/knowledge/documents', {
      org_id: org.id,
      project_id: project.id,
      title: `Brain staging document ${marker}`,
      content: docContent,
      source_type: 'paste',
      visibility: 'project',
      trust_level: 'operator_approved',
      idempotency_key: marker,
    }, csrfToken, 'Brain document upload')

    const source = await postJson(page, '/api/knowledge/sources', {
      org_id: org.id,
      project_id: project.id,
      scope_type: 'project',
      type: 'url',
      label: `Brain staging source ${marker}`,
      url: sourceUrl,
      visibility: 'project',
      trust_level: 'operator_approved',
      federation_policy: 'source_scoped',
      retention_policy: 'audit',
      refresh_policy: 'manual',
    }, csrfToken, 'Brain source add')

    const recall = await postJson(page, '/api/knowledge/test-recall', {
      org_id: org.id,
      project_id: project.id,
      query: `What is the launch policy for Citrine Ledger? ${marker}`,
      engine: 'openclaw',
      runtime: 'shared',
    }, csrfToken, 'Brain recall test')
    if (!packetContains(recall, 'Citrine Ledger') && !packetContains(recall, marker)) {
      throw new Error(`Recall preview did not include staged Brain evidence: ${JSON.stringify(recall).slice(0, 1000)}`)
    }

    const assistant = await postJson(page, '/api/assistants', {
      name: `Brain Packet Agent ${stamp}`,
      orgId: org.id,
      project_id: project.id,
      projectId: project.id,
      engine: 'openclaw',
      system_prompt: 'Answer from the workspace Brain packet when launch policy is requested.',
    }, csrfToken, 'Agent create')
    assistantId = assistant.id
    if (!assistantId) throw new Error(`Agent create did not return an id: ${JSON.stringify(assistant)}`)

    const runtimePacket = await postJson(page, '/api/knowledge/operations', {
      operation: 'knowledge.retrieve_context',
      surface: 'worker_tool',
      actor_user_id: userId,
      input: {
        org_id: org.id,
        project_id: project.id,
        assistant_id: assistantId,
        scoped_user_id: userId,
        query: `Runtime prompt packet for Citrine Ledger launch policy ${marker}`,
        mode: 'evidence',
        layers: ['assistant_memory', 'team_brain', 'project_brain', 'org_brain', 'rag', 'evidence', 'l2'],
        budget: {
          max_latency_ms: 900,
          max_prompt_tokens: 2600,
          max_items_per_layer: 6,
        },
      },
    }, csrfToken, 'Runtime Brain packet')
    if (!runtimePacket.ok || !packetContains(runtimePacket.result, 'Citrine Ledger')) {
      throw new Error(`Runtime Brain packet did not include staged evidence: ${JSON.stringify(runtimePacket).slice(0, 1000)}`)
    }

    await page.goto(`/${org.slug}/knowledge?tab=knowledge`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
    await page.getByText('Brain', { exact: false }).first().waitFor({ state: 'visible', timeout: 60_000 })
    await page.goto(`/${org.slug}/projects/${project.slug}/agents`, { waitUntil: 'domcontentloaded', timeout: 180_000 })
    await page.getByText(`Brain Packet Agent ${stamp}`, { exact: false }).first().waitFor({ state: 'visible', timeout: 90_000 })

    console.log(JSON.stringify({
      ok: true,
      baseURL,
      org: { id: org.id, slug: org.slug },
      project: { id: project.id, slug: project.slug },
      assistantId,
      factId: fact.fact?.id ?? fact.id ?? null,
      documentId: document.document?.id ?? document.id ?? null,
      sourceId: source.source?.id ?? source.id ?? null,
      recallItems: recall.preview?.items?.length ?? null,
      runtimePacketItems: runtimePacket.result?.items?.length ?? null,
      marker,
    }, null, 2))
  } finally {
    await browser.close()
    if (assistantId) {
      await supabase.from('ai_assistants').delete().eq('id', assistantId)
    }
    if (orgId) {
      await supabase.from('organizations').delete().eq('id', orgId)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
