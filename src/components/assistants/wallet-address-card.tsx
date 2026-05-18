'use client'

import { useState } from 'react'
import { useFundWallet } from '@privy-io/react-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Copy, ArrowUpRight, ArrowDownLeft, Check } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { fetchWithAuth } from '@/lib/api/interceptor'
import { isWeb3Enabled } from '@/lib/auth/client-config'

// ============================================================================
// Types
// ============================================================================

export interface AgentWallet {
  id: string
  chain_type: string
  address: string
  status: string
  withdrawal_address: string | null
}

interface WalletAddressCardProps {
  wallet: AgentWallet
  assistantId: string
  label: string
}

// ============================================================================
// Helpers
// ============================================================================

function chainLabel(chainType: string): string {
  return chainType === 'ethereum' ? 'EVM' : 'Solana'
}

function nativeToken(chainType: string): string {
  return chainType === 'ethereum' ? 'ETH' : 'SOL'
}

// ============================================================================
// Privy Fund Button — only mounted when Privy is available
// ============================================================================

function PrivyFundButton({ address }: { address: string }) {
  const { fundWallet } = useFundWallet()

  const handleFund = async () => {
    try {
      await fundWallet({ address })
      toast.success('Funding initiated')
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('cancel') || msg.includes('close') || msg.includes('dismiss')) return
      if (msg) toast.error(msg)
    }
  }

  return (
    <button
      type="button"
      onClick={handleFund}
      title="Fund wallet"
      className="text-zinc-600 hover:text-zinc-300 transition-colors duration-120"
    >
      <ArrowDownLeft className="h-3.5 w-3.5" />
    </button>
  )
}

// ============================================================================
// Component
// ============================================================================

export function WalletAddressCard({ wallet, assistantId, label }: WalletAddressCardProps) {
  const [dialogMode, setDialogMode] = useState<'withdraw' | null>(null)
  const [amount, setAmount] = useState('')
  const [token, setToken] = useState('native')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const closeDialog = () => setDialogMode(null)

  const copyAddress = async () => {
    await navigator.clipboard.writeText(wallet.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
    toast.success('Address copied')
  }

  const handleWithdraw = async () => {
    if (!amount.trim() || parseFloat(amount) <= 0) {
      toast.error('Enter a valid amount')
      return
    }

    setIsSubmitting(true)
    setTxHash(null)
    try {
      const response = await fetchWithAuth(
        `/api/assistants/${assistantId}/wallet/withdraw`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chainType: wallet.chain_type,
            amount: amount.trim(),
            token,
          }),
        },
      )

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Withdrawal failed')

      setTxHash(data.txHash)
      toast.success('Withdrawal submitted', {
        description: `Tx: ${data.txHash?.slice(0, 10)}...`,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Withdrawal failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-muted/40 px-3.5 py-2.5">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-zinc-600 mb-1">{label}</p>
            <code className="text-[11px] text-zinc-300 font-mono break-all">{wallet.address}</code>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <button
              type="button"
              onClick={copyAddress}
              title="Copy address"
              className="text-zinc-600 hover:text-zinc-300 transition-colors duration-120"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            {isWeb3Enabled() ? (
              <PrivyFundButton address={wallet.address} />
            ) : (
              <button
                type="button"
                onClick={() => toast.info('Wallet funding requires Privy auth')}
                title="Fund wallet"
                disabled
                className="text-zinc-700 cursor-not-allowed"
              >
                <ArrowDownLeft className="h-3.5 w-3.5" />
              </button>
            )}
            {wallet.withdrawal_address && (
              <button
                type="button"
                onClick={() => {
                  setDialogMode('withdraw')
                  setAmount('')
                  setToken('native')
                  setTxHash(null)
                }}
                title="Withdraw funds"
                className="text-zinc-600 hover:text-zinc-300 transition-colors duration-120"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Withdraw Dialog */}
      <Dialog open={dialogMode === 'withdraw'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw from {chainLabel(wallet.chain_type)} wallet</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Withdraw funds to your linked wallet.
            </DialogDescription>
          </DialogHeader>

          {txHash ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Transaction submitted successfully.
              </p>
              <div className="rounded-lg border border-border bg-muted/40 px-3.5 py-2.5">
                <p className="text-[10px] text-muted-foreground mb-1">Transaction hash</p>
                <code className="text-[11px] text-foreground font-mono break-all">{txHash}</code>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog} size="sm">Close</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/40 px-3.5 py-2.5">
                <p className="text-[10px] text-muted-foreground mb-1">Sending to</p>
                <code className="text-[11px] text-foreground font-mono break-all">{wallet.withdrawal_address}</code>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="withdraw-amount" className="text-[11px] text-muted-foreground">Amount</Label>
                <Input
                  id="withdraw-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder={`0.0 ${nativeToken(wallet.chain_type)}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isSubmitting}
                  className="h-8 text-xs bg-transparent border-border focus:border-ring"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="withdraw-token" className="text-[11px] text-muted-foreground">Token</Label>
                <Input
                  id="withdraw-token"
                  type="text"
                  placeholder="native"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={isSubmitting}
                  className="h-8 text-xs bg-transparent border-border focus:border-ring"
                />
                <p className="text-[10px] text-muted-foreground">
                  Use &quot;native&quot; for {nativeToken(wallet.chain_type)}, or a
                  token symbol like USDC, USDT, DAI.
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={closeDialog} disabled={isSubmitting} size="sm">
                  Cancel
                </Button>
                <Button onClick={handleWithdraw} disabled={isSubmitting || !amount.trim()} size="sm">
                  {isSubmitting ? 'Sending...' : 'Confirm withdrawal'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
