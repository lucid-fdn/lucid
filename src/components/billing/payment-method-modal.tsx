'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { CreditCard, Coins, Loader2 } from 'lucide-react'
import { useState } from 'react'

interface PaymentMethodModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (provider: 'stripe' | 'nowpayments') => Promise<void>
  planName: string
  yearlyPrice: string
}

export function PaymentMethodModal({
  open,
  onOpenChange,
  onSelect,
  planName,
  yearlyPrice,
}: PaymentMethodModalProps) {
  const [loading, setLoading] = useState<'stripe' | 'nowpayments' | null>(null)

  const handleSelect = async (provider: 'stripe' | 'nowpayments') => {
    setLoading(provider)
    try {
      await onSelect(provider)
    } finally {
      setLoading(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose payment method</DialogTitle>
          <DialogDescription>
            {planName} plan — {yearlyPrice}/year
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            className="flex flex-col items-center gap-2 rounded-lg border p-4 hover:border-primary hover:bg-accent transition-colors disabled:opacity-50"
            onClick={() => handleSelect('stripe')}
            disabled={loading !== null}
          >
            {loading === 'stripe' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <CreditCard className="h-6 w-6" />
            )}
            <span className="text-sm font-medium">Card</span>
            <span className="text-xs text-muted-foreground">Visa, MC, AMEX</span>
          </button>

          <button
            className="flex flex-col items-center gap-2 rounded-lg border p-4 hover:border-primary hover:bg-accent transition-colors disabled:opacity-50"
            onClick={() => handleSelect('nowpayments')}
            disabled={loading !== null}
          >
            {loading === 'nowpayments' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Coins className="h-6 w-6" />
            )}
            <span className="text-sm font-medium">Crypto</span>
            <span className="text-xs text-muted-foreground">200+ coins</span>
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center pt-1">
          Crypto payments powered by NOWPayments
        </p>
      </DialogContent>
    </Dialog>
  )
}
