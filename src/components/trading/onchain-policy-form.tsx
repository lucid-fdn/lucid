'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeftRight,
  Send,
  TrendingUp,
  ArrowRightLeft,
  Coins,
  Landmark,
  Droplets,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

export interface OnchainCapabilities {
  swap: boolean
  transfer: boolean
  perp_trading: boolean
  bridge: boolean
  stake: boolean
  lend: boolean
  provide_liquidity: boolean
}

export interface OnchainPolicyConfig {
  enabled: boolean
  maxTradeValueUsd: number
  dailyLimitUsd: number
  maxSlippageBps: number
  allowedChains: string[]
  capabilities: OnchainCapabilities
  quorumThresholdUsd: number | null
  requireConfirmationAboveUsd: number | null
}

interface OnchainPolicyFormProps {
  initialConfig?: Partial<OnchainPolicyConfig>
  onSave: (config: OnchainPolicyConfig) => Promise<void>
  assistantName?: string
  isLoading?: boolean
}

// ============================================================================
// Constants
// ============================================================================

const CAPABILITY_META: Record<
  keyof OnchainCapabilities,
  { label: string; description: string; icon: React.ElementType; risk: 'low' | 'medium' | 'high' }
> = {
  swap: {
    label: 'Token Swaps',
    description: 'Swap tokens via DEX aggregators (Jupiter, 1inch)',
    icon: ArrowLeftRight,
    risk: 'low',
  },
  transfer: {
    label: 'Token Transfers',
    description: 'Send tokens to external addresses',
    icon: Send,
    risk: 'high',
  },
  perp_trading: {
    label: 'Perpetual Trading',
    description: 'Open/close leveraged positions on Hyperliquid',
    icon: TrendingUp,
    risk: 'high',
  },
  bridge: {
    label: 'Cross-Chain Bridge',
    description: 'Bridge tokens between chains',
    icon: ArrowRightLeft,
    risk: 'medium',
  },
  stake: {
    label: 'Staking',
    description: 'Stake tokens for yield',
    icon: Coins,
    risk: 'medium',
  },
  lend: {
    label: 'Lending',
    description: 'Lend tokens on DeFi protocols',
    icon: Landmark,
    risk: 'medium',
  },
  provide_liquidity: {
    label: 'Liquidity Provision',
    description: 'Provide liquidity to DEX pools',
    icon: Droplets,
    risk: 'high',
  },
}

const SUPPORTED_CHAINS = [
  { id: '1', label: 'Ethereum', type: 'evm' },
  { id: '137', label: 'Polygon', type: 'evm' },
  { id: '8453', label: 'Base', type: 'evm' },
  { id: '42161', label: 'Arbitrum', type: 'evm' },
  { id: '10', label: 'Optimism', type: 'evm' },
  { id: '43114', label: 'Avalanche', type: 'evm' },
  { id: 'mainnet-beta', label: 'Solana', type: 'solana' },
]

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  high: 'bg-red-500/10 text-red-500 border-red-500/20',
}

const DEFAULT_CONFIG: OnchainPolicyConfig = {
  enabled: false,
  maxTradeValueUsd: 100,
  dailyLimitUsd: 500,
  maxSlippageBps: 100,
  allowedChains: [],
  capabilities: {
    swap: true,
    transfer: false,
    perp_trading: false,
    bridge: false,
    stake: false,
    lend: false,
    provide_liquidity: false,
  },
  quorumThresholdUsd: null,
  requireConfirmationAboveUsd: null,
}

// ============================================================================
// Component
// ============================================================================

export function OnchainPolicyForm({
  initialConfig,
  onSave,
  assistantName = 'Assistant',
  isLoading = false,
}: OnchainPolicyFormProps) {
  const [config, setConfig] = useState<OnchainPolicyConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
    capabilities: { ...DEFAULT_CONFIG.capabilities, ...initialConfig?.capabilities },
  })
  const [saving, setSaving] = useState(false)

  const updateField = useCallback(<K extends keyof OnchainPolicyConfig>(key: K, value: OnchainPolicyConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }, [])

  const toggleCapability = useCallback((cap: keyof OnchainCapabilities) => {
    setConfig((prev) => ({
      ...prev,
      capabilities: { ...prev.capabilities, [cap]: !prev.capabilities[cap] },
    }))
  }, [])

  const toggleChain = useCallback((chainId: string) => {
    setConfig((prev) => ({
      ...prev,
      allowedChains: prev.allowedChains.includes(chainId)
        ? prev.allowedChains.filter((c) => c !== chainId)
        : [...prev.allowedChains, chainId],
    }))
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await onSave(config)
    } finally {
      setSaving(false)
    }
  }, [config, onSave])

  const enabledCapCount = Object.values(config.capabilities).filter(Boolean).length
  const hasHighRisk = (Object.entries(config.capabilities) as [keyof OnchainCapabilities, boolean][]).some(
    ([key, enabled]) => enabled && CAPABILITY_META[key].risk === 'high'
  )

  return (
    <div className="space-y-6">
      {/* Master Enable */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Autonomous Trading</CardTitle>
              <CardDescription>
                Allow {assistantName} to execute on-chain transactions
              </CardDescription>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => updateField('enabled', v)}
              disabled={isLoading}
            />
          </div>
        </CardHeader>
      </Card>

      {config.enabled && (
        <>
          {/* Capabilities Matrix */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5" />
                Onchain Capabilities
              </CardTitle>
              <CardDescription>
                {enabledCapCount} of {Object.keys(CAPABILITY_META).length} capabilities enabled
                {hasHighRisk && (
                  <Badge variant="outline" className={`ml-2 ${RISK_COLORS.high}`}>
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    High-risk enabled
                  </Badge>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(Object.entries(CAPABILITY_META) as [keyof OnchainCapabilities, typeof CAPABILITY_META.swap][]).map(
                ([key, meta]) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const Icon = meta.icon as any
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{meta.label}</span>
                            <Badge variant="outline" className={`text-xs ${RISK_COLORS[meta.risk]}`}>
                              {meta.risk}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{meta.description}</p>
                        </div>
                      </div>
                      <Switch
                        checked={config.capabilities[key]}
                        onCheckedChange={() => toggleCapability(key)}
                        disabled={isLoading}
                      />
                    </div>
                  )
                }
              )}
            </CardContent>
          </Card>

          {/* Limits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Trading Limits</CardTitle>
              <CardDescription>Maximum values per trade and daily</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="maxTrade">Max per trade (USD)</Label>
                <Input
                  id="maxTrade"
                  type="number"
                  min={1}
                  value={config.maxTradeValueUsd}
                  onChange={(e) => updateField('maxTradeValueUsd', Number(e.target.value))}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dailyLimit">Daily limit (USD)</Label>
                <Input
                  id="dailyLimit"
                  type="number"
                  min={1}
                  value={config.dailyLimitUsd}
                  onChange={(e) => updateField('dailyLimitUsd', Number(e.target.value))}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slippage">Max slippage (bps)</Label>
                <Input
                  id="slippage"
                  type="number"
                  min={1}
                  max={1000}
                  value={config.maxSlippageBps}
                  onChange={(e) => updateField('maxSlippageBps', Number(e.target.value))}
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">{config.maxSlippageBps / 100}%</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmAbove">Require confirmation above (USD)</Label>
                <Input
                  id="confirmAbove"
                  type="number"
                  min={0}
                  placeholder="No confirmation required"
                  value={config.requireConfirmationAboveUsd ?? ''}
                  onChange={(e) =>
                    updateField('requireConfirmationAboveUsd', e.target.value ? Number(e.target.value) : null)
                  }
                  disabled={isLoading}
                />
              </div>
            </CardContent>
          </Card>

          {/* Chains */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Allowed Chains</CardTitle>
              <CardDescription>
                Select which blockchains the agent can operate on
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_CHAINS.map((chain) => {
                  const selected = config.allowedChains.includes(chain.id)
                  return (
                    <button
                      key={chain.id}
                      type="button"
                      onClick={() => toggleChain(chain.id)}
                      disabled={isLoading}
                      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                        selected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      {chain.label}
                      <span className="ml-1 text-xs opacity-60">
                        ({chain.type === 'solana' ? 'SOL' : 'EVM'})
                      </span>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Quorum */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Multi-Sig Quorum</CardTitle>
              <CardDescription>
                Require org admin approval for high-value trades
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="quorum">Quorum threshold (USD)</Label>
                <Input
                  id="quorum"
                  type="number"
                  min={0}
                  placeholder="No quorum required"
                  value={config.quorumThresholdUsd ?? ''}
                  onChange={(e) =>
                    updateField('quorumThresholdUsd', e.target.value ? Number(e.target.value) : null)
                  }
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Trades above this value require approval from 2+ org admins before execution
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Save */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || isLoading}>
              {saving ? 'Saving...' : 'Save Policy'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}