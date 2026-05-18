'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useToast } from '@/hooks/use-toast'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Loader2, ShieldCheck, DollarSign, Link2, Save, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PanelDetailBlock } from '@/components/panels/panel-layout'
import { notificationCopy } from '@/lib/notifications/copy'

// Supported chains
const SUPPORTED_CHAINS = [
  { id: 'ethereum', name: 'Ethereum', icon: '⟠' },
  { id: 'solana', name: 'Solana', icon: '◎' },
  { id: 'base', name: 'Base', icon: '🔵' },
  { id: 'polygon', name: 'Polygon', icon: '⬡' },
  { id: 'arbitrum', name: 'Arbitrum', icon: '🔷' },
]

// Common tokens per chain
const CHAIN_TOKENS: Record<string, string[]> = {
  ethereum: ['ETH', 'USDC', 'USDT', 'WETH', 'DAI', 'WBTC'],
  solana: ['SOL', 'USDC', 'USDT', 'BONK', 'JUP', 'RAY'],
  base: ['ETH', 'USDC', 'WETH', 'DAI'],
  polygon: ['MATIC', 'USDC', 'USDT', 'WETH'],
  arbitrum: ['ETH', 'USDC', 'USDT', 'ARB', 'WETH'],
}

// Schema
const tradingPolicySchema = z.object({
  enabled: z.boolean(),
  max_trade_value_usd: z.number().min(1).max(100000),
  daily_limit_usd: z.number().min(1).max(1000000),
  allowed_chains: z.array(z.string()),
  allowed_tokens: z.record(z.string(), z.array(z.string())),
  max_slippage_bps: z.number().min(10).max(1000),
  require_confirmation_above_usd: z.number().nullable(),
})

type TradingPolicyFormData = z.infer<typeof tradingPolicySchema>

interface TradingPolicyFormProps {
  assistantId: string
  assistantName?: string
  onSave?: () => void
  /** Server-prefetched policy — skips client-side fetch when provided */
  initialPolicy?: Record<string, unknown> | null
}

export default function TradingPolicyForm({
  assistantId,
  assistantName,
  onSave,
  initialPolicy,
}: TradingPolicyFormProps) {
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(!initialPolicy)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmTradingOpen, setConfirmTradingOpen] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<TradingPolicyFormData>({
    resolver: zodResolver(tradingPolicySchema),
    defaultValues: {
      enabled: (initialPolicy?.enabled as boolean) || false,
      max_trade_value_usd: (initialPolicy?.max_trade_value_usd as number) || 100,
      daily_limit_usd: (initialPolicy?.daily_limit_usd as number) || 500,
      allowed_chains: (initialPolicy?.allowed_chains as string[]) || [],
      allowed_tokens: (initialPolicy?.allowed_tokens as Record<string, string[]>) || {},
      max_slippage_bps: (initialPolicy?.max_slippage_bps as number) || 100,
      require_confirmation_above_usd: (initialPolicy?.require_confirmation_above_usd as number) || null,
    },
  })

  const watchEnabled = watch('enabled')
  const watchAllowedChains = watch('allowed_chains')
  const watchAllowedTokens = watch('allowed_tokens')

  // Load existing policy on mount (skip if server-prefetched)
  const hasInitialPolicy = initialPolicy !== undefined
  useEffect(() => {
    if (hasInitialPolicy) return // Server-prefetched — no client fetch needed

    let cancelled = false

    async function loadPolicy() {
      try {
        setIsLoading(true)
        const response = await fetch(`/api/trading/policy?assistantId=${assistantId}`)
        if (!response.ok) throw new Error('Failed to load policy')

        const data = await response.json()
        if (!cancelled && data.policy) {
          reset({
            enabled: data.policy.enabled || false,
            max_trade_value_usd: data.policy.max_trade_value_usd || 100,
            daily_limit_usd: data.policy.daily_limit_usd || 500,
            allowed_chains: data.policy.allowed_chains || [],
            allowed_tokens: data.policy.allowed_tokens || {},
            max_slippage_bps: data.policy.max_slippage_bps || 100,
            require_confirmation_above_usd: data.policy.require_confirmation_above_usd || null,
          })
        }
      } catch (error) {
        console.error('Error loading policy:', error)
        if (!cancelled) toast.error(notificationCopy.title.error, 'Failed to load trading policy')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadPolicy()
    return () => { cancelled = true }
  }, [assistantId, reset, toast, hasInitialPolicy])

  // Handle chain toggle
  const handleChainToggle = (chainId: string, checked: boolean) => {
    const current = watchAllowedChains || []
    if (checked) {
      setValue('allowed_chains', [...current, chainId], { shouldDirty: true })
      // Add default tokens for the chain
      const currentTokens = watchAllowedTokens || {}
      if (!currentTokens[chainId]) {
        setValue(
          'allowed_tokens',
          { ...currentTokens, [chainId]: CHAIN_TOKENS[chainId]?.slice(0, 3) || [] },
          { shouldDirty: true }
        )
      }
    } else {
      setValue(
        'allowed_chains',
        current.filter((c) => c !== chainId),
        { shouldDirty: true }
      )
      // Remove tokens for the chain
      const currentTokens = { ...(watchAllowedTokens || {}) }
      delete currentTokens[chainId]
      setValue('allowed_tokens', currentTokens, { shouldDirty: true })
    }
  }

  // Handle token toggle
  const handleTokenToggle = (chainId: string, token: string, checked: boolean) => {
    const currentTokens = watchAllowedTokens || {}
    const chainTokens = currentTokens[chainId] || []

    if (checked) {
      setValue(
        'allowed_tokens',
        { ...currentTokens, [chainId]: [...chainTokens, token] },
        { shouldDirty: true }
      )
    } else {
      setValue(
        'allowed_tokens',
        { ...currentTokens, [chainId]: chainTokens.filter((t) => t !== token) },
        { shouldDirty: true }
      )
    }
  }

  // Save policy
  const onSubmit = useCallback(async (data: TradingPolicyFormData) => {
    try {
      setIsSaving(true)
      setSaved(false)
      const csrfToken = document.cookie.match(/(^| )csrf-token=([^;]+)/)?.[2] ?? ''
      const response = await fetch('/api/trading/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          assistantId,
          ...data,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save policy')
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSave?.()
    } catch (error) {
      console.error('Error saving policy:', error)
      toast.error(notificationCopy.title.error, error instanceof Error ? error.message : 'Failed to save policy')
    } finally {
      setIsSaving(false)
    }
  }, [assistantId, onSave, toast])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      {/* Autonomous trading toggle */}
      <div className="flex items-center justify-between rounded-lg border border-zinc-800/60 p-3">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-zinc-200">Autonomous trading</p>
            <p className="text-[10px] text-zinc-600">
              Allow {assistantName || 'this agent'} to execute trades within limits
            </p>
          </div>
        </div>
        <Switch
          checked={watchEnabled}
          onCheckedChange={(checked) => {
            if (checked) {
              setConfirmTradingOpen(true)
            } else {
              setValue('enabled', false, { shouldDirty: true })
            }
          }}
        />
      </div>

      {watchEnabled && (
        <PanelDetailBlock>
          <div className="text-[11px] text-amber-300/80 space-y-1">
            <p>When enabled, this agent can:</p>
            <ul className="list-disc list-inside text-amber-300/60 space-y-0.5 ml-1">
              <li>Execute trades automatically within limits</li>
              <li>Operate on selected chains and tokens</li>
              <li>Require confirmation for large trades (if configured)</li>
            </ul>
          </div>
        </PanelDetailBlock>
      )}

      {/* Trading limits — always visible, muted when disabled */}
      <div className={watchEnabled ? '' : 'opacity-40 pointer-events-none'}>
        <section>
          <div className="flex items-center gap-2 mb-1.5">
            <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
            <h3 className="text-xs font-medium text-zinc-200">Trading limits</h3>
          </div>
          <p className="text-[10px] text-zinc-700 mb-3">
            Recommended: $50–100 per trade, $200–500 daily for testing
          </p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="max_trade_value_usd" className="text-[11px] text-zinc-500">Max per trade</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-600">$</span>
                  <Input
                    id="max_trade_value_usd"
                    type="number"
                    {...register('max_trade_value_usd', { valueAsNumber: true })}
                    placeholder="100"
                    className="h-8 text-xs bg-transparent border-zinc-800 focus:border-zinc-600"
                  />
                </div>
                {errors.max_trade_value_usd && (
                  <p className="text-[10px] text-red-400">{errors.max_trade_value_usd.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="daily_limit_usd" className="text-[11px] text-zinc-500">Daily limit</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-600">$</span>
                  <Input
                    id="daily_limit_usd"
                    type="number"
                    {...register('daily_limit_usd', { valueAsNumber: true })}
                    placeholder="500"
                    className="h-8 text-xs bg-transparent border-zinc-800 focus:border-zinc-600"
                  />
                </div>
                {errors.daily_limit_usd && (
                  <p className="text-[10px] text-red-400">{errors.daily_limit_usd.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="max_slippage_bps" className="text-[11px] text-zinc-500">Max slippage</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    id="max_slippage_bps"
                    type="number"
                    step="0.1"
                    value={(watch('max_slippage_bps') || 100) / 100}
                    onChange={(e) =>
                      setValue('max_slippage_bps', parseFloat(e.target.value) * 100, {
                        shouldDirty: true,
                      })
                    }
                    placeholder="1"
                    className="h-8 text-xs bg-transparent border-zinc-800 focus:border-zinc-600"
                  />
                  <span className="text-xs text-zinc-600">%</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="require_confirmation_above_usd" className="text-[11px] text-zinc-500">Confirm above</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-zinc-600">$</span>
                  <Input
                    id="require_confirmation_above_usd"
                    type="number"
                    {...register('require_confirmation_above_usd', {
                      valueAsNumber: true,
                      setValueAs: (v) => (v === '' || isNaN(v) ? null : v),
                    })}
                    placeholder="Optional"
                    className="h-8 text-xs bg-transparent border-zinc-800 focus:border-zinc-600"
                  />
                </div>
                <p className="text-[10px] text-zinc-700">Requires user confirmation</p>
              </div>
            </div>
          </div>
        </section>

        {/* Allowed chains & tokens */}
        <section className="mt-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Link2 className="h-3.5 w-3.5 text-purple-400" />
            <h3 className="text-xs font-medium text-zinc-200">Allowed chains & tokens</h3>
          </div>
          <p className="text-[10px] text-zinc-700 mb-3">
            Select which blockchains and tokens the agent can trade
          </p>
          <div className="space-y-3">
            {SUPPORTED_CHAINS.map((chain) => {
              const isChainEnabled = watchAllowedChains?.includes(chain.id)
              const chainTokens = CHAIN_TOKENS[chain.id] || []
              const selectedTokens = watchAllowedTokens?.[chain.id] || []

              return (
                <div key={chain.id} className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id={`chain-${chain.id}`}
                      checked={isChainEnabled}
                      onCheckedChange={(checked) =>
                        handleChainToggle(chain.id, checked as boolean)
                      }
                    />
                    <Label
                      htmlFor={`chain-${chain.id}`}
                      className="flex items-center gap-1.5 cursor-pointer text-xs"
                    >
                      <span>{chain.icon}</span>
                      <span className="text-zinc-300">{chain.name}</span>
                    </Label>
                  </div>

                  {isChainEnabled && (
                    <div className="ml-7 flex flex-wrap gap-1.5">
                      {chainTokens.map((token) => {
                        const isSelected = selectedTokens.includes(token)
                        return (
                          <button
                            key={token}
                            type="button"
                            onClick={() => handleTokenToggle(chain.id, token, !isSelected)}
                            className={cn(
                              'px-2.5 py-1 text-[11px] rounded-md border transition-colors duration-120',
                              isSelected
                                ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
                                : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300',
                            )}
                          >
                            {token}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {watchEnabled && watchAllowedChains?.length === 0 && (
              <p className="text-[10px] text-amber-400">
                Select at least one chain to enable trading
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Save button */}
      <Button
        type="submit"
        disabled={isSaving || !isDirty}
        size="sm"
        className={cn(
          'w-full transition-colors duration-120',
          isDirty && !isSaving ? 'bg-zinc-100 text-zinc-900 hover:bg-white' : '',
        )}
      >
        {isSaving ? (
          <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving...</>
        ) : saved ? (
          <><Check className="h-3.5 w-3.5 mr-1.5" />Saved</>
        ) : (
          <><Save className="h-3.5 w-3.5 mr-1.5" />Save policy</>
        )}
      </Button>

      {/* Confirmation dialog for enabling autonomous trading */}
      <AlertDialog open={confirmTradingOpen} onOpenChange={setConfirmTradingOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable autonomous trading?</AlertDialogTitle>
            <AlertDialogDescription>
              This allows the agent to execute trades within your configured limits without asking for confirmation each time. You can set per-trade and daily limits below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setValue('enabled', true, { shouldDirty: true })}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Enable trading
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}
