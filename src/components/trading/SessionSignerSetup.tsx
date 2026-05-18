'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@/components/Wallet/WalletProvider'
import { useToast } from '@/hooks/use-toast'
import { Switch } from '@/components/ui/switch'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ArrowPathIcon,
  KeyIcon,
  CheckCircleIcon,
  XCircleIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline'
import { summarizeError } from '@/lib/logging/safe-log'
import { shortenAddress } from '@/utils/address'
import { notificationCopy } from '@/lib/notifications/copy'

interface SessionSignerStatus {
  walletAddress: string
  chainStatus: Record<string, {
    enabled: boolean
    chainId: string | null
    enabledAt: string | null
  }>
  enabledChains: string[]
}

interface SessionSignerSetupProps {
  onStatusChange?: () => void
}

const CHAIN_DISPLAY: Record<string, { name: string; icon: string }> = {
  ethereum: { name: 'Ethereum', icon: '⟠' },
  solana: { name: 'Solana', icon: '◎' },
}

export default function SessionSignerSetup({ onStatusChange }: SessionSignerSetupProps) {
  const { evmWallet, solanaWallet, isConnected } = useWallet()
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState<string | null>(null)
  const [evmStatus, setEvmStatus] = useState<SessionSignerStatus | null>(null)
  const [solanaStatus, setSolanaStatus] = useState<SessionSignerStatus | null>(null)

  // Load status for a wallet
  const loadWalletStatus = useCallback(async (address: string): Promise<SessionSignerStatus | null> => {
    try {
      const response = await fetch(`/api/wallet/session-signer/status?address=${address}`)
      if (!response.ok) return null
      return await response.json()
    } catch (error) {
      console.error('Error loading wallet status:', summarizeError(error))
      return null
    }
  }, [])

  // Load all statuses
  const loadStatuses = useCallback(async () => {
    setIsLoading(true)
    try {
      const [evmResult, solanaResult] = await Promise.all([
        evmWallet?.address ? loadWalletStatus(evmWallet.address) : null,
        solanaWallet?.address ? loadWalletStatus(solanaWallet.address) : null,
      ])
      setEvmStatus(evmResult)
      setSolanaStatus(solanaResult)
    } finally {
      setIsLoading(false)
    }
  }, [evmWallet?.address, solanaWallet?.address, loadWalletStatus])

  useEffect(() => {
    if (isConnected) {
      loadStatuses()
    }
  }, [isConnected, loadStatuses])

  // Enable session signer
  const enableSessionSigner = async (
    walletAddress: string,
    chainType: 'ethereum' | 'solana'
  ) => {
    const key = `${walletAddress}-${chainType}`
    setIsUpdating(key)
    try {
      const response = await fetch('/api/wallet/session-signer/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, chainType }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to enable session signer')
      }

      toast.success(notificationCopy.title.success, `Session signer enabled for ${CHAIN_DISPLAY[chainType]?.name || chainType}`)
      await loadStatuses()
      onStatusChange?.()
    } catch (error) {
      console.error('Error enabling session signer:', summarizeError(error))
      toast.error(notificationCopy.title.error, error instanceof Error ? error.message : 'Failed to enable session signer')
    } finally {
      setIsUpdating(null)
    }
  }

  // Revoke session signer
  const revokeSessionSigner = async (
    walletAddress: string,
    chainType: 'ethereum' | 'solana'
  ) => {
    const key = `${walletAddress}-${chainType}`
    setIsUpdating(key)
    try {
      const response = await fetch('/api/wallet/session-signer/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, chainType }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to revoke session signer')
      }

      toast.success(notificationCopy.title.success, `Session signer revoked for ${CHAIN_DISPLAY[chainType]?.name || chainType}`)
      await loadStatuses()
      onStatusChange?.()
    } catch (error) {
      console.error('Error revoking session signer:', summarizeError(error))
      toast.error(notificationCopy.title.error, error instanceof Error ? error.message : 'Failed to revoke session signer')
    } finally {
      setIsUpdating(null)
    }
  }

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <ShieldExclamationIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="font-medium">No wallets connected</p>
            <p className="text-sm mt-1">Connect a wallet to set up autonomous trading</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <ArrowPathIcon className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <KeyIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-lg">Session Signers</CardTitle>
              <CardDescription>
                Enable autonomous transaction signing for your wallets. This allows AI agents to
                execute trades on your behalf without requiring manual approval for each transaction.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Warning */}
          <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <div className="flex gap-3">
              <ShieldExclamationIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium">Security Notice</p>
                <p className="mt-1">
                  Enabling session signers allows the platform to sign transactions on your behalf.
                  Your private keys remain secure, but the session signer can execute approved
                  transactions within your trading policy limits.
                </p>
              </div>
            </div>
          </div>

          {/* EVM Wallet */}
          {evmWallet?.address && (
            <WalletSessionCard
              walletType="EVM"
              address={evmWallet.address}
              chainType="ethereum"
              status={evmStatus}
              isUpdating={isUpdating === `${evmWallet.address}-ethereum`}
              onEnable={() => enableSessionSigner(evmWallet.address, 'ethereum')}
              onRevoke={() => revokeSessionSigner(evmWallet.address, 'ethereum')}
            />
          )}

          {/* Solana Wallet */}
          {solanaWallet?.address && (
            <WalletSessionCard
              walletType="Solana"
              address={solanaWallet.address}
              chainType="solana"
              status={solanaStatus}
              isUpdating={isUpdating === `${solanaWallet.address}-solana`}
              onEnable={() => enableSessionSigner(solanaWallet.address, 'solana')}
              onRevoke={() => revokeSessionSigner(solanaWallet.address, 'solana')}
            />
          )}

          {/* No wallets message */}
          {!evmWallet?.address && !solanaWallet?.address && (
            <div className="text-center py-6 text-muted-foreground">
              <p>No wallets detected. Connect a wallet to enable session signing.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Individual wallet card
function WalletSessionCard({
  walletType,
  address,
  chainType,
  status,
  isUpdating,
  onEnable,
  onRevoke,
}: {
  walletType: string
  address: string
  chainType: 'ethereum' | 'solana'
  status: SessionSignerStatus | null
  isUpdating: boolean
  onEnable: () => void
  onRevoke: () => void
}) {
  const isEnabled = status?.chainStatus?.[chainType]?.enabled || false
  const enabledAt = status?.chainStatus?.[chainType]?.enabledAt
  const chainDisplay = CHAIN_DISPLAY[chainType] || { name: chainType, icon: '?' }

  return (
    <div className="p-4 rounded-lg border border-border bg-muted">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{chainDisplay.icon}</span>
          <div>
            <p className="font-medium text-foreground">
              {walletType} Wallet
            </p>
            <p className="text-sm text-muted-foreground font-mono">{shortenAddress(address)}</p>
            {isEnabled && enabledAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Enabled {new Date(enabledAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isEnabled ? (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircleIcon className="h-5 w-5" />
              <span className="text-sm font-medium">Enabled</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <XCircleIcon className="h-5 w-5" />
              <span className="text-sm">Disabled</span>
            </div>
          )}

          <Switch
            checked={isEnabled}
            disabled={isUpdating}
            onCheckedChange={(checked) => {
              if (checked) {
                onEnable()
              } else {
                onRevoke()
              }
            }}
          />
        </div>
      </div>

      {isUpdating && (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowPathIcon className="h-4 w-4 animate-spin" />
          <span>Updating...</span>
        </div>
      )}
    </div>
  )
}
