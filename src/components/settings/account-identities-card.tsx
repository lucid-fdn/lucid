'use client'

import { useState, useEffect, Component, type ReactNode, type ErrorInfo } from 'react'
import { useLinkAccount, usePrivy, useSessionSigners } from '@privy-io/react-auth'
import { isWeb3Enabled } from '@/lib/auth/client-config'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Wallet, Chrome, MessageCircle, Apple as AppleIcon, Github, Download, AlertTriangle, XCircle, Plus } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Switch } from '@/components/ui/switch'
import { getEmbeddedWallets, getExternalWallets } from '@/lib/user/user-helpers'
import { shortenAddress } from '@/utils/address'
import type { PrivyUser } from '@/lib/user/user-types'
import { Bot } from 'lucide-react'
import { CopyButton } from '@/components/ui/copy-button'
import Image from 'next/image'
import { notificationCopy } from '@/lib/notifications/copy'
import { summarizeError } from '@/lib/logging/safe-log'

// Session Signers Section Component
interface WalletInfo {
  address: string;
  walletClientType?: string;
  walletClient?: string;
  chainType?: string;
  chainId?: string;
}

function SessionSignersSection({ wallets }: { wallets: WalletInfo[] }) {
  const { addSessionSigners, removeSessionSigners } = useSessionSigners()
  const toast = useToast()
  const [sessionSignerStates, setSessionSignerStates] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  // Fetch session signer status for each wallet
  useEffect(() => {
    const fetchStatuses = async () => {
      for (const wallet of wallets) {
        try {
          const response = await fetch(`/api/wallet/session-signer/status?address=${wallet.address}`)
          const data = await response.json()
          setSessionSignerStates(prev => ({
            ...prev,
            [wallet.address]: data.enabled
          }))
        } catch (error) {
          console.error('Failed to fetch session signer status:', summarizeError(error))
        }
      }
    }

    if (wallets.length > 0) {
      fetchStatuses()
    }
  }, [wallets])

  const handleToggleSessionSigner = async (wallet: WalletInfo, enabled: boolean) => {
    setLoading(prev => ({ ...prev, [wallet.address]: true }))

    try {
      if (enabled) {
        // Enable: First add session signer via Privy
        // Note: For On-device execution, pass empty signers array
        // Privy will handle the session signer configuration automatically
        await addSessionSigners({
          address: wallet.address,
          signers: [] // Empty array for On-device execution
        })

        // Record permission in database
        const response = await fetch('/api/wallet/session-signer/enable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: wallet.address })
        })

        if (!response.ok) throw new Error('Failed to enable session signer')

        setSessionSignerStates(prev => ({ ...prev, [wallet.address]: true }))
        toast.success('Autonomous transactions enabled', 'Lucid can now sign transactions for AI agents on your behalf.')
      } else {
        // Disable: Remove from Privy and revoke in DB
        await removeSessionSigners({
          address: wallet.address
        })

        // Revoke permission in database
        const response = await fetch('/api/wallet/session-signer/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress: wallet.address })
        })

        if (!response.ok) throw new Error('Failed to revoke session signer')

        setSessionSignerStates(prev => ({ ...prev, [wallet.address]: false }))
        toast.success('Autonomous transactions disabled', 'Manual approval will be required for transactions.')
      }
    } catch (error) {
      console.error('Session signer toggle error:', summarizeError(error))
      toast.error(notificationCopy.common.failedToUpdate, error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setLoading(prev => ({ ...prev, [wallet.address]: false }))
    }
  }

  if (wallets.length === 0) return null

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2 mt-2">
      <div className="flex items-center gap-2">
        <Bot className="h-3 w-3 text-primary" />
        <p className="text-xs font-medium">Autonomous Transactions</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Allow Lucid to sign transactions on your behalf for AI agents and trading bots without requiring manual approval each time.
      </p>

      <div className="flex flex-col gap-2 pt-1">
        {wallets.map((wallet, index) => (
          <div
            key={`session-signer-${wallet.address}-${index}`}
            className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-background/50"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono">{shortenAddress(wallet.address)}</span>
            </div>
            <Switch
              checked={sessionSignerStates[wallet.address] || false}
              onCheckedChange={(checked) => handleToggleSessionSigner(wallet, checked)}
              disabled={loading[wallet.address]}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function PrivyAccountIdentitiesCardInner() {
  const { user, unlinkWallet, unlinkGoogle, unlinkDiscord, unlinkApple, unlinkGithub, exportWallet, connectWallet: _connectWallet } = usePrivy()
  const toast = useToast()
  const [unlinking, setUnlinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [showExportSection, setShowExportSection] = useState(false)

  const {
    linkWallet,
    linkGoogle,
    linkDiscord,
    linkApple,
    linkGithub,
  } = useLinkAccount({
    onSuccess: ({ linkMethod }) => {
      setError(null)
      toast.success(`${linkMethod} connected successfully`)
    },
    onError: (error) => {
      if (error === 'exited_link_flow') return
      const safeError = summarizeError(error)
      console.error('Failed to link account:', safeError)
      setError(`Failed to link account: ${safeError.message}`)
    },
  })

  // Check if user has minimum accounts (must keep at least 1)
  const canUnlink = user && user.linkedAccounts.length > 1

  // Get wallets using centralized helpers
  const embeddedWallets = getEmbeddedWallets(user as unknown as PrivyUser)
  const externalWallets = getExternalWallets(user as unknown as PrivyUser)

  // Helper to get wallet icon
  const getWalletIcon = (wallet: WalletInfo) => {
    if (wallet.walletClientType === 'metamask' || wallet.walletClient === 'metamask') {
      return '/logos/icon/metamask.svg'
    }
    if (wallet.walletClientType === 'phantom' || wallet.walletClient === 'phantom') {
      return '/logos/icon/phantom.svg'
    }
    if (wallet.walletClientType === 'coinbase_wallet' || wallet.walletClient === 'coinbase') {
      return '/logos/icon/coinbase.svg'
    }
    if (wallet.chainType === 'solana' || wallet.chainId?.includes('solana')) {
      return '/logos/icon/solana.svg'
    }
    if (wallet.chainType === 'ethereum' || wallet.chainId?.startsWith('eip155:')) {
      return '/logos/icon/ethereum.svg'
    }
    return '/logos/icon/wallet.svg'
  }

  // Helper to get wallet label
  const getWalletLabel = (wallet: WalletInfo) => {
    if (wallet.chainType === 'solana' || wallet.chainId?.includes('solana')) {
      return 'Solana'
    }
    if (wallet.chainType === 'ethereum' || wallet.chainId?.startsWith('eip155:')) {
      return 'Ethereum'
    }
    return 'Wallet'
  }

  const handleUnlinkWallet = async (address: string) => {
    if (!canUnlink) {
      setError('You must have at least one account linked')
      return
    }

    setUnlinking(true)
    setError(null)
    try {
      await unlinkWallet(address)
      toast.success('Wallet disconnected successfully')
    } catch (err: unknown) {
      console.error('Failed to unlink wallet:', summarizeError(err))
      setError('Failed to disconnect wallet. You must have at least one account linked.')
    } finally {
      setUnlinking(false)
    }
  }

  const handleExportWallet = async (address?: string) => {
    setExportError(null)
    setIsExporting(true)

    if (embeddedWallets.length === 0) {
      setExportError('You need an embedded wallet to export a private key.')
      setIsExporting(false)
      return
    }

    try {
      if (address) {
        await exportWallet({ address })
      } else {
        await exportWallet()
      }

      toast.success(notificationCopy.wallet.privateKeyExported, 'Keep it safe and never share it.')
      setIsExporting(false)
    } catch (error) {
      const safeError = summarizeError(error)
      console.error('Export failed:', safeError)
      setExportError(`Export failed: ${safeError.message}`)
      setIsExporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Identities</CardTitle>
        <CardDescription>
          Manage your connected accounts and login methods
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Error Message */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Wallets Section */}
        <div className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Wallets</h3>
          </div>

          {/* Wallets created by Lucid */}
          {embeddedWallets.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Wallets created by Lucid for you</p>
              {embeddedWallets.map((wallet, index) => (
                <div
                  key={`embedded-${wallet.address}-${index}`}
                  className="flex items-center justify-between h-10 px-3 rounded-lg border bg-muted/50 group"
                >
                  <div className="flex items-center gap-2">
                    <Image
                      src={getWalletIcon(wallet)}
                      alt={getWalletLabel(wallet)}
                      width={16}
                      height={16}
                      className="h-4 w-4"
                    />
                    <span className="text-sm font-mono">{shortenAddress(wallet.address)}</span>
                    <span className="text-xs text-muted-foreground">{getWalletLabel(wallet)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CopyButton
                      text={wallet.address}
                      successMessage="Address copied!"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                    <span className="text-xs text-muted-foreground">Default</span>
                  </div>
                </div>
              ))}

              {/* Private Key Export Toggle - Moved here */}
              <div className="text-right">
                <button
                  onClick={() => setShowExportSection(!showExportSection)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {showExportSection ? 'Hide' : 'Show'} Private Key Export
                </button>
              </div>

              {/* Private Key Export Section */}
              {showExportSection && (
                <div className="space-y-2 pt-2">
                  {exportError && (
                    <div className="rounded-lg border border-destructive bg-destructive/10 p-3">
                      <div className="flex items-start gap-2">
                        <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-destructive">{exportError}</p>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-warning/50 bg-warning/5 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3 text-warning" />
                      <p className="text-xs font-medium">Export Private Key</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Export your embedded wallet's private key. Keep it safe and never share it.
                    </p>

                    <div className="flex flex-col gap-1.5 pt-1">
                      {embeddedWallets.map((wallet, index) => (
                        <Button
                          key={`export-${wallet.address}-${index}`}
                          onClick={() => handleExportWallet(wallet.address)}
                          variant="outline"
                          size="sm"
                          className="w-full justify-start gap-2 h-8 text-xs"
                          disabled={isExporting}
                        >
                          <Download className="h-3 w-3" />
                          <span>Export {getWalletLabel(wallet)} Key ({shortenAddress(wallet.address)})</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Session Signers Section */}
              <SessionSignersSection wallets={embeddedWallets} />
            </div>
          )}

          {/* Wallets you connected */}
          {externalWallets.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Wallets you connected</p>
              {externalWallets.map((wallet, index) => (
                <div
                  key={`external-${wallet.address}-${index}`}
                  className="flex items-center justify-between h-10 px-3 rounded-lg border bg-muted/50 group"
                >
                  <div className="flex items-center gap-2">
                    <Image
                      src={getWalletIcon(wallet)}
                      alt={getWalletLabel(wallet)}
                      width={16}
                      height={16}
                      className="h-4 w-4"
                    />
                    <span className="text-sm font-mono">{shortenAddress(wallet.address)}</span>
                    <span className="text-xs text-muted-foreground">{getWalletLabel(wallet)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CopyButton
                      text={wallet.address}
                      successMessage="Address copied!"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                    <Button
                      onClick={() => handleUnlinkWallet(wallet.address)}
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      disabled={!canUnlink || unlinking}
                      title={!canUnlink ? 'Must have at least one account' : 'Disconnect'}
                    >
                      <XCircle className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Connect Wallet Button */}
          <Button onClick={linkWallet} variant="outline" size="sm" className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Connect Wallet
          </Button>
        </div>

        <Separator />

        {/* Social Logins */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Social Accounts</h3>

          <div className="space-y-3">
            {/* Google */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Chrome className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Google</p>
                  {user?.google && (
                    <p className="text-xs text-muted-foreground">{user.google.email}</p>
                  )}
                </div>
              </div>
              {user?.google ? (
                <Button
                  onClick={() => user.google && unlinkGoogle(user.google.subject)}
                  variant="ghost"
                  size="sm"
                  disabled={!canUnlink}
                >
                  Disconnect
                </Button>
              ) : (
                <Button onClick={linkGoogle} variant="outline" size="sm">
                  Connect
                </Button>
              )}
            </div>

            {/* Discord */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Discord</p>
                  {user?.discord && (
                    <p className="text-xs text-muted-foreground">{user.discord.username}</p>
                  )}
                </div>
              </div>
              {user?.discord ? (
                <Button
                  onClick={() => user.discord && unlinkDiscord(user.discord.subject)}
                  variant="ghost"
                  size="sm"
                  disabled={!canUnlink}
                >
                  Disconnect
                </Button>
              ) : (
                <Button onClick={linkDiscord} variant="outline" size="sm">
                  Connect
                </Button>
              )}
            </div>

            {/* Apple */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <AppleIcon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Apple</p>
                  {user?.apple && (
                    <p className="text-xs text-muted-foreground">{user.apple.email}</p>
                  )}
                </div>
              </div>
              {user?.apple ? (
                <Button
                  onClick={() => user.apple && unlinkApple(user.apple.subject)}
                  variant="ghost"
                  size="sm"
                  disabled={!canUnlink}
                >
                  Disconnect
                </Button>
              ) : (
                <Button onClick={linkApple} variant="outline" size="sm">
                  Connect
                </Button>
              )}
            </div>

            {/* GitHub */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Github className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">GitHub</p>
                  {user?.github && (
                    <p className="text-xs text-muted-foreground">{user.github.username}</p>
                  )}
                </div>
              </div>
              {user?.github ? (
                <Button
                  onClick={() => user.github && unlinkGithub(user.github.subject)}
                  variant="ghost"
                  size="sm"
                  disabled={!canUnlink}
                >
                  Disconnect
                </Button>
              ) : (
                <Button onClick={linkGithub} variant="outline" size="sm">
                  Connect
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

class PrivyErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('Privy context unavailable in AccountIdentitiesCard:', error.message, info.componentStack)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

export function AccountIdentitiesCard() {
  if (!isWeb3Enabled()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account Identities</CardTitle>
          <CardDescription>
            Available when Privy auth is configured
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const fallback = (
    <Card>
      <CardHeader>
        <CardTitle>Account Identities</CardTitle>
        <CardDescription>
          Web3 identity provider is initializing. Please try again in a moment.
        </CardDescription>
      </CardHeader>
    </Card>
  )

  return (
    <PrivyErrorBoundary fallback={fallback}>
      <PrivyAccountIdentitiesCardInner />
    </PrivyErrorBoundary>
  )
}
