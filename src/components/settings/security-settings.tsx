"use client"

import { SecurityCardLoader } from '@/components/settings/security-card-loader'

export function SecuritySettings() {
  // Middleware already ensures authentication
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Privacy & Security</h2>
        <p className="text-muted-foreground mt-1">
          Manage your security settings and privacy preferences
        </p>
      </div>

      {/* Multi-Factor Authentication */}
      <SecurityCardLoader />
    </div>
  )
}
