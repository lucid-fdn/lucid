"use client"

import { ProfileInformationCard } from '@/components/settings/profile-information-card'
import { AccountIdentitiesCardLoader } from '@/components/settings/account-identities-card-loader'
import { WalletRecoveryInfo } from '@/components/settings/wallet-recovery-info'
import { DangerZoneCard } from '@/components/settings/danger-zone-card'
import { useAuth } from '@/contexts/auth-context'
import { useProfile } from '@/contexts/profile-context'

export default function AccountSettingsPage() {
  const { user } = useAuth()
  const { profile } = useProfile()
  if (!user) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Unable to load account. Please try refreshing the page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Preferences</h2>
        <p className="text-muted-foreground mt-1">
          Manage your account information and connected services
        </p>
      </div>

      {/* Profile Information */}
      <ProfileInformationCard
        defaultValues={{
          first_name: (profile as unknown as Record<string, string>)?.first_name || '',
          last_name: (profile as unknown as Record<string, string>)?.last_name || '',
          handle: profile?.handle || '',
          email: profile?.email || '',
        }}
      />

      {/* Account Identities */}
      <AccountIdentitiesCardLoader />

      {/* Danger Zone */}
      <DangerZoneCard username={profile?.handle || profile?.name || 'your account'} />
      
      {/* Wallet Recovery Info */}
      <WalletRecoveryInfo />
    </div>
  )
}
