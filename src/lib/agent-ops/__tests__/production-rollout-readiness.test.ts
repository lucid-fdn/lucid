import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8')
}

function readAgentOpsMigrations(): string {
  return readdirSync(join(root, 'supabase/migrations'))
    .filter((file) => file.includes('agent_ops') || file.includes('browser_qa'))
    .sort()
    .map((file) => read(`supabase/migrations/${file}`))
    .join('\n\n')
}

function listRouteFiles(dir = 'src/app/api/agent-ops'): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return listRouteFiles(path)
    return entry.name === 'route.ts' ? [path] : []
  })
}

describe('Agent Ops production rollout readiness', () => {
  it('keeps operator-facing Agent Ops migrations timestamp ordered and uniquely named', () => {
    const files = readdirSync(join(root, 'supabase/migrations'))
      .filter((file) => file.includes('agent_ops') || file.includes('browser_qa'))
      .sort()

    expect(files).toEqual([...new Set(files)])
    expect(files).toEqual([...files].sort())
    expect(files).toEqual(expect.arrayContaining([
      '20260428100000_agent_ops_foundation.sql',
      '20260428110000_agent_ops_browser_qa_sessions.sql',
      '20260429180000_agent_ops_review_learnings_evals.sql',
      '20260429230000_agent_ops_performance_alerts.sql',
      '20260429231000_agent_ops_notification_fanout.sql',
      '20260429233000_agent_ops_alert_resolution_events.sql',
      '20260430110000_agent_ops_rls_advisor_hardening.sql',
      '20260502100000_agent_ops_browser_procedures.sql',
      '20260502110000_agent_ops_browser_host_playbooks.sql',
      '20260502120000_agent_ops_browser_security_events.sql',
      '20260502130000_agent_ops_browser_session_events.sql',
      '20260502140000_agent_ops_browser_session_sharing.sql',
      '20260502150000_agent_ops_design_ops_profiles.sql',
      '20260503100000_agent_ops_decision_pacing.sql',
    ]))
  })

  it('enforces RLS and service-role writes on Agent Ops production tables', () => {
    const migrations = readAgentOpsMigrations()
    const tables = [
      'agent_ops_runs',
      'agent_ops_run_links',
      'agent_ops_artifacts',
      'agent_ops_findings',
      'agent_ops_browser_qa_sessions',
      'agent_ops_browser_qa_usage_events',
      'agent_ops_run_usage_events',
      'agent_ops_review_specialists',
      'project_learnings',
      'project_timeline_events',
      'workspace_decision_preferences',
      'agent_ops_eval_scenarios',
      'agent_ops_eval_runs',
      'agent_ops_eval_results',
      'agent_ops_security_attempts',
      'agent_ops_context_snapshots',
      'agent_ops_project_policies',
      'agent_ops_browser_procedures',
      'agent_ops_browser_procedure_versions',
      'agent_ops_browser_procedure_runs',
      'agent_ops_browser_host_playbooks',
      'agent_ops_browser_security_events',
      'agent_ops_browser_session_events',
      'agent_ops_browser_session_shares',
      'agent_ops_browser_session_actions',
      'agent_ops_operator_profiles',
      'agent_ops_design_feedback',
      'agent_ops_decision_events',
    ]

    for (const table of tables) {
      expect(migrations).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`)
      expect(migrations).toMatch(new RegExp(`CREATE POLICY[\\s\\S]+?ON ${table}[\\s\\S]+?auth\\.role\\(\\) = 'service_role'`))
    }
  })

  it('keeps Agent Ops API routes rate-limited', () => {
    for (const routeFile of listRouteFiles()) {
      const source = read(routeFile)
      expect(source, `${routeFile} should import rate limiting`).toContain('checkRateLimit')
      expect(source, `${routeFile} should identify the requester`).toContain('getRequestIdentifier')
      expect(source, `${routeFile} should return 429 on limit breach`).toContain('Too many requests')
    }
  })

  it('keeps alert fanout and timeline dedupe on the shared production path', () => {
    const overviewRoute = read('src/app/api/agent-ops/overview/route.ts')
    const dbAgentOps = read('src/lib/db/agent-ops.ts')
    const alertNotifications = read('src/lib/agent-ops/alert-notifications.ts')
    const alertMigration = read('supabase/migrations/20260429230000_agent_ops_performance_alerts.sql')
    const notificationMigration = read('supabase/migrations/20260429231000_agent_ops_notification_fanout.sql')

    expect(overviewRoute).toContain('recordAgentOpsProjectTimelineEvent')
    expect(overviewRoute).toContain('notifyAgentOpsPerformanceAlert')
    expect(alertNotifications).toContain('NotificationService.sendToOrgMembers')
    expect(dbAgentOps).toContain("input.eventType === 'agent_ops_performance_alert'")
    expect(dbAgentOps).toContain("readSupabaseErrorCode(error) === '23505'")
    expect(alertMigration).toContain('idx_project_timeline_events_agent_ops_perf_alert_fingerprint')
    expect(notificationMigration).toContain('idx_notifications_agent_ops_perf_alert_fingerprint')
  })

  it('keeps production gates wired to adaptive dispatch, channel reporting, and Mission Control display', () => {
    const teamOps = read('src/lib/agent-ops/team-ops.ts')
    const start = read('src/lib/agent-ops/start.ts')
    const channelNative = read('src/lib/agent-ops/channel-native.ts')
    const missionControl = read('src/app/(app)/[workspace-slug]/mission-control/agent-ops/agent-ops-client.tsx')
    const productionGates = read('src/lib/agent-ops/__tests__/production-gates.test.ts')
    const preflight = read('src/lib/agent-ops/production-preflight.ts')
    const packageJson = JSON.parse(read('package.json')) as { scripts?: Record<string, string> }
    const workerPackageJson = JSON.parse(read('worker/package.json')) as { scripts?: Record<string, string> }

    expect(teamOps).toContain('isProtectedTeamOpsSpecialist')
    expect(teamOps).toContain('security')
    expect(teamOps).toContain('billing')
    expect(teamOps).toContain('privacy')
    expect(start).toContain('specialistTelemetry?.list')
    expect(start).toContain('teamPolicyEvaluation')
    expect(channelNative).toContain('Adaptive dispatch:')
    expect(channelNative).toContain('Protected specialists:')
    expect(missionControl).toContain('Adaptive dispatch')
    expect(missionControl).toContain('Skipped for tuning')
    expect(missionControl).toContain('Decision pacing')
    expect(productionGates).toContain('blocks policy-gated launch before runtime dispatch')
    expect(productionGates).toContain('blocks incompatible runtime launch')
    expect(preflight).toContain('channel-native-smoke')
    expect(preflight).toContain('worker-channel-smoke')
    expect(preflight).toContain('web-app-smoke')
    expect(packageJson.scripts?.['test:channels:smoke']).toContain('src/lib/imessage/__tests__/hosted-commands.test.ts')
    expect(packageJson.scripts?.['test:channels:smoke']).toContain('src/app/api/webhooks/imessage/[channelId]/__tests__/route.test.ts')
    expect(workerPackageJson.scripts?.['test:channels:smoke']).toContain('src/channels/bridge/imessage/__tests__/outbound-delivery.test.ts')
  })

  it('keeps the live schema smoke aligned with Browser Operator runtime tables', () => {
    const packageJson = JSON.parse(read('package.json')) as { scripts?: Record<string, string> }
    const schemaSmoke = read('scripts/agent-ops-prod-schema-smoke.ts')
    const preflight = read('src/lib/agent-ops/production-preflight.ts')

    expect(packageJson.scripts?.['agent-ops:prod-schema-smoke']).toContain('scripts/agent-ops-prod-schema-smoke.ts')
    expect(preflight).toContain('agent-ops-prod-schema-smoke')
    expect(schemaSmoke).toContain('20260502130000_agent_ops_browser_session_events.sql')
    expect(schemaSmoke).toContain('20260502140000_agent_ops_browser_session_sharing.sql')
    expect(schemaSmoke).toContain('agent_ops_browser_session_events')
    expect(schemaSmoke).toContain('agent_ops_browser_session_shares')
    expect(schemaSmoke).toContain('agent_ops_browser_session_actions')
  })
})
