'use client'

import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { isWeb3Enabled } from '@/lib/auth/client-config'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Download, Key, XCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { notificationCopy } from '@/lib/notifications/copy'
import { summarizeError } from '@/lib/logging/safe-log'

function PrivyAdvancedSecurityCardInner() {
  const toast = useToast()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const { user, exportWallet } = usePrivy()

  // Get all embedded wallets (both ETH and Solana)
  interface LinkedWalletAccount {
    type: string
    walletClientType?: string
    chainType?: string
    address?: string
  }
  const embeddedWallets = (user?.linkedAccounts as LinkedWalletAccount[] | undefined)?.filter(
    (acc: LinkedWalletAccount) => acc.type === 'wallet' && acc.walletClientType === 'privy'
  ) || []

  const ethEmbeddedWallets = embeddedWallets.filter((w: LinkedWalletAccount) => w.chainType === 'ethereum')
  const solEmbeddedWallets = embeddedWallets.filter((w: LinkedWalletAccount) => w.chainType === 'solana')

  const hasEmbeddedWallet = embeddedWallets.length > 0

  const handleExportWallet = async (address?: string) => {
    setError(null)
    setIsExporting(true)

    if (!hasEmbeddedWallet) {
      setError('You need an embedded wallet (Ethereum or Solana) to export a private key.')
      setIsExporting(false)
      return
    }

    try {
      if (address) {
        await exportWallet({ address })
      } else {
        await exportWallet()
      }

      toast.success(notificationCopy.wallet.privateKeyExported, 'Keep it safe and never share it with anyone.')

      setIsExporting(false)

    } catch (clientError) {
      console.warn('[export-wallet] Client-side export failed; trying server-side fallback', summarizeError(clientError))

      // STEP 2: Try server-side export as fallback
      try {
        const targetAddress = address || embeddedWallets[0]?.address

        if (!targetAddress) {
          throw new Error('No wallet address found')
        }

        const response = await fetch('/api/wallet/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: targetAddress }),
          credentials: 'include'
        })

        const data = await response.json()

        if (response.ok && data.success) {
          toast.success(notificationCopy.wallet.privateKeyExported, 'Keep it safe and never share it with anyone.')
          setIsExporting(false)
          return
        }

        // Server-side also failed
        if (data.clientSideOnly) {
          setError(
            'This wallet can only be exported from the browser, but the export operation failed. ' +
            'This may be due to a Privy SDK issue. Please try again or contact support.'
          )
        } else {
          setError(data.error || 'Failed to export wallet')
        }

      } catch (serverError) {
        console.error('[export-wallet] Server-side export failed:', summarizeError(serverError))
        const errorMessage = clientError instanceof Error ? clientError.message : 'Unknown error'

        // Both methods failed - show detailed error
        if (errorMessage.includes('User must have an embedded wallet')) {
          setError(
            'Export failed: Privy reports no embedded wallet found. ' +
            'This may be a temporary issue with the Privy service. Please try refreshing the page or contact support if the problem persists.'
          )
        } else {
          setError(`Export failed: ${errorMessage}`)
        }
      }

      setIsExporting(false)
    }
  }

  return (
    <Card className="border-warning">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <CardTitle>Private Key Export</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="advanced-mode" className="text-sm text-muted-foreground cursor-pointer">
              Show Advanced
            </Label>
            <Switch
              id="advanced-mode"
              checked={showAdvanced}
              onCheckedChange={setShowAdvanced}
            />
          </div>
        </div>
        <CardDescription>
          Advanced users only. Proceed with extreme caution.
        </CardDescription>
      </CardHeader>
      <div className={`transition-all duration-240 ease-in-out overflow-hidden ${showAdvanced ? 'max-h-[700px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <CardContent className="space-y-4 pt-0">
          {/* Error Message - Inline */}
          {error && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-destructive">Export Failed</h3>
                  <p className="mt-1 text-sm text-destructive/90">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-destructive/70 hover:text-destructive transition-colors"
                  aria-label="Close error message"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-warning/50 bg-warning/10 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              <h4 className="font-semibold text-sm">Export Private Key</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Export your embedded wallet's private key for use in other wallet applications.
              Once exported, anyone with access to the key can control your wallet and funds.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>This action requires re-authentication</li>
              <li>The key will be displayed once and cannot be recovered if lost</li>
              <li>Store it in a secure location (password manager, hardware wallet)</li>
            </ul>

            {/* Show wallet selection if multiple embedded wallets */}
            {embeddedWallets.length > 1 ? (
              <div className="pt-2 space-y-2">
                <p className="text-xs font-medium">Select wallet to export:</p>
                {ethEmbeddedWallets.map((wallet: LinkedWalletAccount) => (
                  <Button
                    key={wallet.address ?? ''}
                    onClick={() => handleExportWallet(wallet.address)}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2"
                    disabled={isExporting}
                  >
                    <Download className="h-3 w-3" />
                    <span className="text-xs font-mono">
                      ETH: {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
                    </span>
                  </Button>
                ))}
                {solEmbeddedWallets.map((wallet: LinkedWalletAccount) => (
                  <Button
                    key={wallet.address ?? ''}
                    onClick={() => handleExportWallet(wallet.address)}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2"
                    disabled={isExporting}
                  >
                    <Download className="h-3 w-3" />
                    <span className="text-xs font-mono">
                      SOL: {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
                    </span>
                  </Button>
                ))}
              </div>
            ) : (
              <div className="pt-2">
                <Button
                  onClick={() => handleExportWallet()}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={!hasEmbeddedWallet || isExporting}
                  title={!hasEmbeddedWallet ? 'Embedded wallet required' : 'Export private key'}
                >
                  <Download className="h-4 w-4" />
                  {isExporting ? 'Exporting...' : 'Export Private Key'}
                  {!isExporting && ethEmbeddedWallets.length > 0 && ' (ETH)'}
                  {!isExporting && solEmbeddedWallets.length > 0 && ' (SOL)'}
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-destructive/10 p-3 border border-destructive/50">
            <p className="text-xs text-destructive font-medium flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                Security Warning: Never share your private key. Lucid will never ask for it.
                Scammers may impersonate support to steal your keys.
              </span>
            </p>
          </div>
        </CardContent>
      </div>
    </Card>
  )
}

export function AdvancedSecurityCard() {
  if (!isWeb3Enabled()) {
    return (
      <Card className="border-warning">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <CardTitle>Private Key Export</CardTitle>
          </div>
          <CardDescription>
            Available when Privy auth is configured
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return <PrivyAdvancedSecurityCardInner />
}
