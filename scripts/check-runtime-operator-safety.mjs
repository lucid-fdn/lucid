#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const runtimeMaintenanceActions = ['reconcile', 'redeploy', 'restart', 'rollback', 'rehome']

const clientSurfaceRoots = [
  'src/app/(app)/[workspace-slug]/mission-control/system/runtimes',
  'src/components/assistant/agent-runtime-engine-panel.tsx',
  'src/components/mission-control',
]

const serverRuntimeSurfaceRoots = [
  'src/app/api/runtimes/[id]/maintenance',
  'src/app/api/runtimes/[id]/logs/route.ts',
  'src/lib/mission-control/runtime-client-sanitize.ts',
]

const forbiddenClientPatterns = [
  {
    name: 'raw provider failure detail',
    pattern: /Railway source deploy failed|Not Authorized|Invalid admin API key|backboard\.railway\.app/i,
  },
  {
    name: 'raw managed image reference',
    pattern: /ghcr\.io\/daishizensensei\/worker|ghcr\.io\/internal\/worker/i,
  },
  {
    name: 'raw secret env marker',
    pattern: /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_URL|RAILWAY_[A-Z0-9_]+/,
  },
]

const requiredServerSanitizers = [
  'sanitizeRuntimeForClient',
  'sanitizeRuntimeMaintenanceStateForClient',
  'Lucid provider diagnostics are being reviewed by Lucid operators.',
]

function read(rel) {
  return readFileSync(path.join(root, rel), 'utf8')
}

function walk(entry) {
  const full = path.join(root, entry)
  const info = statSync(full)
  if (info.isFile()) return [full]

  const out = []
  for (const child of readdirSync(full)) {
    const childFull = path.join(full, child)
    if (childFull.includes(`${path.sep}__tests__${path.sep}`)) continue
    const childInfo = statSync(childFull)
    if (childInfo.isDirectory()) out.push(...walk(path.relative(root, childFull)))
    else if (/\.(ts|tsx|js|mjs)$/.test(child)) out.push(childFull)
  }
  return out
}

function actionListPresent(text) {
  return runtimeMaintenanceActions.every((action) => text.includes(`'${action}'`))
}

const failures = []

const schemas = read('src/lib/mission-control/schemas.ts')
if (!actionListPresent(schemas)) {
  failures.push('src/lib/mission-control/schemas.ts is missing one or more runtime maintenance actions')
}

const types = read('src/lib/mission-control/types.ts')
for (const action of runtimeMaintenanceActions) {
  if (!types.includes(`'${action}'`)) {
    failures.push(`src/lib/mission-control/types.ts is missing RuntimeMaintenanceAction '${action}'`)
  }
}

const migration = read('supabase/migrations/20260507190000_runtime_maintenance_rehome_action.sql')
if (!actionListPresent(migration)) {
  failures.push('20260507190000_runtime_maintenance_rehome_action.sql is missing one or more runtime maintenance actions')
}

const maintenanceService = read('src/lib/runtimes/maintenance/index.ts')
if (!maintenanceService.includes("input.action === 'rehome'")) {
  failures.push('Runtime maintenance service must explicitly handle rehome actions')
}
if (maintenanceService.includes("input.action === 'rehome' ? 'redeploy' : input.action")) {
  failures.push('Runtime maintenance service must persist rehome as a first-class action after the rehome migration')
}
if (!maintenanceService.includes('const persistedAction = input.action')) {
  failures.push('Runtime maintenance service must use the requested action as the persisted maintenance action')
}

const runtimeDetailClient = read('src/app/(app)/[workspace-slug]/mission-control/system/runtimes/[runtime-id]/runtime-detail-client.tsx')
if (!runtimeDetailClient.includes('/maintenance/rehome?org_id=')) {
  failures.push('Runtime Detail must use the first-class operator re-home endpoint')
}
if (/JSON\.stringify\(\{\s*action:\s*['"]rehome['"]/.test(runtimeDetailClient)) {
  failures.push('Runtime Detail should not call generic maintenance POST for operator re-home')
}

const sanitizer = read('src/lib/mission-control/runtime-client-sanitize.ts')
for (const marker of requiredServerSanitizers) {
  if (!sanitizer.includes(marker)) {
    failures.push(`runtime-client-sanitize.ts is missing required sanitizer marker: ${marker}`)
  }
}

for (const full of clientSurfaceRoots.flatMap(walk)) {
  const rel = path.relative(root, full)
  const text = readFileSync(full, 'utf8')
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const check of forbiddenClientPatterns) {
      if (check.pattern.test(line)) {
        failures.push(`${rel}:${index + 1} ${check.name}: ${line.trim()}`)
      }
    }
  })
}

for (const full of serverRuntimeSurfaceRoots.flatMap(walk)) {
  const rel = path.relative(root, full)
  const text = readFileSync(full, 'utf8')
  if (
    rel.includes('/maintenance/') &&
    rel.endsWith('route.ts') &&
    text.includes('performRuntimeMaintenanceAction') &&
    !text.includes('sanitizeRuntimeMaintenanceStateForClient')
  ) {
    failures.push(`${rel} returns runtime maintenance state without client sanitization`)
  }
}

if (failures.length > 0) {
  console.error('Runtime operator safety gate failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('Runtime operator safety gate passed')
