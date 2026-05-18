'use client'

/**
 * Gateway Keys Settings Tab
 *
 * Wrapper for GatewayKeysClient inside the settings modal.
 * Uses the centralized access-control system for plan + role gating.
 *
 * Gating flow:
 * 1. No workspace → loading/select message
 * 2. No manageSettings permission → FeatureGate hides or shows badge
 * 3. Free plan (gatewayKeyCustomLimits=false) → UpgradeCard
 * 4. Pro+ admin → Full GatewayKeysClient
 */

import { useWorkspace } from '@/contexts/workspace-context'
import {
  useWorkspacePlan,
  useWorkspaceRole,
  useFeature,
} from '@/lib/access-control/hooks'
import { UpgradeCard } from '@/components/access-control'
import { GatewayKeysClient } from '@/app/(app)/[workspace-slug]/settings/gateway/gateway-keys-client'
import { Key, Loader2 } from 'lucide-react'

export function GatewayKeysSettings() {
  const { workspace, loading } = useWorkspace()
  const { plan: _plan } = useWorkspacePlan()
  const { isOwner: _isOwner, role } = useWorkspaceRole()
  const isAdmin = role === 'owner' || role === 'admin'

  // Centralized plan feature checks
  const _hasGatewayKeys = useFeature('gatewayKeysEnabled')
  const canCustomize = useFeature('gatewayKeyCustomLimits')

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Gateway Keys</h2>
          <p className="text-sm text-muted-foreground">
            Manage LucidGateway API keys for your organization
          </p>
        </div>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  // No workspace loaded yet (edge case during context hydration)
  if (!workspace?.org?.id) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Gateway Keys</h2>
          <p className="text-sm text-muted-foreground">
            Manage LucidGateway API keys for your organization
          </p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Key className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            Select a workspace to manage Gateway Keys.
          </p>
        </div>
      </div>
    )
  }

  // Role gate: non-admins see permission message
  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Gateway Keys</h2>
          <p className="text-sm text-muted-foreground">
            Manage LucidGateway API keys for your organization
          </p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Key className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">Admin Access Required</h3>
          <p className="mt-1.5 text-sm text-muted-foreground max-w-sm text-center">
            Contact your workspace admin to manage Gateway Keys.
          </p>
        </div>
      </div>
    )
  }

  // Plan gate: free plan users see upgrade card (centralized component)
  if (!canCustomize) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">Gateway Keys</h2>
          <p className="text-sm text-muted-foreground">
            Manage LucidGateway API keys for your organization
          </p>
        </div>
        <UpgradeCard
          feature="Gateway Keys"
          requiredPlan="pro"
          benefits={[
            'Up to 25 custom API keys with aliases',
            'Custom rate limits (RPM/TPM) per key',
            'Per-key budget tracking & alerts',
            '100+ AI models access',
            '30-day audit log retention',
            'Key configuration templates',
          ]}
          disabled
          disabledMessage="Coming Soon"
        />
      </div>
    )
  }

  // Pro+ admins: full gateway keys UI
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Gateway Keys</h2>
        <p className="text-sm text-muted-foreground">
          Manage LucidGateway API keys for your organization
        </p>
      </div>
      <GatewayKeysClient orgId={workspace.org.id} />
    </div>
  )
}