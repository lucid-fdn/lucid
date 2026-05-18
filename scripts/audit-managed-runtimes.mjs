#!/usr/bin/env node

import fs from 'node:fs'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

function loadEnv(filePath) {
  const env = {}
  const raw = fs.readFileSync(filePath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    env[line.slice(0, idx)] = line.slice(idx + 1)
  }
  return env
}

function deriveServiceName(passportId) {
  if (!passportId?.startsWith('passport_')) return null
  return `agent-passport_${passportId.slice('passport_'.length, 'passport_'.length + 11)}`
}

function classifyRuntime(runtime) {
  const issues = []

  if (runtime.status !== 'connected') {
    issues.push(`status=${runtime.status}`)
  }

  if (!runtime.current_image_ref) {
    issues.push('missing_current_image_ref')
  }
  if (!runtime.target_image_ref) {
    issues.push('missing_target_image_ref')
  }
  if (runtime.current_image_ref && runtime.target_image_ref && runtime.current_image_ref !== runtime.target_image_ref) {
    issues.push('image_drift')
  }
  if (runtime.status === 'revoked' && (runtime.l2_deployment_id || runtime.deployment_url)) {
    issues.push('revoked_but_still_linked')
  }
  if (!runtime.l2_passport_id) {
    issues.push('missing_passport')
  }
  if (!runtime.managed_by_lucid) {
    issues.push('not_marked_managed')
  }
  if (runtime.auto_update_policy !== 'full_auto') {
    issues.push(`auto_update_policy=${runtime.auto_update_policy ?? 'null'}`)
  }
  if (runtime.maintenance_channel !== 'stable') {
    issues.push(`maintenance_channel=${runtime.maintenance_channel ?? 'null'}`)
  }

  return {
    id: runtime.id,
    displayName: runtime.display_name,
    engine: runtime.engine,
    runtimeFlavor: runtime.runtime_flavor,
    status: runtime.status,
    currentImageRef: runtime.current_image_ref,
    targetImageRef: runtime.target_image_ref,
    l2PassportId: runtime.l2_passport_id,
    railwayServiceName: deriveServiceName(runtime.l2_passport_id),
    issues,
  }
}

async function main() {
  const envPath = process.argv[2] || 'C:/LucidMerged/.env.local'
  const env = loadEnv(envPath)

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(`Missing Supabase env in ${envPath}`)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await supabase
    .from('dedicated_runtimes')
    .select(`
      id,
      display_name,
      engine,
      runtime_flavor,
      status,
      managed_by_lucid,
      maintenance_channel,
      auto_update_policy,
      current_image_ref,
      target_image_ref,
      last_successful_image_ref,
      l2_deployment_id,
      l2_passport_id,
      deployment_url
    `)
    .eq('provider', 'railway')
    .eq('managed_by_lucid', true)
    .neq('status', 'revoked')
    .order('display_name', { ascending: true })

  if (error) throw error

  const report = (data ?? []).map(classifyRuntime)
  const unhealthy = report.filter((runtime) => runtime.issues.length > 0)

  console.log(JSON.stringify({
    total: report.length,
    healthy: report.length - unhealthy.length,
    unhealthy: unhealthy.length,
    runtimes: report,
  }, null, 2))

  process.exitCode = unhealthy.length > 0 ? 1 : 0
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
