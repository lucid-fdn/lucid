import type { AuditFinding, MigrationInventoryItem } from './audit-types'
import { createFinding, readText, walkFiles } from './audit-utils'

type MigrationDecisionRegistry = {
  noRlsTables?: Record<string, { tables: string[]; rationale: string }>
  destructiveSql?: Record<string, { statements: string[]; rationale: string }>
}

export async function buildRlsMigrationInventory(root: string): Promise<{
  items: MigrationInventoryItem[]
  findings: AuditFinding[]
}> {
  const files = await walkFiles(root, {
    includeExtensions: ['.sql'],
    includeGlobs: [/^(supabase\/migrations|migrations)\//],
  })
  const items: MigrationInventoryItem[] = []
  const findings: AuditFinding[] = []
  const decisions = await readMigrationDecisionRegistry(root)

  for (const file of files) {
    const source = await readText(root, file)
    const item = inspectMigration(file, source, decisions)
    items.push(item)
    findings.push(...findMigrationIssues(item))
  }

  return { items, findings }
}

export function inspectMigration(
  file: string,
  source: string,
  decisions: MigrationDecisionRegistry = {},
): MigrationInventoryItem {
  const lower = source.toLowerCase()
  const createsTables = [...source.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?("?[\w.]+"?)/gi)].map((match) => normalizeIdentifier(match[1]))
  const enablesRls = [...source.matchAll(/alter\s+table\s+("?[\w.]+"?)\s+enable\s+row\s+level\s+security/gi)].map((match) => normalizeIdentifier(match[1]))
  const createsPolicies = [...source.matchAll(/create\s+policy\s+("?[^"\n]+"?|\w+)/gi)].map((match) => match[1].replaceAll('"', ''))
  const securityDefinerFunctions = [...source.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w."]+)[\s\S]*?security\s+definer/gi)].map((match) => normalizeIdentifier(match[1]))
  const hasSearchPath = /set\s+search_path\s*=|set\s+search_path\s+to/i.test(source)
  const destructiveStatements = [...source.matchAll(/\b(drop\s+table|drop\s+column|truncate\s+table|delete\s+from)\b[^;\n]*/gi)].map((match) => match[0].trim())
  const riskNotes: string[] = []

  const unreviewedNoRlsTables = createsTables.filter((table) => !hasReviewedNoRlsDecision(decisions, file, table))
  const unreviewedDestructiveStatements = destructiveStatements.filter((statement) => !hasReviewedDestructiveDecision(decisions, file, statement))

  if (unreviewedNoRlsTables.length > 0 && enablesRls.length === 0 && !/no\s+rls|without\s+rls|service\s+only|private\s+table/i.test(source)) {
    riskNotes.push('creates_table_without_rls_in_same_file')
  }
  if (securityDefinerFunctions.length > 0 && !hasSearchPath) {
    riskNotes.push('security_definer_without_search_path')
  }
  if (unreviewedDestructiveStatements.length > 0 && !/rollback|safe|backfill|idempotent|if\s+exists/i.test(lower)) {
    riskNotes.push('destructive_statement_without_safety_note')
  }

  return {
    file,
    createsTables,
    enablesRls,
    createsPolicies,
    securityDefinerFunctions,
    hasSearchPath,
    destructiveStatements,
    riskNotes,
  }
}

function findMigrationIssues(item: MigrationInventoryItem): AuditFinding[] {
  const findings: AuditFinding[] = []

  if (item.riskNotes.includes('security_definer_without_search_path')) {
    findings.push(createFinding({
      severity: 'P1',
      subsystem: 'db-rls',
      title: 'Security definer function lacks explicit search_path',
      file: item.file,
      risk: 'Security definer functions without fixed search_path can be vulnerable to object-shadowing attacks.',
      recommendation: 'Set search_path explicitly inside the function definition or migration.',
      evidence: { functions: item.securityDefinerFunctions },
    }))
  }

  if (item.riskNotes.includes('creates_table_without_rls_in_same_file')) {
    findings.push(createFinding({
      severity: 'P2',
      subsystem: 'db-rls',
      title: 'Migration creates tables without enabling RLS in same file',
      file: item.file,
      risk: 'Multi-tenant tables need an explicit RLS decision. This may be safe but should be reviewed.',
      recommendation: 'Enable RLS/policies or add a clear service-only/no-RLS rationale comment.',
      evidence: { tables: item.createsTables },
    }))
  }

  if (item.riskNotes.includes('destructive_statement_without_safety_note')) {
    findings.push(createFinding({
      severity: 'P2',
      subsystem: 'db-rls',
      title: 'Destructive SQL lacks obvious safety note',
      file: item.file,
      risk: 'Destructive migrations can cause irreversible production data loss if not guarded.',
      recommendation: 'Add idempotent guards, rollback notes, or a migration comment explaining safety.',
      evidence: { statements: item.destructiveStatements },
    }))
  }

  return findings
}

function normalizeIdentifier(value: string): string {
  return value.replaceAll('"', '').trim()
}

async function readMigrationDecisionRegistry(root: string): Promise<MigrationDecisionRegistry> {
  try {
    return JSON.parse(await readText(root, 'docs/security/db-migration-decisions.json')) as MigrationDecisionRegistry
  } catch {
    return {}
  }
}

function hasReviewedNoRlsDecision(decisions: MigrationDecisionRegistry, file: string, table: string): boolean {
  const entry = decisions.noRlsTables?.[file]
  return Boolean(entry?.rationale && entry.tables.map(normalizeIdentifier).includes(table))
}

function hasReviewedDestructiveDecision(decisions: MigrationDecisionRegistry, file: string, statement: string): boolean {
  const entry = decisions.destructiveSql?.[file]
  if (!entry?.rationale) return false
  const normalizedStatement = normalizeSqlDecision(statement)
  return entry.statements.some((approved) => normalizedStatement.startsWith(normalizeSqlDecision(approved)))
}

function normalizeSqlDecision(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildRlsMigrationInventory(process.cwd())
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
