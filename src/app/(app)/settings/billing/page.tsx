import { getUserId } from '@/lib/auth/server-utils'
import { redirect } from 'next/navigation'
import { BillingDashboard } from '@/components/billing/billing-dashboard'
import { getUserDefaultWorkspace, getWorkspace } from '@/lib/db'

async function getUserWorkspace(userId: string) {
  try {
    const defaultWorkspace = await getUserDefaultWorkspace(userId)
    if (!defaultWorkspace?.org.id) {
      return null
    }

    return getWorkspace(userId, defaultWorkspace.org.id)
  } catch (error) {
    console.error('Error fetching workspace:', error)
    return null
  }
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string }>
}) {
  const userId = await getUserId()

  if (!userId) {
    redirect('/login')
  }

  const [workspace, params] = await Promise.all([
    getUserWorkspace(userId),
    searchParams,
  ])

  if (!workspace) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">No Organization Found</h1>
          <p className="text-muted-foreground mt-2">
            Please create an organization to manage billing.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Billing & Subscription</h1>
        <p className="text-muted-foreground mt-2">
          Manage your subscription, view usage, and update payment methods.
        </p>
      </div>

      <BillingDashboard workspace={workspace} upgradePlan={params.upgrade} />
    </div>
  )
}

export const metadata = {
  title: 'Billing & Subscription',
  description: 'Manage your subscription and billing settings',
}
