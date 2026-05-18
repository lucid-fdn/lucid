#!/usr/bin/env node
/**
 * Backfill L2 Passports + Receipts for existing agents.
 *
 * Directly queries Supabase + calls L2 API. No Next.js server needed.
 *
 * Usage:
 *   node scripts/backfill-passports-receipts.mjs                    # dry run
 *   node scripts/backfill-passports-receipts.mjs --apply            # provision + emit
 *   node scripts/backfill-passports-receipts.mjs --apply --limit=100
 */

import crypto from 'node:crypto'
import { config } from 'dotenv'
// Standalone maintenance script: runs outside Next.js request context.
// eslint-disable-next-line no-restricted-imports
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

// ─── Config ───

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const L2_BASE = (process.env.LUCID_API_BASE_URL || '').replace(/\/+$/, '')
const L2_KEY = process.env.LUCID_API_KEY
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET

// Fallback platform wallet (used when org owner has no Privy wallet)
let PLATFORM_WALLET = process.env.LUCID_PLATFORM_WALLET?.trim() || ''
if (!PLATFORM_WALLET && process.env.LAUNCH_AUTHORITY_KEY) {
  try {
    const { Keypair } = await import('@solana/web3.js')
    const bs58 = await import('bs58')
    const decode = bs58.default?.decode || bs58.decode
    const kp = Keypair.fromSecretKey(decode(process.env.LAUNCH_AUTHORITY_KEY.trim()))
    PLATFORM_WALLET = kp.publicKey.toBase58()
  } catch {
    // Fallback
  }
}
const RECEIPT_SIGNER_KEY = process.env.RECEIPT_SIGNER_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
if (!L2_BASE) {
  console.error('Missing LUCID_API_BASE_URL in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const limitArg = args.find(a => a.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : 50

const l2Headers = {
  'Content-Type': 'application/json',
  ...(L2_KEY && { Authorization: `Bearer ${L2_KEY}` }),
}

// ─── Helpers ───

function signReceipt(receiptHash) {
  const key = RECEIPT_SIGNER_KEY || L2_KEY || 'unsigned'
  return crypto.createHmac('sha256', key).update(receiptHash).digest('hex')
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ─── Privy Wallet Resolution (multi-tenant ownership) ───

let privyClient = null

async function getPrivyClient() {
  if (privyClient) return privyClient
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) return null
  const { PrivyClient } = await import('@privy-io/server-auth')
  privyClient = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET)
  return privyClient
}

// Cache: orgId → wallet address
const orgWalletCache = new Map()

async function resolveOrgOwnerWallet(orgId) {
  if (orgWalletCache.has(orgId)) return orgWalletCache.get(orgId)

  let wallet = PLATFORM_WALLET || null
  try {
    // Find org owner
    const { data: member } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle()

    if (member?.user_id) {
      // Get Privy DID
      const { data: link } = await supabase
        .from('identity_links')
        .select('external_id')
        .eq('user_id', member.user_id)
        .eq('provider', 'privy')
        .maybeSingle()

      if (link?.external_id) {
        const privy = await getPrivyClient()
        if (privy) {
          const privyUser = await privy.getUser(link.external_id)
          const wallets = (privyUser.linkedAccounts || []).filter(a => a.type === 'wallet')
          if (wallets[0]?.address) {
            wallet = wallets[0].address
          }
        }
      }
    }
  } catch (err) {
    console.log(`    (wallet resolve failed for org ${orgId.slice(0, 8)}...: ${err.message})`)
  }

  orgWalletCache.set(orgId, wallet)
  return wallet
}

// ─── Main ───

console.log(`\n=== L2 Passport + Receipt Backfill ===`)
console.log(`Mode:     ${apply ? 'APPLY' : 'DRY RUN'}`)
console.log(`Limit:    ${limit}`)
console.log(`L2 API:   ${L2_BASE}`)
console.log(`Supabase: ${SUPABASE_URL}\n`)

// ─── Step 1: Provision Passports ───

console.log('── Step 1: Passport Provisioning ──\n')

const { data: agentsNeedPassport, error: e1 } = await supabase
  .from('ai_assistants')
  .select('id, name, description, org_id, passport_id')
  .is('passport_id', null)
  .eq('is_active', true)
  .not('org_id', 'is', null)
  .order('created_at', { ascending: true })
  .limit(limit)

if (e1) {
  console.error('DB error:', e1.message)
  process.exit(1)
}

console.log(`  Agents without passport: ${agentsNeedPassport.length}`)

let passportCount = 0
let passportFailed = 0

for (const agent of agentsNeedPassport) {
  // Resolve org owner's wallet (multi-tenant ownership)
  const ownerWallet = agent.org_id ? await resolveOrgOwnerWallet(agent.org_id) : PLATFORM_WALLET

  if (!ownerWallet) {
    console.error(`  [SKIP] ${agent.name}: no wallet found for org`)
    passportFailed++
    continue
  }

  if (!apply) {
    console.log(`  [dry-run] Would provision: ${agent.name} (${agent.id.slice(0, 8)}...) owner=${ownerWallet.slice(0, 10)}...`)
    passportCount++
    continue
  }

  try {
    const res = await fetch(`${L2_BASE}/v1/passports`, {
      method: 'POST',
      headers: l2Headers,
      body: JSON.stringify({
        type: 'agent',
        owner: ownerWallet,
        name: agent.name,
        description: agent.description || `Lucid agent: ${agent.name}`,
        metadata: {
          agent_config: {
            system_prompt: (agent.description || agent.name).slice(0, 200),
            model_passport_id: 'gpt-4o',
          },
          deployment_config: {
            target: { type: 'railway', runtime: 'lucid-saas' },
          },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`  [FAIL] ${agent.name}: ${res.status} ${body.slice(0, 120)}`)
      passportFailed++
      continue
    }

    const data = await res.json()
    const passportId = data.passportId || data.passport_id || data.id

    if (!passportId) {
      console.error(`  [FAIL] ${agent.name}: no passportId in response`, JSON.stringify(data).slice(0, 200))
      passportFailed++
      continue
    }

    // Save to DB
    const { error: updateErr } = await supabase
      .from('ai_assistants')
      .update({ passport_id: passportId })
      .eq('id', agent.id)

    if (updateErr) {
      console.error(`  [FAIL] ${agent.name}: DB update failed: ${updateErr.message}`)
      passportFailed++
      continue
    }

    // Emit feed event
    const { error: feedErr } = await supabase.from('mc_receipt_events').insert({
      agent_id: agent.id,
      org_id: agent.org_id,
      event_type: 'passport_provisioned',
      payload: { passport_id: passportId, passport_name: agent.name, backfill: true },
    })
    if (feedErr) console.log(`    (feed event: ${feedErr.message})`)

    console.log(`  [OK] ${agent.name} → ${passportId}`)
    passportCount++

    // Rate limit: small delay between L2 calls
    await sleep(500)
  } catch (err) {
    console.error(`  [FAIL] ${agent.name}: ${err.message}`)
    passportFailed++
  }
}

console.log(`\n  Provisioned: ${passportCount}, Failed: ${passportFailed}\n`)

// ─── Step 2: Generate Receipts from Cost Data ───

console.log('── Step 2: Receipt Generation from Cost Data ──\n')

// Re-fetch agents WITH passports (including ones just provisioned)
const { data: agentsWithPassport, error: e2 } = await supabase
  .from('ai_assistants')
  .select('id, name, org_id, passport_id, lucid_model')
  .not('passport_id', 'is', null)
  .eq('is_active', true)
  .not('org_id', 'is', null)

if (e2) {
  console.error('DB error:', e2.message)
  process.exit(1)
}

if (agentsWithPassport.length === 0) {
  console.log('  No agents with passports — skipping receipt generation.\n')
} else {
  const agentIds = agentsWithPassport.map(a => a.id)
  const agentMap = new Map(agentsWithPassport.map(a => [a.id, a]))

  // Get cost tracking data
  const { data: costRows, error: e3 } = await supabase
    .from('mc_agent_cost_tracking')
    .select('agent_id, date, tokens_input, tokens_output, estimated_cost_usd, run_count')
    .in('agent_id', agentIds)
    .order('date', { ascending: true })
    .limit(limit)

  if (e3) {
    console.error('DB error:', e3.message)
    process.exit(1)
  }

  console.log(`  Agents with passports: ${agentsWithPassport.length}`)
  console.log(`  Cost tracking rows: ${costRows?.length || 0}`)

  let receiptCount = 0
  let receiptFailed = 0
  let receiptSkipped = 0

  if (!costRows || costRows.length === 0) {
    console.log('  No cost tracking data found.\n')
  } else {
    for (const row of costRows) {
      const agent = agentMap.get(row.agent_id)
      if (!agent) { receiptSkipped++; continue }

      const runId = `backfill:${row.agent_id}:${row.date}`
      const tokensIn = Number(row.tokens_input) || 0
      const tokensOut = Number(row.tokens_output) || 0

      if (tokensIn === 0 && tokensOut === 0) { receiptSkipped++; continue }

      if (!apply) {
        console.log(`  [dry-run] ${agent.name.slice(0, 20).padEnd(20)} | ${row.date} | ${tokensIn + tokensOut} tokens | ${row.run_count} runs`)
        receiptCount++
        continue
      }

      const policyHash = crypto.createHash('sha256').update('{}').digest('hex')
      const timestamp = new Date(row.date).getTime()
      const totalLatencyMs = (row.run_count || 1) * 5000

      // Build receipt hash from canonical fields
      const canonical = JSON.stringify({
        runId, modelPassportId: agent.passport_id, computePassportId: PLATFORM_WALLET,
        policyHash, runtime: 'lucid-saas', tokensIn, tokensOut, ttftMs: 0, totalLatencyMs, timestamp,
      })
      const receiptHash = crypto.createHash('sha256').update(canonical).digest('hex')
      const signature = signReceipt(receiptHash)

      // L2 API uses snake_case
      const receipt = {
        run_id: runId,
        model_passport_id: agent.passport_id,
        compute_passport_id: PLATFORM_WALLET,
        policy_hash: policyHash,
        runtime: 'lucid-saas',
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        ttft_ms: 0,
        total_latency_ms: totalLatencyMs,
        timestamp,
        receipt_hash: receiptHash,
        signature,
      }

      try {
        const res = await fetch(`${L2_BASE}/v1/receipts`, {
          method: 'POST',
          headers: l2Headers,
          body: JSON.stringify(receipt),
          signal: AbortSignal.timeout(10_000),
        })

        if (res.ok || res.status === 409) {
          const status = res.status === 409 ? 'dup' : 'ok'
          console.log(`  [${status}] ${agent.name.slice(0, 20).padEnd(20)} | ${row.date} | ${tokensIn + tokensOut} tokens`)
          receiptCount++

          // Emit feed event
          const { error: feedErr2 } = await supabase.from('mc_receipt_events').insert({
            agent_id: row.agent_id,
            org_id: agent.org_id,
            event_type: 'receipt_created',
            run_id: runId,
            payload: {
              receipt_hash: receiptHash,
              model: agent.lucid_model || 'unknown',
              tokens_in: tokensIn,
              tokens_out: tokensOut,
              backfill: true,
              date: row.date,
              run_count: row.run_count,
            },
          })
          if (feedErr2) console.log(`    (feed event: ${feedErr2.message})`)
        } else {
          const body = await res.text().catch(() => '')
          console.error(`  [FAIL] ${agent.name.slice(0, 20)} | ${row.date}: ${res.status} ${body.slice(0, 100)}`)
          receiptFailed++
        }

        await sleep(200)
      } catch (err) {
        console.error(`  [FAIL] ${agent.name.slice(0, 20)} | ${row.date}: ${err.message}`)
        receiptFailed++
      }
    }

    console.log(`\n  Receipts: ${receiptCount}, Failed: ${receiptFailed}, Skipped: ${receiptSkipped}\n`)
  }
}

// ─── Summary ───

if (!apply) {
  console.log('=== DRY RUN COMPLETE ===')
  console.log('Run with --apply to execute:\n')
  console.log(`  node scripts/backfill-passports-receipts.mjs --apply\n`)
} else {
  console.log('=== BACKFILL COMPLETE ===\n')
}
