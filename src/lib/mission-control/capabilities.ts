/**
 * Mission Control — Capability Types
 *
 * Full type declaration (zero runtime cost).
 * Registry only populated for shipped phases.
 */

export type Capability =
  // Core (always available)
  | 'core:command-center'
  | 'core:agents'
  | 'core:live-feed'
  | 'core:approvals'
  | 'core:controls'
  | 'core:replay'
  // Standard modules
  | 'standard:conversations'
  | 'standard:integrations'
  | 'standard:economics'
  | 'standard:system'
  // Advanced (plan-gated)
  | 'advanced:health-score'
  | 'advanced:ai-copilot'
  | 'advanced:time-travel'
  | 'advanced:canvas'
  | 'advanced:ab-testing'
  | 'advanced:conversation-intel'
  | 'advanced:cost-optimizer'
  | 'advanced:auto-remediation'
  | 'advanced:agent-ops'
  | 'advanced:eval-center'
  | 'advanced:browser-qa'
  | 'advanced:browser-procedures'
  | 'advanced:browser-trust-shield'
  | 'advanced:project-learnings'
  | 'advanced:release-gates'
  | 'advanced:product-quality'
  | 'advanced:security-posture'
  | 'advanced:status-pages'
  | 'advanced:revenue-attribution'
  | 'advanced:proof-explorer'
  // SaaS-specific
  | 'saas:usage-billing'
  | 'saas:plan-limits'
  | 'saas:launchpad-stats'
  // Self-hosted / Hybrid specific
  | 'selfhosted:system-metrics'
  | 'selfhosted:worker-health'
  | 'selfhosted:otel-traces'
  | 'selfhosted:openclaw-sync'
  // Runtime management
  | 'runtime:dedicated'
  | 'runtime:byo'
  // Orchestration (DAG templates, Nerve planner — Phase 4N-c)
  | 'manage:orchestration'
  // Human work items (Pulse + Nerve human integration)
  | 'standard:work-items'
  // Shared system
  | 'system:db-health'
  | 'system:redis-health'
  | 'system:errors'

export type DeploymentMode = 'saas' | 'self-hosted' | 'hybrid'

export type PlanTier = 'free' | 'pro' | 'business'

export interface CapabilityEntry {
  id: Capability
  label: string
  module: string
  modes: DeploymentMode[]
  minPlan?: PlanTier
}
