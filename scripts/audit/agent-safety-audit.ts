import type { AgentSafetyAuditItem, AuditFinding } from './audit-types'
import { createFinding, lineNumberForOffset, readText, walkFiles } from './audit-utils'

const SURFACE_PATTERNS: Array<{
  surface: AgentSafetyAuditItem['surface']
  pattern: RegExp
  guardPatterns: RegExp[]
  risk: string
}> = [
  {
    surface: 'browser',
    pattern: /\b(click|type|fill|submit|purchase|checkout|navigate|screenshot|extract)\b/i,
    guardPatterns: [/TrustShield|approval|risk|policy|allowlist|Browser Operator|browser-operator/i],
    risk: 'Browser actions should be routed through risk classification, policy, evidence, and approval gates.',
  },
  {
    surface: 'commerce',
    pattern: /\b(purchase|checkout|cart|receipt|spend|payment|merchant)\b/i,
    guardPatterns: [/approval|policy|idempot|receipt|budget|allowlist|TrustShield/i],
    risk: 'Commerce flows need policy, idempotency, approvals, and receipt evidence.',
  },
  {
    surface: 'knowledge',
    pattern: /\b(knowledge|rag|source|claim|provenance|embedding)\b/i,
    guardPatterns: [/provenance|scope|tenant|orgId|projectId|conflict|sanitize/i],
    risk: 'Knowledge/RAG needs tenant scope, provenance, conflict handling, and prompt-injection safety.',
  },
  {
    surface: 'memory',
    pattern: /\b(memory|remember|forget|preference|fact)\b/i,
    guardPatterns: [/scope|provenance|delete|archive|confidence|tenant|orgId/i],
    risk: 'Memory writes and deletion need scope, provenance, confidence, and user controls.',
  },
  {
    surface: 'channel',
    pattern: /\b(slack|discord|telegram|whatsapp|teams|imessage|webhook)\b/i,
    guardPatterns: [/signature|verify|secret|dedupe|rateLimit|idempot|tenant|orgId/i],
    risk: 'Channel ingress/delivery must verify origin, dedupe events, and preserve tenant routing.',
  },
  {
    surface: 'runtime',
    pattern: /\b(openclaw|hermes|runtime|dedicated|byo|worker|engine)\b/i,
    guardPatterns: [/compat|capabilit|policy|guard|transport|tenant|runtime-compat/i],
    risk: 'Runtime dispatch must stay engine-agnostic and capability-gated.',
  },
  {
    surface: 'tooling',
    pattern: /\b(toolCall|tool call|executeTool|oauth|credential|secret)\b/i,
    guardPatterns: [/permission|approval|scope|nango|vault|redact|policy/i],
    risk: 'Tooling needs credential isolation, scopes, redaction, and approval gates for risky actions.',
  },
]

export async function buildAgentSafetyAudit(root: string): Promise<{
  items: AgentSafetyAuditItem[]
  findings: AuditFinding[]
}> {
  const files = await walkFiles(root, {
    includeExtensions: ['.ts', '.tsx', '.mts', '.js', '.jsx', '.md'],
    includeGlobs: [/^(src|worker|packages|scripts|docs)\//],
  })
  const items: AgentSafetyAuditItem[] = []
  const findings: AuditFinding[] = []
  const reportedFindings = new Set<string>()

  for (const file of files) {
    if (isTestOrFixture(file) || file.includes('/generated/')) continue
    const source = await readText(root, file).catch(() => '')
    for (const rule of SURFACE_PATTERNS) {
      const match = firstMatch(rule.pattern, source)
      if (!match) continue

      const line = lineNumberForOffset(source, match.index)
      const window = source
        .split('\n')
        .slice(Math.max(0, line - 8), line + 8)
        .join('\n')
      const guardSignals = rule.guardPatterns
        .filter((pattern) => pattern.test(window) || pattern.test(source.slice(0, 500)))
        .map((pattern) => pattern.source)
      const item: AgentSafetyAuditItem = {
        file,
        line,
        surface: rule.surface,
        risk: rule.risk,
        hasGuardSignal: guardSignals.length > 0,
        guardSignals,
      }
      items.push(item)

      const findingKey = `${findingScopeForFile(file)}:${rule.surface}`
      if (!item.hasGuardSignal && isHighRiskRuntimeFile(file, rule.surface) && !reportedFindings.has(findingKey)) {
        reportedFindings.add(findingKey)
        findings.push(createFinding({
          severity: 'P3',
          subsystem: 'agent-safety',
          title: `Agent safety guard signal missing for ${rule.surface} surface`,
          file,
          line,
          risk: rule.risk,
          recommendation: 'Confirm this path is read-only/test-only, or route it through the shared policy/approval/provenance seam.',
          evidence: { surface: rule.surface },
        }))
      }
    }
  }

  return { items, findings }
}

function firstMatch(pattern: RegExp, source: string): RegExpExecArray | null {
  const flags = pattern.flags.replace('g', '')
  const matcher = new RegExp(pattern.source, flags)
  return matcher.exec(source)
}

function isTestOrFixture(file: string): boolean {
  return file.includes('__tests__') || file.startsWith('tests/') || /\.test\.[cm]?[jt]sx?$/.test(file) || file.includes('/test-utils/')
}

function isHighRiskRuntimeFile(file: string, surface: AgentSafetyAuditItem['surface']): boolean {
  if (file.endsWith('.md') || file.startsWith('docs/')) return false
  if (surface === 'browser') return /browser|agent-ops|commerce/.test(file)
  if (surface === 'commerce') return /commerce|checkout|browser/.test(file)
  if (surface === 'channel') return /webhooks|channels|discord|slack|telegram|whatsapp|teams|imessage/.test(file)
  if (surface === 'runtime') return /runtime|worker|engine|deploy/.test(file)
  return /api|worker|agent|knowledge|memory|tool/.test(file)
}

function findingScopeForFile(file: string): string {
  if (file.startsWith('src/app/api/')) return file.split('/').slice(0, 4).join('/')
  if (file.startsWith('src/lib/')) return file.split('/').slice(0, 3).join('/')
  if (file.startsWith('src/components/')) return file.split('/').slice(0, 3).join('/')
  if (file.startsWith('worker/src/')) return file.split('/').slice(0, 3).join('/')
  if (file.startsWith('packages/')) return file.split('/').slice(0, 2).join('/')
  return file.split('/').slice(0, 2).join('/')
}


if (import.meta.url === `file://${process.argv[1]}`) {
  buildAgentSafetyAudit(process.cwd())
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
