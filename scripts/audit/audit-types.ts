export type AuditSeverity = 'P0' | 'P1' | 'P2' | 'P3'

export type AuditScope =
  | 'all'
  | 'security'
  | 'dependency'
  | 'static-security'
  | 'agent-safety'
  | 'performance'
  | 'architecture'
  | 'ui'
  | 'ui-ux'
  | 'codex'

export interface AuditFinding {
  id: string
  severity: AuditSeverity
  subsystem: string
  title: string
  file?: string
  line?: number
  risk: string
  recommendation: string
  status: 'open' | 'triaged' | 'fixed' | 'blocked'
  evidence?: Record<string, unknown>
}

export interface AuditArtifact<T = unknown> {
  name: string
  path: string
  summary: string
  data: T
}

export interface AuditCommandResult {
  command: string
  ok: boolean
  durationMs: number
  skipped?: boolean
  reason?: string
  stdout?: string
  stderr?: string
}

export interface AuditRunReport {
  generatedAt: string
  branch: string
  commit: string
  scope: AuditScope
  strict: boolean
  findings: AuditFinding[]
  artifacts: AuditArtifact[]
  commands: AuditCommandResult[]
  summary: {
    findingCounts: Record<AuditSeverity, number>
    artifactCount: number
    commandCount: number
    failedCommandCount: number
  }
}

export interface RouteInventoryItem {
  file: string
  routePath: string
  methods: string[]
  classification: 'public' | 'authenticated' | 'internal' | 'webhook' | 'diagnostic' | 'unknown'
  hasCsrf: boolean
  hasSessionAuth: boolean
  hasOrgContext: boolean
  hasInternalSecret: boolean
  hasWebhookSignature: boolean
  hasRateLimit: boolean
  usesServiceRole: boolean
  consumesRequestBody: boolean
  validatesBody: boolean
  mutates: boolean
  notes: string[]
}

export interface EnvSecretInventoryItem {
  file: string
  line: number
  name?: string
  kind: 'env_reference' | 'public_sensitive_env' | 'literal_secret_pattern'
  snippet: string
  risk: 'low' | 'medium' | 'high' | 'critical'
}

export interface MigrationInventoryItem {
  file: string
  createsTables: string[]
  enablesRls: string[]
  createsPolicies: string[]
  securityDefinerFunctions: string[]
  hasSearchPath: boolean
  destructiveStatements: string[]
  riskNotes: string[]
}

export interface CodeCleanupInventoryItem {
  file: string
  kind:
    | 'delete_candidate'
    | 'dedupe_candidate'
    | 'centralize_candidate'
    | 'cleanup_candidate'
    | 'split_candidate'
    | 'rename_candidate'
    | 'performance_candidate'
    | 'docs_stale_candidate'
  subsystem: string
  reason: string
  evidence: Record<string, unknown>
  recommendedAction: string
}

export interface DependencyAuditItem {
  file: string
  packageName: string
  version: string
  kind: 'dependency' | 'devDependency' | 'peerDependency' | 'optionalDependency'
  subsystem: string
  riskNotes: string[]
}

export interface StaticSecurityScanItem {
  file: string
  line: number
  pattern: string
  severity: AuditSeverity
  snippet: string
  recommendation: string
}

export interface AgentSafetyAuditItem {
  file: string
  line: number
  surface: 'browser' | 'commerce' | 'knowledge' | 'memory' | 'channel' | 'runtime' | 'tooling'
  risk: string
  hasGuardSignal: boolean
  guardSignals: string[]
}

export interface UiUxAuditItem {
  file: string
  routePath: string
  classification: UiPageInventoryItem['classification']
  visibleActionCount: number
  actionLabels: string[]
  hasMockMarkers: boolean
  hasLoadingState: boolean
  hasErrorState: boolean
  hasEmptyStateSignal: boolean
  hasDisabledExplanationSignal: boolean
  notes: string[]
}

export interface UiPageInventoryItem {
  file: string
  routePath: string
  classification: 'public' | 'authenticated' | 'admin' | 'settings' | 'mission_control' | 'template' | 'knowledge' | 'browser_operator' | 'agent_ops' | 'commerce' | 'legacy'
  hasClientComponent: boolean
  hasLoadingState: boolean
  hasErrorState: boolean
  hasMockMarkers: boolean
  actionMarkers: string[]
  dataMarkers: string[]
  notes: string[]
}

export interface CodexReviewShard {
  id: string
  title: string
  subsystem: string
  files: string[]
  riskChecklist: string[]
  suggestedCommands: string[]
  prompt: string
}
