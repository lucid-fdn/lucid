const BROWSER_QA_WORKFLOWS = new Set([
  'qa',
  'check-page',
  'test-funnel',
  'research-site',
  'extract-data',
  'monitor-page',
  'update-portal',
  'support-repro',
  'canary',
  'design-review',
])
const BROWSER_QA_EVIDENCE = new Set(['screenshot', 'console_log', 'network_log', 'perf_metric'])

export function buildBrowserQaInstructions(params: {
  workflowId: string
  stepId: string | null
  agentOps: Record<string, unknown>
}): string | null {
  const evidenceTypes = Array.isArray(params.agentOps.evidence_types)
    ? params.agentOps.evidence_types.map((item) => String(item))
    : []
  const needsBrowserQa =
    BROWSER_QA_WORKFLOWS.has(params.workflowId) ||
    evidenceTypes.some((type) => BROWSER_QA_EVIDENCE.has(type))
  if (!needsBrowserQa) return null

  const input = asRecord(params.agentOps.input)
  const scope = asRecord(params.agentOps.scope)
  const target = getString(input?.target)
    ?? getString(input?.deployUrl)
    ?? getString(input?.deploy_url)
    ?? getString(scope?.ref)
    ?? 'the target URL or flow in the workflow input'
  const scenario = getString(input?.scenario)

  return [
    'Browser Operator instructions:',
    `- Target: ${target}`,
    ...(scenario ? [`- Scenario: ${scenario}`] : []),
    '- If a browser tool is available in this runtime, open the target and exercise the requested flow.',
    '- Capture browser-grade evidence as structured evidence items: screenshot, console_log, network_log, perf_metric, and test_result when applicable.',
    '- For screenshots, include content.url and content.viewport or viewport_width/viewport_height when known.',
    '- For console/network/perf evidence, include concise counts plus representative errors in content.',
    '- Create findings for visible UX breakage, console errors, failed 4xx/5xx requests, accessibility blockers, and serious performance issues.',
    '- If browser tooling is unavailable, say so explicitly in a test_result evidence item with content.browser_available=false and do not claim visual verification succeeded.',
  ].join('\n')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
