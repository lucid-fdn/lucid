"use client"

import { useWorkspace } from '@/contexts/workspace-context'
import { BillingDashboard } from '@/components/billing/billing-dashboard'

export function BillingSettings() {
  const { workspace, loading } = useWorkspace()
  
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading billing information...</p>
        </div>
      </div>
    )
  }
  
  if (!workspace) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">No Organization Found</h2>
          <p className="text-muted-foreground mt-2">
            Please create an organization to manage billing.
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Billing & Subscription</h2>
        <p className="text-muted-foreground mt-1">
          Manage your subscription, view usage, and update payment methods.
        </p>
      </div>
      
      <BillingDashboard workspace={workspace} />
    </div>
  )
}
