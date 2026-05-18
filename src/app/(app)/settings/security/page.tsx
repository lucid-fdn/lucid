import { SecurityCardLoader } from '@/components/settings/security-card-loader'

export const metadata = {
  title: 'Privacy & Security Settings',
  description: 'Manage your privacy and security preferences',
}

export default function SecuritySettingsPage() {
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
