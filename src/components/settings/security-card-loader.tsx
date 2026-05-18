'use client'

import dynamic from 'next/dynamic'
import { Shield } from 'lucide-react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function SecurityLoadingCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle>Security</CardTitle>
        </div>
        <CardDescription>
          Loading passkey and multi-factor controls...
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

const SecurityCard = dynamic(
  () => import('@/components/settings/security-card').then((mod) => mod.SecurityCard),
  {
    ssr: false,
    loading: () => <SecurityLoadingCard />,
  },
)

export function SecurityCardLoader() {
  return <SecurityCard />
}
