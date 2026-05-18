/**
 * Centralized Access Control Components
 * 
 * Single import for all access control needs:
 * - Feature gating
 * - Upgrade prompts
 * - Role/plan checks
 */

// Main components
export { FeatureGate } from './feature-gate'
export { UpgradeBadge, UpgradeLink, UpgradeButton } from './upgrade-badge'
export { UpgradeCard, InlineUpgradePrompt } from './upgrade-card'

// Re-export hooks for convenience
export {
  useWorkspacePlan,
  useWorkspaceRole,
  usePermission,
  useFeature,
  useLimit,
  useCanPerformAction,
  usePermissions,
  useFeatures
} from '@/lib/access-control/hooks'

// Re-export types
export type { WorkspacePlan, WorkspaceRole, PlanLimits, RolePermissions } from '@/lib/access-control/types'
