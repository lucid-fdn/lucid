import { getUserId } from '@/lib/auth/server-utils'
import { TelegramConnect } from '@/components/settings/telegram-connect'

export const metadata = {
  title: 'Integrations',
  description: 'Connect external services to your Lucid account',
}

export default async function IntegrationsPage() {
  const userId = await getUserId()

  if (!userId) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Unable to load settings. Please try refreshing.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Integrations</h3>
        <p className="text-sm text-muted-foreground">
          Connect external services to deploy and manage agents from anywhere.
        </p>
      </div>

      <TelegramConnect />
    </div>
  )
}
