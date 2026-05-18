'use client'

import { useState, useCallback } from 'react'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Wallet, Loader2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { fetchWithAuth } from '@/lib/api/interceptor'
import { WalletAddressCard } from '@/components/assistants/wallet-address-card'
import TradingPolicyForm from '@/components/trading/TradingPolicyForm'
import { PanelLayout, PanelStateCard, PanelDetailBlock, PanelInfoRow, PanelEmptyState } from '@/components/panels/panel-layout'

interface AgentWalletTabProps {
  assistantId: string
  walletEnabled: boolean
  wallets: Array<{
    id: string
    chain_type: string
    address: string
    status: string
    withdrawal_address: string | null
  }>
  userEmbeddedWallets?: { evm: string | null; solana: string | null }
  /**
   * Called after wallet state changes. Receives the new `wallet_enabled` value
   * when toggled (so parents can lift state + update hero badge instantly),
   * or `undefined` for other updates (trading policy save etc.).
   */
  onUpdate: (walletEnabled?: boolean) => void
  initialTradingPolicy?: Record<string, unknown> | null
}

const CHAIN_LABELS: Record<string, string> = {
  ethereum: 'EVM (Ethereum/Base/Arbitrum)',
  solana: 'Solana',
}

export default function AgentWalletTab({
  assistantId,
  walletEnabled: initialEnabled,
  wallets: initialWallets,
  onUpdate,
  initialTradingPolicy,
}: AgentWalletTabProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [walletEnabled, setWalletEnabled] = useState(initialEnabled)
  const [wallets, setWallets] = useState(initialWallets)
  const [confirmEnableOpen, setConfirmEnableOpen] = useState(false)

  const handleToggle = useCallback(
    async (enabled: boolean) => {
      setIsLoading(true)
      try {
        const response = await fetchWithAuth(`/api/assistants/${assistantId}/wallet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: enabled ? 'enable' : 'disable',
          }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to update wallet')
        }

        const data = await response.json()
        setWalletEnabled(data.wallet_enabled)

        if (data.wallet_enabled && data.evm) {
          const walletsRes = await fetchWithAuth(
            `/api/assistants/${assistantId}/wallet`,
          )
          if (walletsRes.ok) {
            const walletsData = await walletsRes.json()
            setWallets(walletsData.wallets || [])
          }
        } else if (!data.wallet_enabled) {
          setWallets((prev) => prev.map((w) => ({ ...w, status: 'frozen' })))
        }

        toast.success(enabled ? 'Wallet enabled' : 'Wallet disabled', {
          description: enabled
            ? 'Agent wallets created. Fund them to start trading.'
            : 'Agent wallets frozen. Funds are safe.',
        })

        onUpdate(data.wallet_enabled)
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to update wallet',
        )
      } finally {
        setIsLoading(false)
      }
    },
    [assistantId, onUpdate],
  )

  const activeWallets = wallets.filter((w) => w.status === 'active')

  return (
    <PanelLayout context="On-chain wallets for autonomous operations.">
      {/* Wallet toggle */}
      <div className="flex items-center justify-between rounded-lg border border-zinc-800/60 p-3">
        <div className="flex items-center gap-2.5">
          <Wallet className="h-3.5 w-3.5 text-zinc-500" />
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-zinc-200">Agent wallet</p>
            <p className="text-[10px] text-zinc-600">Hold and transfer tokens on-chain</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isLoading && <Loader2 className="h-3 w-3 animate-spin text-zinc-600" />}
          <Switch
            checked={walletEnabled}
            onCheckedChange={(checked) => {
              if (checked) {
                setConfirmEnableOpen(true)
              } else {
                handleToggle(false)
              }
            }}
            disabled={isLoading}
          />
        </div>
      </div>

      {walletEnabled ? (
        <>
          {/* Status card */}
          <PanelStateCard
            icon={<Wallet className="h-3.5 w-3.5 text-emerald-400" />}
            title="Wallet active"
            subtitle={`${activeWallets.length} wallet${activeWallets.length !== 1 ? 's' : ''} on Solana and EVM`}
            variant="success"
          >
            <div className="space-y-1.5">
              <PanelInfoRow label="Status" value={
                <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Enabled
                </span>
              } />
              <PanelInfoRow label="Networks" value="Solana, EVM" />
              <PanelInfoRow label="Active wallets" value={activeWallets.length} />
            </div>
          </PanelStateCard>

          {/* Wallet addresses */}
          {activeWallets.length > 0 && (
            <section>
              <p className="text-[10px] text-zinc-600 mb-2">
                Send funds to these addresses. The agent operates within your configured limits.
              </p>
              <div className="space-y-2">
                {activeWallets.map((wallet) => (
                  <WalletAddressCard
                    key={wallet.id}
                    wallet={wallet}
                    assistantId={assistantId}
                    label={CHAIN_LABELS[wallet.chain_type] || wallet.chain_type}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Trading policy */}
          <div className="border-t border-zinc-800/60 pt-3">
            <TradingPolicyForm
              assistantId={assistantId}
              onSave={() => onUpdate()}
              initialPolicy={initialTradingPolicy}
            />
          </div>
        </>
      ) : (
        <PanelEmptyState
          icon={<Wallet className="h-4 w-4 text-zinc-600" />}
          title="No wallet"
          description="Enable the agent wallet to let this agent hold tokens and execute on-chain operations."
          hint="You control what it can do through trading policies"
        />
      )}

      {/* Confirmation dialog for enabling wallet */}
      <AlertDialog open={confirmEnableOpen} onOpenChange={setConfirmEnableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable agent wallet?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates blockchain wallets for this agent, allowing it to hold and transfer tokens. You control what it can do through trading policies.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleToggle(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Enable wallet
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelLayout>
  )
}
