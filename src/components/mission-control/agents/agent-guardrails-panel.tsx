'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ELEVATED_TOOLS } from '@/lib/mission-control/constants'
import {
  Shield,
  DollarSign,
  RefreshCw,
  Save,
  Check,
  CircleAlert,
  ArrowRightLeft,
  SendHorizonal,
  TrendingUp,
  Ban,
} from 'lucide-react'
import { PanelLayout, PanelDetailBlock, PanelInfoRow } from '@/components/panels/panel-layout'
import { WorkspaceMetricCard } from '@/components/workspace/workspace-metric-card'

// ─── Tool metadata ────────────────────────────────────────────────────────────

interface ToolMeta {
  label: string
  description: string
  risk: 'high' | 'medium'
  icon: typeof Shield
}

const TOOL_META: Record<string, ToolMeta> = {
  wallet_transfer: {
    label: 'Send funds',
    description: 'Transfer tokens from the agent wallet to another address',
    risk: 'high',
    icon: SendHorizonal,
  },
  dex_swap: {
    label: 'Swap tokens',
    description: 'Exchange tokens on a decentralized exchange (Jupiter, 1inch)',
    risk: 'high',
    icon: ArrowRightLeft,
  },
  hl_place_order: {
    label: 'Place leveraged order',
    description: 'Open a perpetual futures position on Hyperliquid (up to 50x)',
    risk: 'high',
    icon: TrendingUp,
  },
  hl_cancel_order: {
    label: 'Cancel order',
    description: 'Cancel an open perpetual futures order',
    risk: 'medium',
    icon: Ban,
  },
}

const RISK_COLORS = {
  high: {
    dot: 'bg-red-400',
    label: 'text-red-400',
    tag: 'High risk',
  },
  medium: {
    dot: 'bg-amber-400',
    label: 'text-amber-400',
    tag: 'Medium',
  },
} as const

// ─── Cost hints ───────────────────────────────────────────────────────────────

const COST_HINTS: Record<string, string> = {
  cost_limit_per_run_usd: 'Typical: $2–10 per run',
  cost_limit_daily_usd: 'Typical: $20–50 per day',
  cost_limit_monthly_usd: 'Typical: $200–500 per month',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Guardrails {
  approval_required_tools: string[]
  cost_limit_per_run_usd: number | null
  cost_limit_daily_usd: number | null
  cost_limit_monthly_usd: number | null
}

interface AgentGuardrailsPanelProps {
  agentId: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AgentGuardrailsPanel({ agentId }: AgentGuardrailsPanelProps) {
  const [guardrails, setGuardrails] = useState<Guardrails | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const fetchGuardrails = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/mission-control/agents/${agentId}/guardrails`)
      if (!res.ok) throw new Error('Failed to fetch guardrails')
      const data = await res.json()
      setGuardrails(data)
      setError(null)
    } catch {
      setError('Failed to load guardrails')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    fetchGuardrails()
  }, [fetchGuardrails])

  const handleSave = async () => {
    if (!guardrails) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch(`/api/mission-control/agents/${agentId}/guardrails`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guardrails),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save')
      }
      setDirty(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const toggleApprovalTool = (tool: string) => {
    if (!guardrails) return
    const tools = guardrails.approval_required_tools.includes(tool)
      ? guardrails.approval_required_tools.filter((t) => t !== tool)
      : [...guardrails.approval_required_tools, tool]
    setGuardrails({ ...guardrails, approval_required_tools: tools })
    setDirty(true)
  }

  const updateCostLimit = (
    field: 'cost_limit_per_run_usd' | 'cost_limit_daily_usd' | 'cost_limit_monthly_usd',
    value: string,
  ) => {
    if (!guardrails) return
    const parsed = value === '' ? null : parseFloat(value)
    if (parsed !== null && isNaN(parsed)) return
    setGuardrails({ ...guardrails, [field]: parsed })
    setDirty(true)
  }

  const summary = useMemo(() => {
    if (!guardrails) return null
    const approvalCount = guardrails.approval_required_tools.length
    const hasCostLimits =
      guardrails.cost_limit_per_run_usd !== null ||
      guardrails.cost_limit_daily_usd !== null ||
      guardrails.cost_limit_monthly_usd !== null
    return { approvalCount, hasCostLimits }
  }, [guardrails])

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-accent/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (!guardrails) {
    return (
      <div className="text-sm text-muted-foreground">
        {error || 'Guardrails not available'}
      </div>
    )
  }

  return (
    <PanelLayout
      context="Safety controls that limit what this agent can do autonomously."
      state={
        summary && (
          <div className="grid grid-cols-3 gap-2">
            <WorkspaceMetricCard
              label="Approval gates"
              value={summary.approvalCount}
              tone={summary.approvalCount > 0 ? 'warning' : 'default'}
              density="compact"
              className="text-center"
            />
            <WorkspaceMetricCard
              label="Cost limits"
              value={summary.hasCostLimits ? 'Set' : 'None'}
              tone={summary.hasCostLimits ? 'success' : 'default'}
              density="compact"
              className="text-center"
            />
            <WorkspaceMetricCard
              label="Loop protection"
              value="On"
              tone="success"
              density="compact"
              className="text-center"
            />
          </div>
        )
      }
      action={
        <>
          {Boolean(error) && (
            <div className="flex items-center gap-2 text-xs text-red-400 px-1">
              <CircleAlert className="h-3 w-3 shrink-0" />
              {error}
            </div>
          )}
          <Button
            onClick={handleSave}
            disabled={!dirty || saving}
            size="sm"
            className={cn(
              'w-full transition-colors duration-120',
              dirty && !saving ? 'bg-primary text-primary-foreground hover:bg-primary/90' : '',
            )}
          >
            {saving ? (
              <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving...</>
            ) : success ? (
              <><Check className="h-3.5 w-3.5 mr-1.5" />Saved</>
            ) : (
              <><Save className="h-3.5 w-3.5 mr-1.5" />Save guardrails</>
            )}
          </Button>
        </>
      }
    >
      {/* Approval gates */}
      <section>
        <div className="flex items-center gap-2 mb-1.5">
          <Shield className="h-4 w-4 text-amber-500" />
          <h3 className="text-xs font-medium text-foreground">Approval gates</h3>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">
          Agent pauses and requests owner approval before executing these tools.
        </p>
        <div className="space-y-2">
          {ELEVATED_TOOLS.map((tool) => {
            const isEnabled = guardrails.approval_required_tools.includes(tool)
            const meta = TOOL_META[tool]
            const risk = meta ? RISK_COLORS[meta.risk] : null
            const ToolIcon = meta?.icon ?? Shield

            return (
              <button
                key={tool}
                onClick={() => toggleApprovalTool(tool)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-120 border',
                  isEnabled
                    ? 'border-amber-500/25 bg-amber-500/[0.07]'
                    : 'border-border hover:border-border hover:bg-accent/50',
                )}
              >
                <ToolIcon className={cn('h-3.5 w-3.5 shrink-0', isEnabled ? 'text-amber-400' : 'text-muted-foreground')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs font-medium', isEnabled ? 'text-foreground' : 'text-muted-foreground')}>{meta?.label ?? tool}</span>
                    {risk && (
                      <span className={cn('flex items-center gap-1 text-[9px] font-medium', risk.label)}>
                        <span className={cn('w-1 h-1 rounded-full', risk.dot)} />
                        {risk.tag}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {meta && <p className="text-[10px] text-muted-foreground">{meta.description}</p>}
                    <code className="text-[9px] text-muted-foreground font-mono">{tool}</code>
                  </div>
                </div>
                <div className={cn(
                  'w-8 h-[18px] rounded-full flex items-center px-0.5 transition-colors duration-120 shrink-0',
                  isEnabled ? 'bg-amber-500/30 justify-end' : 'bg-muted justify-start',
                )}>
                  <div className={cn(
                    'w-3.5 h-3.5 rounded-full transition-colors duration-120',
                    isEnabled ? 'bg-amber-400' : 'bg-muted-foreground',
                  )} />
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Cost limits */}
      <section>
        <div className="flex items-center gap-2 mb-1.5">
          <DollarSign className="h-4 w-4 text-emerald-500" />
          <h3 className="text-xs font-medium text-foreground">Cost limits</h3>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3">
          Agent auto-pauses and notifies you when spending exceeds a threshold.
        </p>
        <div className="space-y-3">
          <CostLimitField label="Per run" hint={COST_HINTS.cost_limit_per_run_usd} value={guardrails.cost_limit_per_run_usd} onChange={(v) => updateCostLimit('cost_limit_per_run_usd', v)} />
          <CostLimitField label="Daily" hint={COST_HINTS.cost_limit_daily_usd} value={guardrails.cost_limit_daily_usd} onChange={(v) => updateCostLimit('cost_limit_daily_usd', v)} />
          <CostLimitField label="Monthly" hint={COST_HINTS.cost_limit_monthly_usd} value={guardrails.cost_limit_monthly_usd} onChange={(v) => updateCostLimit('cost_limit_monthly_usd', v)} />
        </div>
      </section>

      {/* Loop detection */}
      <section>
        <div className="flex items-center gap-2 mb-1.5">
          <RefreshCw className="h-4 w-4 text-blue-400" />
          <h3 className="text-xs font-medium text-foreground">Loop detection</h3>
        </div>
        <PanelDetailBlock>
          <div className="flex items-center gap-2 mb-1">
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Active
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Same tool + arguments called 3x in one run → agent auto-pauses. This prevents
            runaway loops from burning tokens.
          </p>
        </PanelDetailBlock>
      </section>
    </PanelLayout>
  )
}

// ─── Cost Limit Field ─────────────────────────────────────────────────────────

function CostLimitField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: number | null
  onChange: (v: string) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground w-16">{label}</span>
        <div className="flex-1 flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">$</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="No limit"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 text-sm bg-transparent border-border focus:border-border"
          />
        </div>
      </div>
      {hint && (
        <p className="text-[10px] text-muted-foreground mt-1 ml-[76px]">{hint}</p>
      )}
    </div>
  )
}
