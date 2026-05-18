import { execFileSync } from 'node:child_process'

import type { AuditArtifact, AuditFinding, AuditScope } from './audit-types'
import { buildArchitectureDriftInventory } from './architecture-drift'
import { buildAgentSafetyAudit } from './agent-safety-audit'
import { buildCodexReviewShards, writeCodexReviewShards } from './codex-review-shards'
import { buildDependencyAudit } from './dependency-audit'
import { buildEnvSecretInventory } from './env-secret-inventory'
import { buildPerformanceAudit } from './performance-audit'
import { buildRlsMigrationInventory } from './rls-migration-inventory'
import { buildRouteAuthInventory } from './route-auth-inventory'
import { buildStaticSecurityScan } from './static-security-scan'
import { buildUiPageInventory } from './ui-page-inventory'
import { buildUiUxAudit } from './ui-ux-audit'
import { runCommand, writeJson } from './audit-utils'
import { writeAuditReport } from './write-audit-report'

interface CliOptions {
  scope: AuditScope
  strict: boolean
  runCommands: boolean
}

const DATE_STAMP = '2026-05-15'

async function main() {
  const root = process.cwd()
  const options = parseArgs(process.argv.slice(2))
  const artifacts: AuditArtifact[] = []
  const findings: AuditFinding[] = []
  const commands = []

  if (shouldRun(options.scope, ['all', 'security', 'static-security', 'agent-safety'])) {
    if (shouldRun(options.scope, ['all', 'security'])) {
      const routeInventory = await buildRouteAuthInventory(root)
      const path = `docs/generated/route-auth-inventory-${DATE_STAMP}.json`
      await writeJson(root, path, routeInventory.items)
      artifacts.push({ name: 'route-auth-inventory', path, summary: `${routeInventory.items.length} API routes inspected`, data: summarize(routeInventory.items.length) })
      findings.push(...routeInventory.findings)

      const envInventory = await buildEnvSecretInventory(root)
      const envPath = `docs/generated/env-secret-inventory-${DATE_STAMP}.json`
      await writeJson(root, envPath, envInventory.items)
      artifacts.push({ name: 'env-secret-inventory', path: envPath, summary: `${envInventory.items.length} env/secret references inspected`, data: summarize(envInventory.items.length) })
      findings.push(...envInventory.findings)

      const rlsInventory = await buildRlsMigrationInventory(root)
      const rlsPath = `docs/generated/rls-migration-inventory-${DATE_STAMP}.json`
      await writeJson(root, rlsPath, rlsInventory.items)
      artifacts.push({ name: 'rls-migration-inventory', path: rlsPath, summary: `${rlsInventory.items.length} SQL migrations inspected`, data: summarize(rlsInventory.items.length) })
      findings.push(...rlsInventory.findings)
    }

    if (shouldRun(options.scope, ['all', 'security', 'static-security'])) {
      const staticSecurity = await buildStaticSecurityScan(root)
      const staticSecurityPath = `docs/generated/static-security-scan-${DATE_STAMP}.json`
      await writeJson(root, staticSecurityPath, { items: staticSecurity.items, findings: staticSecurity.findings })
      artifacts.push({ name: 'static-security-scan', path: staticSecurityPath, summary: `${staticSecurity.items.length} security-sensitive patterns inspected`, data: summarize(staticSecurity.items.length) })
      findings.push(...staticSecurity.findings)
    }

    if (shouldRun(options.scope, ['all', 'security', 'agent-safety'])) {
      const agentSafety = await buildAgentSafetyAudit(root)
      const agentSafetyPath = `docs/generated/agent-safety-audit-${DATE_STAMP}.json`
      await writeJson(root, agentSafetyPath, { items: agentSafety.items, findings: agentSafety.findings })
      artifacts.push({ name: 'agent-safety-audit', path: agentSafetyPath, summary: `${agentSafety.items.length} agent-safety surfaces inspected`, data: summarize(agentSafety.items.length) })
      findings.push(...agentSafety.findings)
    }
  }

  if (shouldRun(options.scope, ['all', 'dependency'])) {
    const dependencyAudit = await buildDependencyAudit(root)
    const path = `docs/generated/dependency-audit-${DATE_STAMP}.json`
    await writeJson(root, path, { items: dependencyAudit.items, findings: dependencyAudit.findings })
    artifacts.push({ name: 'dependency-audit', path, summary: `${dependencyAudit.items.length} dependencies inspected`, data: summarize(dependencyAudit.items.length) })
    findings.push(...dependencyAudit.findings)
  }

  if (shouldRun(options.scope, ['all', 'architecture'])) {
    const architecture = await buildArchitectureDriftInventory(root)
    const path = `docs/generated/code-cleanup-inventory-${DATE_STAMP}.json`
    await writeJson(root, path, architecture.items)
    artifacts.push({ name: 'code-cleanup-inventory', path, summary: `${architecture.items.length} cleanup/dedup candidates generated`, data: summarize(architecture.items.length) })
    findings.push(...architecture.findings)
  }

  if (shouldRun(options.scope, ['all', 'performance'])) {
    const performance = await buildPerformanceAudit(root)
    const path = `docs/generated/performance-audit-${DATE_STAMP}.json`
    await writeJson(root, path, { items: performance.items, findings: performance.findings })
    artifacts.push({ name: 'performance-audit', path, summary: `${performance.items.length} performance candidates generated`, data: summarize(performance.items.length) })
    findings.push(...performance.findings)
  }

  if (shouldRun(options.scope, ['all', 'ui', 'ui-ux'])) {
    if (shouldRun(options.scope, ['all', 'ui'])) {
      const uiPages = await buildUiPageInventory(root)
      const path = `docs/generated/ui-page-audit-${DATE_STAMP}.json`
      await writeJson(root, path, uiPages.items)
      artifacts.push({ name: 'ui-page-audit', path, summary: `${uiPages.items.length} app pages inventoried for Playwright/page audit`, data: summarize(uiPages.items.length) })
      findings.push(...uiPages.findings)
    }

    if (shouldRun(options.scope, ['all', 'ui', 'ui-ux'])) {
      const uiUx = await buildUiUxAudit(root)
      const uiUxPath = `docs/generated/ui-ux-audit-${DATE_STAMP}.json`
      await writeJson(root, uiUxPath, { items: uiUx.items, findings: uiUx.findings })
      artifacts.push({ name: 'ui-ux-audit', path: uiUxPath, summary: `${uiUx.items.length} UI/UX page contracts inspected`, data: summarize(uiUx.items.length) })
      findings.push(...uiUx.findings)
    }
  }

  if (shouldRun(options.scope, ['all', 'codex'])) {
    const shards = await buildCodexReviewShards(root)
    await writeCodexReviewShards(
      root,
      `docs/generated/codex-review-shards-${DATE_STAMP}.md`,
      `docs/generated/codex-review-shards-${DATE_STAMP}.json`,
    )
    artifacts.push({
      name: 'codex-review-shards',
      path: `docs/generated/codex-review-shards-${DATE_STAMP}.md`,
      summary: `${shards.length} Codex review shards generated`,
      data: summarize(shards.length),
    })
  }

  if (options.runCommands) {
    const typecheckTimeoutMs = parsePositiveInt(process.env.AUDIT_TYPECHECK_TIMEOUT_MS) ?? 600_000
    commands.push(
      await runCommand('npm', ['run', 'typecheck'], {
        cwd: root,
        timeoutMs: typecheckTimeoutMs,
        env: {
          ...process.env,
          TYPECHECK_TIMEOUT_MS: String(typecheckTimeoutMs),
        },
      }),
      await runCommand('npm', ['run', 'stack:boundaries'], { cwd: root, timeoutMs: 120_000 }),
      await runCommand('npm', ['run', 'runtime:operator-safety'], { cwd: root, timeoutMs: 120_000 }),
    )
  }

  const report = await writeAuditReport(root, {
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    commit: git(['rev-parse', '--short', 'HEAD']),
    scope: options.scope,
    strict: options.strict,
    findings,
    artifacts,
    commands,
    markdownPath: `docs/generated/whole-codebase-audit-${DATE_STAMP}.md`,
    jsonPath: `docs/generated/whole-codebase-audit-findings-${DATE_STAMP}.json`,
  })

  const fail = report.summary.findingCounts.P0 > 0 || (options.strict && (report.summary.findingCounts.P1 > 0 || report.summary.failedCommandCount > 0))
  console.log(`Audit complete: P0=${report.summary.findingCounts.P0} P1=${report.summary.findingCounts.P1} P2=${report.summary.findingCounts.P2} P3=${report.summary.findingCounts.P3}`)
  console.log(`Report: docs/generated/whole-codebase-audit-${DATE_STAMP}.md`)
  if (fail) process.exit(1)
}

function parseArgs(args: string[]): CliOptions {
  const scopeArg = args.find((arg) => arg.startsWith('--scope='))?.split('=')[1] as AuditScope | undefined
  return {
    scope: scopeArg ?? 'all',
    strict: args.includes('--strict'),
    runCommands: args.includes('--run-commands'),
  }
}

function shouldRun(scope: AuditScope, scopes: AuditScope[]): boolean {
  return scopes.includes(scope)
}

function summarize(count: number): { count: number } {
  return { count }
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function git(args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
