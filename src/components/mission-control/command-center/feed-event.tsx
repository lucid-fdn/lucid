'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  Square,
  Pause,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  ArrowRightLeft,
  BadgeCheck,
  ShieldAlert,
  ExternalLink,
  FileCheck,
  ShieldCheck,
  Fingerprint,
  Loader2,
  Anchor,
  Clock,
  CalendarCheck,
  CalendarX,
  MessageSquare,
  GitBranch,
  GitMerge,
  PlugZap,
  Plug,
  Plug2,
} from 'lucide-react'
import { getEventLabel, isCelebrableEvent, getCelebrationLabel, getRecoveryLabel } from '@/lib/expressions'
import { describeCronExpression } from '@/lib/scheduler/cron-utils'
import type { FeedEvent } from '@/lib/mission-control/types'

// ── Icon + style maps ──────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, LucideIcon> = {
  tool_call: Wrench,
  tool_result: CheckCircle2,
  error: AlertTriangle,
  approval_requested: AlertTriangle,
  approval_resolved: CheckCircle2,
  run_started: Play,
  run_finished: Square,
  channel_connected: PlugZap,
  channel_disconnected: Plug,
  channel_deactivated: Plug2,
  agent_paused: Pause,
  agent_resumed: RotateCcw,
  transaction_submitted: ArrowRightLeft,
  transaction_confirmed: BadgeCheck,
  transaction_failed: XCircle,
  remediation_triggered: ShieldAlert,
  receipt_created: FileCheck,
  receipt_verified: ShieldCheck,
  passport_provisioned: Fingerprint,
  epoch_anchored: Anchor,
  task_scheduled: Clock,
  task_completed: CalendarCheck,
  task_failed: CalendarX,
  task_cancelled: CalendarX,
  agent_message_sent: MessageSquare,
  subagent_spawned: GitBranch,
  subagent_completed: GitMerge,
  subagent_failed: GitBranch,
}

const SEVERITY_STYLES = {
  info: 'border-l-transparent',
  warn: 'border-l-yellow-500',
  warning: 'border-l-yellow-500',
  error: 'border-l-red-500',
  critical: 'border-l-red-600 bg-red-500/5',
}

// ── Main component ─────────────────────────────────────────────────────────

interface FeedEventCardProps {
  event: FeedEvent
}

export function FeedEventCard({ event }: FeedEventCardProps) {
  const [expanded, setExpanded] = useState(false)
  const Icon: LucideIcon = EVENT_ICONS[event.event_type] || Wrench
  const timeAgo = formatTimeAgo(event.created_at)
  const hasDetails = event.payload && Object.keys(event.payload).length > 0
  const isCelebration = isCelebrableEvent(event.event_type)
  const isRecovery = event.event_type === 'agent_resumed' && !!(event.payload as Record<string, unknown> | undefined)?.from_error

  return (
    <div
      className={cn(
        'border-l-2 rounded-r-lg px-3 py-2 transition-colors hover:bg-accent/30 overflow-hidden',
        'animate-in fade-in-0 slide-in-from-bottom-1 duration-120',
        SEVERITY_STYLES[event.severity],
        isCelebration && 'animate-success-flash',
        isRecovery && 'animate-recovery-bounce',
        event.severity === 'error' && 'animate-error-shake',
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          className={cn(
            'h-4 w-4 mt-0.5 flex-shrink-0',
            event.severity === 'error' || event.severity === 'critical'
              ? 'text-red-400'
              : event.severity === 'warn' || event.severity === 'warning'
                ? 'text-yellow-400'
                : isCelebration
                  ? 'text-green-400'
                  : 'text-muted-foreground'
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {event.agent_name}
            </span>
            <span className={cn(
              'text-xs text-muted-foreground/50',
              isCelebration && 'text-green-400/70 font-medium',
              isRecovery && 'text-blue-400/70 font-medium',
            )}>
              {isRecovery
                ? getRecoveryLabel(event.agent_id)
                : isCelebration
                  ? getCelebrationLabel(event.event_type, event.id)
                  : getEventLabel(event.event_type, event.id)}
            </span>
          </div>

          {/* Payload-aware inline summaries */}
          <EventPayloadSummary event={event} />
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground/50">{timeAgo}</span>
          {hasDetails && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-0.5 hover:bg-accent rounded"
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          )}
        </div>
      </div>
      {expanded && hasDetails && (
        <pre className="mt-2 text-[11px] text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto max-h-40">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ── Payload-aware summary renderer ─────────────────────────────────────────

function EventPayloadSummary({ event }: { event: FeedEvent }) {
  const p = (event.payload ?? {}) as Record<string, unknown>

  // Errors (outbound failed)
  if (event.event_type === 'error') {
    return (
      <>
        {p.message_text && (
          <p className="text-sm mt-0.5 truncate">{String(p.message_text)}</p>
        )}
        {p.last_error && (
          <p className="text-xs text-red-400 mt-0.5 truncate">{String(p.last_error)}</p>
        )}
      </>
    )
  }

  // Transactions
  if (event.event_type.startsWith('transaction_')) {
    return <TransactionSummary payload={p} />
  }

  // Approvals
  if (event.event_type === 'approval_requested') {
    return <ApprovalRequestSummary payload={p} />
  }
  if (event.event_type === 'approval_resolved') {
    return <ApprovalResolvedSummary payload={p} />
  }

  // Remediation
  if (event.event_type === 'remediation_triggered') {
    return <RemediationSummary payload={p} />
  }

  // Scheduled tasks
  if (event.event_type.startsWith('task_')) {
    return <TaskEventSummary event={event} payload={p} />
  }

  // Receipt pipeline events
  if (event.event_type === 'receipt_created' || event.event_type === 'receipt_verified' || event.event_type === 'passport_provisioned' || event.event_type === 'epoch_anchored') {
    return <ReceiptEventSummary event={event} payload={p} />
  }

  // Agent messaging
  if (event.event_type === 'agent_message_sent') {
    return (
      <div className="text-xs mt-1 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground/70">→ {String(p.target_assistant_name ?? 'Unknown')}</span>
        </div>
        {p.message_preview ? (
          <p className="text-muted-foreground/50 truncate">{String(p.message_preview)}</p>
        ) : null}
      </div>
    )
  }

  // Subagent events
  if (event.event_type.startsWith('subagent_')) {
    const taskPreview = p.task_preview ? String(p.task_preview) : null
    const depth = p.depth != null ? String(p.depth) : null
    const durationMs = p.duration_ms != null ? Number(p.duration_ms) : null
    const toolCalls = p.tool_calls_used != null ? Number(p.tool_calls_used) : null
    const errorMsg = p.error ? String(p.error) : null
    return (
      <div className="text-xs mt-1 space-y-0.5">
        {taskPreview && <p className="text-muted-foreground/50 truncate">{taskPreview}</p>}
        <div className="flex items-center gap-2 text-muted-foreground/40">
          {depth && <span>depth {depth}</span>}
          {durationMs != null && <span>{durationMs > 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`}</span>}
          {toolCalls != null && <span>{toolCalls} tools</span>}
          {errorMsg && <span className="text-red-400 truncate">{errorMsg}</span>}
        </div>
      </div>
    )
  }

  // Fallback: show message_text if present
  if (p.message_text) {
    return <p className="text-sm mt-0.5 truncate">{String(p.message_text)}</p>
  }

  return null
}

// ── Transaction summary ────────────────────────────────────────────────────

function TransactionSummary({ payload: p }: { payload: Record<string, unknown> }) {
  const txType = String(p.tx_type ?? '')
  const chainType = String(p.chain_type ?? '')
  const txHash = p.tx_hash ? String(p.tx_hash) : null
  const status = String(p.status ?? '')

  const explorerUrl = txHash
    ? chainType === 'solana'
      ? `https://solscan.io/tx/${txHash}`
      : `https://etherscan.io/tx/${txHash}`
    : null

  return (
    <div className="text-xs mt-1 space-y-0.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <TxTypeBadge type={txType} />
        {txType === 'swap' && p.input_token != null ? (
          <span>
            {String(p.input_amount ?? '')} {String(p.input_token ?? '')} &rarr; {String(p.output_amount ?? '')} {String(p.output_token ?? '')}
          </span>
        ) : null}
        {txType === 'transfer' && p.recipient_address != null ? (
          <span>
            {p.input_amount ? `${String(p.input_amount)} ${String(p.input_token ?? '')} ` : ''}
            &rarr; {truncateAddress(String(p.recipient_address))}
          </span>
        ) : null}
        {(txType === 'perp_order' || txType === 'perp_cancel') && p.perp_market != null ? (
          <span>
            {String(p.perp_side ?? '').toUpperCase()} {String(p.perp_size ?? '')} {String(p.perp_market ?? '')}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-muted-foreground/70">
        {p.value_usd != null && Number(p.value_usd) > 0 ? (
          <span>${Number(p.value_usd).toFixed(2)}</span>
        ) : null}
        {p.dex_used != null ? <span>via {String(p.dex_used)}</span> : null}
        <ChainBadge chain={chainType} chainId={p.chain_id ? String(p.chain_id) : undefined} />
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-400 hover:underline font-mono"
          >
            <ChainIcon chain={chainType} className="h-2.5 w-2.5" />
            {truncateAddress(txHash!)}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
      {status === 'failed' && p.error_message != null ? (
        <p className="text-red-400 truncate">{String(p.error_message)}</p>
      ) : null}
    </div>
  )
}

// ── Approval request summary ───────────────────────────────────────────────

function ApprovalRequestSummary({ payload: p }: { payload: Record<string, unknown> }) {
  const toolName = String(p.tool_name ?? '')
  const riskLevel = String(p.risk_level ?? 'medium')
  const cost = p.estimated_cost_usd != null ? Number(p.estimated_cost_usd) : null
  const expiresAt = p.expires_at ? String(p.expires_at) : null

  return (
    <div className="text-xs mt-1 space-y-0.5">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[11px]">{toolName}</span>
        <RiskBadge level={riskLevel} />
        {cost != null && cost > 0 && (
          <span className="text-muted-foreground/70">~${cost.toFixed(2)}</span>
        )}
      </div>
      {expiresAt && (
        <span className="text-muted-foreground/50">
          expires {formatTimeAgo(expiresAt)}
        </span>
      )}
    </div>
  )
}

// ── Approval resolved summary ──────────────────────────────────────────────

function ApprovalResolvedSummary({ payload: p }: { payload: Record<string, unknown> }) {
  const action = String(p.action ?? '')
  const toolName = String(p.tool_name ?? '')
  const reason = p.reason ? String(p.reason) : null

  const actionColors: Record<string, string> = {
    approved: 'text-green-400',
    denied: 'text-red-400',
    auto_denied: 'text-red-400',
    expired: 'text-yellow-400',
  }

  return (
    <div className="text-xs mt-1">
      <div className="flex items-center gap-1.5">
        <span className={cn('font-medium', actionColors[action] ?? 'text-muted-foreground')}>
          {action.replace('_', ' ')}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{toolName}</span>
      </div>
      {reason && (
        <p className="text-muted-foreground/70 mt-0.5 truncate">{reason}</p>
      )}
    </div>
  )
}

// ── Remediation summary ────────────────────────────────────────────────────

function RemediationSummary({ payload: p }: { payload: Record<string, unknown> }) {
  const actionTaken = String(p.action_taken ?? '')
  const outcome = String(p.outcome ?? '')

  const outcomeColors: Record<string, string> = {
    success: 'bg-green-500/10 text-green-500',
    failed: 'bg-red-500/10 text-red-500',
    skipped: 'bg-yellow-500/10 text-yellow-500',
  }

  return (
    <div className="text-xs mt-1 flex items-center gap-1.5">
      <span>{actionTaken}</span>
      <span className={cn('px-1.5 py-0.5 rounded text-[10px]', outcomeColors[outcome] ?? 'bg-muted')}>
        {outcome}
      </span>
    </div>
  )
}

// ── Scheduled task summary ─────────────────────────────────────────────

function TaskEventSummary({ event, payload: p }: { event: FeedEvent; payload: Record<string, unknown> }) {
  const taskName = p.task_name ? String(p.task_name) : null
  const cronExpr = p.cron_expression ? String(p.cron_expression) : null
  const lastError = p.last_error ? String(p.last_error) : null
  const runCount = p.run_count != null ? Number(p.run_count) : null
  const status = p.status ? String(p.status) : null
  const cronLabel = cronExpr ? describeCronExpression(cronExpr) : null

  return (
    <div className="text-xs mt-1 space-y-0.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {taskName && <span className="font-medium">{taskName}</span>}
        {cronLabel ? (
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]" title={cronExpr!}>
            {cronLabel}
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">one-shot</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-muted-foreground/70">
        {runCount != null && runCount > 0 && <span>{runCount} run{runCount !== 1 ? 's' : ''}</span>}
        {status === 'dead_letter' && <span className="text-red-400">dead letter</span>}
      </div>
      {event.event_type === 'task_failed' && lastError && (
        <p className="text-red-400 truncate">{lastError}</p>
      )}
    </div>
  )
}

// ── Receipt event summary ──────────────────────────────────────────────

function ReceiptEventSummary({ event, payload: p }: { event: FeedEvent; payload: Record<string, unknown> }) {
  if (event.event_type === 'passport_provisioned') {
    const passportId = p.passport_id ? String(p.passport_id) : null
    const owner = p.owner ? String(p.owner) : null
    const chainTx = p.chain_tx ? String(p.chain_tx) : null
    return (
      <div className="text-xs mt-1 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px]">Passport</span>
          {passportId && (
            <span className="font-mono text-[10px] text-muted-foreground/70 truncate max-w-[160px]">
              {passportId}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-muted-foreground/60">
          {owner && (
            <a
              href={`https://solscan.io/account/${owner}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors text-[10px] font-mono"
              title="View owner wallet on Solscan"
            >
              <ChainIcon chain="solana" className="h-2.5 w-2.5" />
              {truncateAddress(owner)}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          {chainTx && (
            <a
              href={`https://solscan.io/tx/${chainTx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors text-[10px]"
              title="View on-chain registration"
            >
              <ChainIcon chain="solana" className="h-2.5 w-2.5" />
              On-chain
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      </div>
    )
  }

  if (event.event_type === 'receipt_created') {
    const tokensIn = Number(p.tokens_in) || 0
    const tokensOut = Number(p.tokens_out) || 0
    const totalTokens = tokensIn + tokensOut
    const model = p.model ? String(p.model) : null
    const receiptHash = p.receipt_hash ? String(p.receipt_hash) : null
    const runCount = p.run_count != null ? Number(p.run_count) : null
    const chainTx = p.chain_tx ? String(p.chain_tx) : null
    const chain = p.chain ? String(p.chain) : null
    return (
      <div className="text-xs mt-1 space-y-0.5 overflow-hidden">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px]">Receipt</span>
          {model && <span className="text-muted-foreground/50 font-mono text-[10px]">{model}</span>}
          {runCount != null && runCount > 0 && <span className="text-muted-foreground/50 text-[10px]">{runCount} run{runCount !== 1 ? 's' : ''}</span>}
        </div>
        {totalTokens > 0 && (
          <div className="text-muted-foreground/70">
            {tokensIn.toLocaleString()} in / {tokensOut.toLocaleString()} out
            <span className="text-muted-foreground/50 ml-1">({totalTokens.toLocaleString()} total)</span>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap text-muted-foreground/60">
          {receiptHash && (
            <span className="font-mono text-[10px] text-muted-foreground/50" title={receiptHash}>
              {receiptHash.length > 14 ? `${receiptHash.slice(0, 6)}...${receiptHash.slice(-4)}` : receiptHash}
            </span>
          )}
          {chainTx && (
            <a
              href={`https://solscan.io/tx/${chainTx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300 transition-colors text-[10px] font-mono shrink-0"
              title="View on-chain anchor"
            >
              <ChainIcon chain={chain ?? 'solana'} className="h-2.5 w-2.5" />
              {chainTx.length > 14 ? `${chainTx.slice(0, 6)}...${chainTx.slice(-4)}` : chainTx}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          <ReceiptProofLink agentId={event.agent_id} runId={event.run_id} />
        </div>
      </div>
    )
  }

  if (event.event_type === 'receipt_verified') {
    const valid = p.valid === true
    const receiptHash = p.receipt_hash ? String(p.receipt_hash) : null
    return (
      <div className="text-xs mt-1 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className={cn(
            'px-1.5 py-0.5 rounded text-[10px]',
            valid ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400',
          )}>
            {valid ? 'Verified' : 'Unverified'}
          </span>
          {p.hash_valid !== undefined && (
            <span className="text-[10px] text-muted-foreground/50">
              H:{p.hash_valid ? 'ok' : 'fail'}
              {p.signature_valid !== undefined && ` S:${p.signature_valid ? 'ok' : 'fail'}`}
            </span>
          )}
          <ReceiptProofLink agentId={event.agent_id} runId={event.run_id} />
        </div>
        {receiptHash && (
          <span className="font-mono text-[10px] text-muted-foreground/50 truncate block max-w-[250px]">
            {receiptHash}
          </span>
        )}
      </div>
    )
  }

  if (event.event_type === 'epoch_anchored') {
    const chainTx = p.chain_tx ? String(p.chain_tx) : null
    const receiptCount = p.receipt_count ? Number(p.receipt_count) : null
    const chain = p.chain ? String(p.chain) : 'solana'
    return (
      <div className="text-xs mt-1 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px]">Epoch Anchored</span>
          {receiptCount && <span className="text-muted-foreground/70">{receiptCount} receipts</span>}
        </div>
        {chainTx && (
          <div className="flex items-center gap-1.5 text-muted-foreground/60">
            <ChainIcon chain={chain} className="h-2.5 w-2.5" />
            <a
              href={`https://solscan.io/tx/${chainTx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300 transition-colors text-[10px] font-mono"
              title="View epoch anchor on Solana"
            >
              {chainTx.length > 14 ? `${chainTx.slice(0, 6)}...${chainTx.slice(-4)}` : chainTx}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        )}
      </div>
    )
  }

  return null
}

/**
 * Clickable proof link for verified receipts.
 * Fetches receipt to find anchor.tx (Solana tx), opens Solscan.
 * If not yet anchored, fetches Merkle proof and shows it.
 * If neither exists, shows a "Pending" toast — no null blob.
 */
function ReceiptProofLink({ agentId, runId }: { agentId: string; runId: string | null }) {
  const [loading, setLoading] = useState(false)

  if (!runId) return null

  const handleClick = async () => {
    setLoading(true)
    try {
      // 1. Fetch receipt — SDK Receipt has anchor?.tx (Solana tx signature)
      const res = await fetch(`/api/assistants/${agentId}/receipts?runId=${encodeURIComponent(runId)}&action=get`)
      if (res.ok) {
        const data = await res.json()
        const chainTx = data.receipt?.anchor?.tx
        if (chainTx) {
          window.open(`https://solscan.io/tx/${chainTx}`, '_blank', 'noopener,noreferrer')
          return
        }
      }

      // 2. Fetch Merkle proof — only show if it actually has data
      const proofRes = await fetch(`/api/assistants/${agentId}/receipts?runId=${encodeURIComponent(runId)}&action=proof`)
      if (proofRes.ok) {
        const proofData = await proofRes.json()
        if (proofData.proof && proofData.proof.root) {
          const blob = new Blob([JSON.stringify(proofData, null, 2)], { type: 'application/json' })
          window.open(URL.createObjectURL(blob), '_blank')
          return
        }
      }

      // 3. Neither available — epoch not yet anchored
      // Import would be heavy; use a simple alert-style feedback
      const { toast } = await import('sonner')
      toast.info('Chain anchor pending — proof will be available once the epoch is finalized on Solana.')
    } catch {
      // Silent
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="shrink-0 inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors text-[10px]"
      title="View on-chain proof"
    >
      <ChainIcon chain="solana" className="h-2.5 w-2.5" />
      {loading ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      ) : (
        <ExternalLink className="h-2.5 w-2.5" />
      )}
      <span>Proof</span>
    </button>
  )
}

// ── Shared micro-components ────────────────────────────────────────────────

function TxTypeBadge({ type }: { type: string }) {
  return (
    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px] uppercase">
      {type.replace('_', ' ')}
    </span>
  )
}

const CHAIN_META: Record<string, { label: string; icon: string }> = {
  solana: { label: 'SOL', icon: '/logos/icon/solana.svg' },
  ethereum: { label: 'ETH', icon: '/logos/icon/ethereum.svg' },
}

function resolveChainMeta(chain?: string, chainId?: string) {
  if (chain === 'solana') return CHAIN_META.solana
  if (chain === 'ethereum' || chainId) return CHAIN_META.ethereum
  return CHAIN_META.solana // default (Solana-based)
}

function ChainIcon({ chain, chainId, className }: { chain?: string; chainId?: string; className?: string }) {
  const meta = resolveChainMeta(chain, chainId)
  return (
    <img
      src={meta.icon}
      alt={meta.label}
      className={cn('inline-block h-3 w-3 rounded-full', className)}
    />
  )
}

function ChainBadge({ chain, chainId }: { chain: string; chainId?: string }) {
  const meta = resolveChainMeta(chain, chainId)
  const label = chain === 'solana' ? 'SOL' : chainId === '137' ? 'MATIC' : chainId === '8453' ? 'BASE' : chainId === '42161' ? 'ARB' : 'ETH'
  return (
    <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded bg-muted/50 text-[10px] text-muted-foreground/60 font-mono">
      <img src={meta.icon} alt={label} className="h-3 w-3 rounded-full" />
      {label}
    </span>
  )
}

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: 'bg-green-500/10 text-green-500',
    medium: 'bg-yellow-500/10 text-yellow-500',
    high: 'bg-orange-500/10 text-orange-500',
    critical: 'bg-red-500/10 text-red-500',
  }
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[10px]', colors[level] ?? 'bg-muted')}>
      {level}
    </span>
  )
}

// ── Utilities ──────────────────────────────────────────────────────────────

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
