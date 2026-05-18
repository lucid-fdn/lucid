import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

const ROUTINE_BOUNDARY_FILES = [
  'contracts/routine.ts',
  'src/lib/routines/registry.ts',
  'src/lib/routines/service.ts',
  'worker/src/routines/domain-adapters.ts',
  'worker/src/routines/target-context.ts',
  'worker/src/processors/scheduled.ts',
]

describe('Routine Kernel drift gates', () => {
  it('keeps domain routine targets centralized in the shared contract and registries', () => {
    const contract = read('contracts/routine.ts')
    const appRegistry = read('src/lib/routines/registry.ts')
    const workerAdapters = read('worker/src/routines/domain-adapters.ts')
    const targets = [
      'work_graph',
      'agent_ops',
      'browser_procedure',
      'knowledge',
      'engine_home',
      'plugin_job',
      'pm_sync',
    ]

    for (const target of targets) {
      expect(contract).toContain(`'${target}'`)
      expect(appRegistry).toContain(`${target}:`)
      expect(workerAdapters).toContain(`case '${target}'`)
    }
  })

  it('does not introduce new product scheduler surfaces outside the Routine boundary', () => {
    const forbidden = [
      '/api/cron',
      '/api/mission-control/tasks',
      '/api/schedules',
      'workflow_schedules',
      '/api/workflows/${workflowId}/schedules',
      '/api/workflows/[id]/schedules',
      'createScheduleAction',
      'updateScheduleAction',
      'deleteScheduleAction',
      'CREATE TABLE IF NOT EXISTS plugin_scheduled',
      'CREATE TABLE IF NOT EXISTS browser_scheduled',
      'CREATE TABLE IF NOT EXISTS knowledge_scheduled',
      'CREATE TABLE IF NOT EXISTS work_graph_scheduled',
    ]
    const allowedFiles = new Set([
      ...ROUTINE_BOUNDARY_FILES,
      'src/app/api/routines/route.ts',
      'src/app/api/routines/simulate/route.ts',
      'src/lib/routines/__tests__/kernel-drift.test.ts',
      'supabase/migrations/20260515120000_routine_kernel.sql',
    ])
    for (const file of sourceFiles(['contracts', 'src', 'worker/src', 'supabase/migrations'])) {
      if (allowedFiles.has(file)) continue
      const content = read(file)
      for (const needle of forbidden) {
        expect(content, `${file} should not introduce ${needle}`).not.toContain(needle)
      }
    }
  })

  it('keeps CI on Node 24-compatible action runtimes for routine gates', () => {
    for (const file of sourceFiles(['.github/workflows'])) {
      const content = read(file)
      expect(content, `${file} should use Node 24-compatible checkout`).not.toMatch(/actions\/checkout@v[45]/)
      expect(content, `${file} should use Node 24-compatible setup-node`).not.toMatch(/actions\/setup-node@v[45]/)
      expect(content, `${file} should use Node 24-compatible upload-artifact`).not.toMatch(/actions\/upload-artifact@v[4-6]/)
      expect(content, `${file} should use Node 24-compatible github-script`).not.toMatch(/actions\/github-script@v[78]/)
      expect(content, `${file} should not pin Node 18`).not.toMatch(/node-version:\s*['"]?18['"]?/)
      expect(content, `${file} should not pin Node 20`).not.toMatch(/node-version:\s*['"]?20['"]?/)
    }
  })
})

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

function sourceFiles(roots: string[]): string[] {
  const files: string[] = []
  const visit = (relativePath: string) => {
    const absolute = join(ROOT, relativePath)
    const stat = statSync(absolute)
    if (stat.isDirectory()) {
      if (relativePath.includes('__snapshots__')) return
      for (const entry of readdirSync(absolute)) visit(join(relativePath, entry))
      return
    }
    if (!/\.(ts|tsx|sql|ya?ml)$/.test(relativePath)) return
    files.push(relativePath)
  }
  for (const root of roots) visit(root)
  return files
}
