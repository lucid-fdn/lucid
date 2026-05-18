'use client'

import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Copy, Check, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { FundingInfo, WithdrawApiResponse } from '@/lib/trading/polymarket/types'

interface FundingPanelProps {
  funding: FundingInfo | null
  loading?: boolean
  error?: string | null
  onFetchFunding: () => Promise<void>
  onWithdraw?: (recipientAddress: string, amount: string) => Promise<WithdrawApiResponse>
  className?: string
}

function CopyableAddress({ label, address }: { label: string; address: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [address])

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">{label}</p>
        <p className="text-xs font-mono text-zinc-300 truncate mt-0.5">{address}</p>
      </div>
      <button
        onClick={handleCopy}
        className="shrink-0 p-1 rounded hover:bg-zinc-800 transition-colors text-muted-foreground/40 hover:text-zinc-300"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

export function FundingPanel({
  funding,
  loading,
  error,
  onFetchFunding,
  onWithdraw,
  className,
}: FundingPanelProps) {
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [recipientAddress, setRecipientAddress] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawResult, setWithdrawResult] = useState<string | null>(null)

  // Fetch funding info on first render
  useEffect(() => {
    if (!funding && !loading && !error) {
      onFetchFunding()
    }
  }, [funding, loading, error, onFetchFunding])

  const handleWithdraw = useCallback(async () => {
    if (!onWithdraw || !recipientAddress.trim() || !withdrawAmount.trim()) return
    setWithdrawing(true)
    setWithdrawResult(null)
    try {
      const result = await onWithdraw(recipientAddress.trim(), withdrawAmount.trim())
      if (result.success) {
        setWithdrawResult('Withdrawal initiated. Send USDC.e to the provided address.')
        setRecipientAddress('')
        setWithdrawAmount('')
      } else {
        setWithdrawResult(result.error || 'Withdrawal failed')
      }
    } catch {
      setWithdrawResult('Withdrawal failed')
    } finally {
      setWithdrawing(false)
    }
  }, [onWithdraw, recipientAddress, withdrawAmount])

  if (loading) {
    return (
      <div className={cn('space-y-3 animate-pulse', className)}>
        <div className="h-16 rounded-md bg-muted/30" />
        <div className="h-16 rounded-md bg-muted/30" />
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('space-y-2', className)}>
        <p className="text-xs text-red-400/70">{error}</p>
        <Button variant="ghost" size="sm" className="text-xs" onClick={onFetchFunding}>
          Retry
        </Button>
      </div>
    )
  }

  if (!funding) {
    return (
      <div className={cn('flex items-center justify-center py-6 text-xs text-muted-foreground/50', className)}>
        No funding info available
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Deposit section */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
          <ArrowDownToLine className="h-3 w-3" />
          <span>Deposit to fund agent</span>
        </div>
        <CopyableAddress label="Solana (USDC / SOL)" address={funding.solanaDepositAddress} />
        <CopyableAddress label="EVM (Ethereum, Polygon, Base, etc.)" address={funding.evmDepositAddress} />
        <p className="text-[10px] text-muted-foreground/30 leading-relaxed">
          Deposits are auto-converted to USDC.e on Polygon for trading. Min $2.
        </p>
      </div>

      {/* Withdraw section */}
      {onWithdraw && (
        <div className="space-y-2 border-t border-zinc-800/30 pt-3">
          <button
            onClick={() => setShowWithdraw(!showWithdraw)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <ArrowUpFromLine className="h-3 w-3" />
            <span>Withdraw to Solana</span>
          </button>

          {showWithdraw && (
            <div className="space-y-2">
              <Input
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="Solana wallet address..."
                className="h-8 text-xs bg-muted/50 border-border"
              />
              <Input
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Amount (USDC)..."
                className="h-8 text-xs bg-muted/50 border-border"
              />
              <Button
                variant="ghost"
                size="sm"
                className="text-xs w-full"
                disabled={withdrawing || !recipientAddress.trim() || !withdrawAmount.trim()}
                onClick={handleWithdraw}
              >
                {withdrawing ? 'Withdrawing...' : 'Withdraw'}
              </Button>
              {withdrawResult && (
                <p className={cn(
                  'text-[10px]',
                  withdrawResult.includes('failed') ? 'text-red-400/70' : 'text-emerald-400/70',
                )}>
                  {withdrawResult}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
