'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Info } from 'lucide-react'

export function WalletRecoveryInfo() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <CardTitle>Embedded Wallet Recovery</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg bg-muted p-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            Your embedded wallet is automatically recoverable. Simply log in 
            to receive an OTP and regain full access to your wallet.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
