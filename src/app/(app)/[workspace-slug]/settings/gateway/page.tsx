/**
 * Gateway Keys Management Page
 * 
 * Org admin surface for LucidGateway key lifecycle:
 * - Create new keys
 * - Rotate existing keys
 * - Revoke/deactivate keys
 * - View audit timeline
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getUserId } from '@/lib/auth/server-utils'
import { getWorkspaceBySlug } from '@/lib/workspace'
import { getWorkspaceCapabilities } from '@/lib/workspace/capabilities'
import { FeatureStatePanel } from '@/components/feature-state-panel'
import { getCapabilityNextAction } from '@/lib/workspace/capabilities'
import { GatewayKeysClient } from './gateway-keys-client'
import { ProviderKeysClient } from '@/components/gateway/provider-keys-client'
import { SpendAnalytics } from '@/components/gateway/spend-analytics'
import { Key, KeyRound, BarChart3 } from 'lucide-react'

interface PageProps {
  params: Promise<{ 'workspace-slug': string }>
}

export default async function GatewayKeysPage({ params }: PageProps) {
  const userId = await getUserId()
  if (!userId) redirect('/login')

  const { 'workspace-slug': slug } = await params
  const workspace = await getWorkspaceBySlug(slug)
  if (!workspace?.id) redirect('/app')

  const capabilities = await getWorkspaceCapabilities(userId, workspace.id)
  const nextAction = getCapabilityNextAction(capabilities, 'gatewayKeys')

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Gateway Keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage LucidGateway API keys for your organization
        </p>
      </div>

      <FeatureStatePanel
        state={capabilities.gatewayKeysState}
        featureName="Gateway Keys"
        description="Create and manage API keys with custom rate limits, budgets, and model access for your organization."
        nextAction={nextAction}
        icon={<Key className="h-8 w-8 text-muted-foreground" />}
      >
        <Suspense fallback={<div className="text-sm text-muted-foreground">Loading keys...</div>}>
          <GatewayKeysClient orgId={workspace.id} />
        </Suspense>
      </FeatureStatePanel>

      {/* Spend Analytics */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold">Spend Analytics</h2>
            <p className="text-sm text-muted-foreground">
              Track API spend per key and model — updated in real-time from LucidGateway.
            </p>
          </div>
        </div>
        <Suspense fallback={<div className="text-sm text-muted-foreground">Loading analytics...</div>}>
          <SpendAnalytics orgId={workspace.id} />
        </Suspense>
      </div>

      {/* Provider Keys (BYOK) — available on all tiers */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold">Provider Keys (BYOK)</h2>
            <p className="text-sm text-muted-foreground">
              Bring your own API keys for direct provider access — available on all plans.
            </p>
          </div>
        </div>
        <Suspense fallback={<div className="text-sm text-muted-foreground">Loading provider keys...</div>}>
          <ProviderKeysClient orgId={workspace.id} />
        </Suspense>
      </div>
    </div>
  )
}