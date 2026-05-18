'use client'

/**
 * Trade Preview Card — P1-31
 *
 * Displays a trade preview in the chat interface before execution.
 * Shows quote details, fees, price impact, and confirm/reject buttons.
 */

import { useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface TradePreviewProps {
  /** Trade type */
  type: 'swap' | 'transfer' | 'perp_order'
  /** Chain name */
  chain: string
  /** Chain ID */
  chainId: string
  /** DEX source */
  source?: string
  /** Input token symbol */
  inputToken: string
  /** Output token symbol */
  outputToken: string
  /** Input amount (human-readable) */
  inputAmount: string
  /** Output amount (human-readable) */
  outputAmount: string
  /** Input USD value */
  inputUsdValue?: string
  /** Output USD value */
  outputUsdValue?: string
  /** Price impact percentage */
  priceImpact?: number
  /** Estimated gas fee in USD */
  estimatedGasFee?: string
  /** Route description (e.g., "ETH → USDC via Uniswap V3") */
  route?: string
  /** Quote expiry timestamp */
  expiresAt?: number
  /** Whether confirmation is required (above threshold) */
  requiresConfirmation: boolean
  /** Callback when user confirms */
  onConfirm?: () => void
  /** Callback when user rejects */
  onReject?: () => void
  /** Current status */
  status?: 'preview' | 'confirming' | 'executing' | 'completed' | 'failed' | 'expired'
  /** Transaction hash (after execution) */
  txHash?: string
  /** Error message */
  error?: string
  /** Slippage tolerance percentage */
  slippage?: number
}

// ============================================================================
// Helpers
// ============================================================================

function formatPriceImpact(impact: number | undefined): { text: string; color: string } {
  if (impact === undefined) return { text: 'Unknown', color: 'text-muted-foreground' }
  if (impact < 0.5) return { text: `${impact.toFixed(2)}%`, color: 'text-green-500' }
  if (impact < 2) return { text: `${impact.toFixed(2)}%`, color: 'text-yellow-500' }
  return { text: `${impact.toFixed(2)}%`, color: 'text-red-500' }
}

function getStatusBadge(status: TradePreviewProps['status']) {
  switch (status) {
    case 'preview':
      return <Badge variant="outline">Preview</Badge>
    case 'confirming':
      return <Badge variant="outline" className="border-yellow-500 text-yellow-500">Awaiting Confirmation</Badge>
    case 'executing':
      return <Badge variant="outline" className="border-blue-500 text-blue-500 animate-pulse">Executing...</Badge>
    case 'completed':
      return <Badge variant="outline" className="border-green-500 text-green-500">Completed ✓</Badge>
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>
    case 'expired':
      return <Badge variant="outline" className="border-muted-foreground text-muted-foreground">Expired</Badge>
    default:
      return null
  }
}

function getTypeLabel(type: TradePreviewProps['type']) {
  switch (type) {
    case 'swap': return '🔄 Swap'
    case 'transfer': return '📤 Transfer'
    case 'perp_order': return '📊 Perpetual Order'
  }
}

// ============================================================================
// Component
// ============================================================================

export function TradePreviewCard({
  type,
  chain,
  chainId: _chainId,
  source,
  inputToken,
  outputToken,
  inputAmount,
  outputAmount,
  inputUsdValue,
  outputUsdValue,
  priceImpact,
  estimatedGasFee,
  route,
  expiresAt,
  requiresConfirmation,
  onConfirm,
  onReject,
  status = 'preview',
  txHash,
  error,
  slippage,
}: TradePreviewProps) {
  const [isConfirming, setIsConfirming] = useState(false)
  const priceImpactInfo = formatPriceImpact(priceImpact)
  const isExpired = expiresAt ? Date.now() > expiresAt : false
  const effectiveStatus = isExpired && status === 'preview' ? 'expired' : status

  const handleConfirm = () => {
    setIsConfirming(true)
    onConfirm?.()
  }

  return (
    <Card className="w-full max-w-md border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {getTypeLabel(type)}
          </CardTitle>
          {getStatusBadge(effectiveStatus)}
        </div>
        {source && (
          <p className="text-xs text-muted-foreground">
            via {source} on {chain}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Trade amounts */}
        <div className="rounded-lg border border-border/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">From</span>
            <div className="text-right">
              <p className="text-sm font-medium">
                {inputAmount} {inputToken}
              </p>
              {inputUsdValue && (
                <p className="text-xs text-muted-foreground">${inputUsdValue}</p>
              )}
            </div>
          </div>

          <div className="flex justify-center">
            <span className="text-muted-foreground">↓</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">To</span>
            <div className="text-right">
              <p className="text-sm font-medium">
                {outputAmount} {outputToken}
              </p>
              {outputUsdValue && (
                <p className="text-xs text-muted-foreground">${outputUsdValue}</p>
              )}
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1.5 text-xs">
          {route && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Route</span>
              <span className="text-foreground">{route}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Price Impact</span>
            <span className={cn('font-medium', priceImpactInfo.color)}>
              {priceImpactInfo.text}
            </span>
          </div>
          {slippage !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max Slippage</span>
              <span>{slippage}%</span>
            </div>
          )}
          {estimatedGasFee && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Est. Gas Fee</span>
              <span>${estimatedGasFee}</span>
            </div>
          )}
          {expiresAt && effectiveStatus === 'preview' && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quote Expires</span>
              <span>{Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))}s</span>
            </div>
          )}
        </div>

        {/* Transaction hash */}
        {txHash && (
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-2">
            <p className="text-xs text-muted-foreground">Transaction Hash</p>
            <p className="text-xs font-mono break-all">{txHash}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-2">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* High price impact warning */}
        {priceImpact !== undefined && priceImpact >= 2 && (
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-2">
            <p className="text-xs text-yellow-500">
              ⚠️ High price impact ({priceImpact.toFixed(2)}%). Consider reducing trade size.
            </p>
          </div>
        )}
      </CardContent>

      {/* Action buttons */}
      {requiresConfirmation && effectiveStatus === 'preview' && (
        <CardFooter className="flex gap-2 pt-0">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onReject}
          >
            Reject
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={handleConfirm}
            disabled={isConfirming || isExpired}
          >
            {isConfirming ? 'Confirming...' : 'Confirm Trade'}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}