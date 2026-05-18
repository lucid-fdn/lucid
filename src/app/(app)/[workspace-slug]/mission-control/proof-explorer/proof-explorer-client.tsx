'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/mission-control/empty-state'
import {
  Shield,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Filter,
  FileCheck,
} from 'lucide-react'
import type { MCAgent } from '@/lib/mission-control/types'

interface ProofAnchor {
  id: string
  org_id: string
  agent_id: string
  run_id: string
  tool_name: string
  tool_args: Record<string, unknown>
  tool_result_hash: string | null
  policy_snapshot: Record<string, unknown> | null
  anchor_tx_hash: string | null
  anchor_chain: string | null
  anchor_status: string
  verification_data: Record<string, unknown> | null
  created_at: string
}

interface ProofReceiptsClientProps {
  orgId: string
  workspaceSlug: string
  agents: MCAgent[]
}

const PAGE_SIZE = 30

const STATUS_CONFIG: Record<string, { icon: typeof Shield; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-yellow-400', label: 'Pending' },
  anchored: { icon: Shield, color: 'text-blue-400', label: 'Recorded' },
  verified: { icon: CheckCircle2, color: 'text-green-400', label: 'Verified' },
  failed: { icon: AlertTriangle, color: 'text-red-400', label: 'Failed' },
}

export function ProofReceiptsClient({ orgId, workspaceSlug, agents }: ProofReceiptsClientProps) {
  const [proofs, setProofs] = useState<ProofAnchor[]>([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [expandedProof, setExpandedProof] = useState<string | null>(null)
  const [verifying, setVerifying] = useState<string | null>(null)
  const [verifyResult, setVerifyResult] = useState<Record<string, unknown> | null>(null)

  const fetchProofs = useCallback(async (newOffset: number, agentId: string | null) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        org_id: orgId,
        limit: String(PAGE_SIZE),
        offset: String(newOffset),
      })
      if (agentId) params.set('agent_id', agentId)

      const res = await fetch(`/api/mission-control/proofs?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')

      const data = await res.json()
      const items: ProofAnchor[] = data.proofs ?? []
      setProofs(items)
      setHasMore(items.length === PAGE_SIZE)
    } catch {
      setProofs([])
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    fetchProofs(offset, selectedAgentId)
  }, [offset, selectedAgentId, fetchProofs])

  const handleVerify = async (proofId: string) => {
    setVerifying(proofId)
    setVerifyResult(null)
    try {
      const res = await fetch('/api/mission-control/proofs/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof_id: proofId, org_id: orgId }),
      })
      const data = await res.json()
      setVerifyResult(data)
    } catch {
      setVerifyResult({ error: 'Verification request failed' })
    } finally {
      setVerifying(null)
    }
  }

  const handleAgentFilter = (value: string) => {
    setOffset(0)
    setSelectedAgentId(value === 'all' ? null : value)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          className={cn(
            'text-sm bg-transparent border rounded px-2 py-1',
            'focus:outline-none focus:ring-1 focus:ring-ring'
          )}
          value={selectedAgentId ?? 'all'}
          onChange={(e) => handleAgentFilter(e.target.value)}
        >
          <option value="all">All agents</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>

      {/* Receipt List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : proofs.length === 0 ? (
          <EmptyState
            icon={<FileCheck className="h-8 w-8" />}
            title="No proof receipts yet"
            description="Proof receipts will appear here after agents run elevated tools or produce verifiable evidence."
          />
        ) : (
          <div className="p-3 space-y-1">
            {proofs.map((proof) => (
              <ProofCard
                key={proof.id}
                proof={proof}
                expanded={expandedProof === proof.id}
                onToggle={() =>
                  setExpandedProof(expandedProof === proof.id ? null : proof.id)
                }
                onVerify={() => handleVerify(proof.id)}
                verifying={verifying === proof.id}
                verifyResult={expandedProof === proof.id ? verifyResult : null}
                agents={agents}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-2 border-t">
        <Button
          variant="ghost"
          size="sm"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {Math.floor(offset / PAGE_SIZE) + 1}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasMore}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}

function ProofCard({
  proof,
  expanded,
  onToggle,
  onVerify,
  verifying,
  verifyResult,
  agents,
}: {
  proof: ProofAnchor
  expanded: boolean
  onToggle: () => void
  onVerify: () => void
  verifying: boolean
  verifyResult: Record<string, unknown> | null
  agents: MCAgent[]
}) {
  const config = STATUS_CONFIG[proof.anchor_status] ?? STATUS_CONFIG.pending
  const StatusIcon = config.icon
  const agentName = agents.find((a) => a.id === proof.agent_id)?.name ?? 'Unknown'
  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <div className="rounded-lg border border-border/50 transition-colors">
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5 flex items-center gap-2.5"
      >
        <StatusIcon className={cn('h-4 w-4 flex-shrink-0', config.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono">{proof.tool_name}</span>
            <span className="text-[10px] text-muted-foreground/60">{agentName}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground/50">
            <span>{formatTime(proof.created_at)}</span>
            <span
              className={cn(
                'px-1 py-0.5 rounded text-[9px]',
                proof.anchor_tx_hash
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-yellow-500/10 text-yellow-400'
              )}
            >
              {proof.anchor_tx_hash ? 'Receipt ready' : 'Pending'}
            </span>
          </div>
        </div>
        <Chevron className="h-3.5 w-3.5 text-muted-foreground/50" />
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border/30 space-y-3">
          {/* Tool Args */}
          <div>
            <h4 className="text-[10px] text-muted-foreground/60 uppercase mb-1">
              Tool Arguments
            </h4>
            <pre className="text-[11px] text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto max-h-32">
              {JSON.stringify(proof.tool_args, null, 2)}
            </pre>
          </div>

          {/* Policy Snapshot */}
          {proof.policy_snapshot && (
            <div>
              <h4 className="text-[10px] text-muted-foreground/60 uppercase mb-1">
                Policy Snapshot
              </h4>
              <pre className="text-[11px] text-muted-foreground bg-muted/50 rounded p-2 overflow-x-auto max-h-32">
                {JSON.stringify(proof.policy_snapshot, null, 2)}
              </pre>
            </div>
          )}

          {/* Result Hash */}
          {proof.tool_result_hash && (
            <div>
              <h4 className="text-[10px] text-muted-foreground/60 uppercase mb-1">
                Result Hash (SHA-256)
              </h4>
              <code className="text-[11px] text-muted-foreground font-mono break-all">
                {proof.tool_result_hash}
              </code>
            </div>
          )}

          {/* Receipt Reference */}
          {proof.anchor_tx_hash && (
            <div>
              <h4 className="text-[10px] text-muted-foreground/60 uppercase mb-1">
                Receipt Reference
              </h4>
              <div className="flex items-center gap-2">
                <code className="text-[11px] text-muted-foreground font-mono break-all">
                  {proof.anchor_tx_hash}
                </code>
                <span className="text-[10px] text-muted-foreground/50">
                  ({proof.anchor_chain})
                </span>
              </div>
            </div>
          )}

          {/* Receipt Lineage */}
          <div>
            <h4 className="text-[10px] text-muted-foreground/60 uppercase mb-1">
              Receipt Lineage
            </h4>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="px-1.5 py-0.5 rounded bg-muted">
                run:{proof.run_id.slice(0, 8)}
              </span>
              <span>&rarr;</span>
              <span className="px-1.5 py-0.5 rounded bg-muted font-mono">
                {proof.tool_name}
              </span>
              {proof.tool_result_hash && (
                <>
                  <span>&rarr;</span>
                  <span className="px-1.5 py-0.5 rounded bg-muted">
                    hash:{proof.tool_result_hash.slice(0, 12)}
                  </span>
                </>
              )}
              {proof.anchor_tx_hash && (
                <>
                  <span>&rarr;</span>
                  <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                    receipt:{proof.anchor_tx_hash.slice(0, 12)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Verify Button */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onVerify}
              disabled={verifying}
              className="text-xs"
            >
              {verifying ? (
                <>
                  <Clock className="h-3 w-3 mr-1 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="h-3 w-3 mr-1" />
                  Verify Receipt
                </>
              )}
            </Button>
          </div>

          {/* Verify Result */}
          {verifyResult && (
            <div
              className={cn(
                'rounded p-2 text-xs',
                verifyResult.verified
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
              )}
            >
              {String(verifyResult.message ?? JSON.stringify(verifyResult))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

