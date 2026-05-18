'use client'

import dynamic from 'next/dynamic'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function AccountIdentitiesLoadingCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Identities</CardTitle>
        <CardDescription>
          Loading connected accounts and wallet controls...
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="h-10 rounded-lg bg-muted/60" />
          <div className="h-10 rounded-lg bg-muted/40" />
        </div>
      </CardContent>
    </Card>
  )
}

const AccountIdentitiesCard = dynamic(
  () => import('@/components/settings/account-identities-card').then((mod) => mod.AccountIdentitiesCard),
  {
    ssr: false,
    loading: () => <AccountIdentitiesLoadingCard />,
  },
)

export function AccountIdentitiesCardLoader() {
  return <AccountIdentitiesCard />
}
