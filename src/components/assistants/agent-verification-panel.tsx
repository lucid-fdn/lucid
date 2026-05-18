'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Shield,
  Fingerprint,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { Passport as BasePassport } from 'raijin-labs-lucid-ai/models'
import { PanelLayout, PanelStateCard, PanelEmptyState, PanelDetailBlock } from '@/components/panels/panel-layout'

// Extended Passport type
type Passport = BasePassport & {
  nftMint?: string | null
  nftChain?: string | null
  shareTokenMint?: string | null
  depinMetadataCid?: string | null
  depinProvider?: string | null
  externalRegistrations?: Record<string, {
    externalId?: string
    txSignature?: string
    registrationDocUri?: string | null
    registeredAt?: number
    lastSyncedAt?: number
    status?: 'synced' | 'failed' | 'pending'
    lastError?: string | null
  }> | null
}

// ── Types ──

interface ReceiptSummary {
  runId: string
  tokensIn: number
  tokensOut: number
  totalLatencyMs: number
  timestamp: number
  receiptHash: string
  anchor?: {
    chain?: string
    tx?: string
    epochId?: string
  } | null
}

interface ReceiptVerification {
  valid?: boolean
  hashValid?: boolean
  signatureValid?: boolean
  inclusionValid?: boolean
}

export interface AgentVerificationPanelProps {
  assistantId: string
  passportId: string | null
  initialPassport?: Passport | null
}

// ── Sub-components ──

function CopyableHash({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [value])

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {label && <span className="text-[10px] text-zinc-600 shrink-0">{label}</span>}
      <code className="text-[11px] text-zinc-500 font-mono truncate">{value}</code>
      <button onClick={copy} className="shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors">
        {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  )
}

function StatusDot({ status }: { status: 'active' | 'pending' | 'none' }) {
  return (
    <span className={cn(
      'h-2 w-2 rounded-full shrink-0',
      status === 'active' && 'bg-green-500',
      status === 'pending' && 'bg-yellow-500',
      status === 'none' && 'bg-zinc-600',
    )} />
  )
}

function VerificationBadge({ result }: { result: ReceiptVerification }) {
  const allValid = result.valid || (result.hashValid && result.signatureValid)
  return (
    <div className={cn(
      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] border',
      allValid
        ? 'bg-green-500/10 text-green-400 border-green-500/20'
        : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    )}>
      {allValid ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {allValid ? 'Verified' : 'Unverified'}
      {result.hashValid !== undefined && (
        <span className="text-zinc-600 ml-1">
          H:{result.hashValid ? 'ok' : 'fail'}
          {result.signatureValid !== undefined && ` S:${result.signatureValid ? 'ok' : 'fail'}`}
          {result.inclusionValid !== undefined && ` I:${result.inclusionValid ? 'ok' : 'fail'}`}
        </span>
      )}
    </div>
  )
}

// ── Main component ──

export function AgentVerificationPanel({
  assistantId,
  passportId,
  initialPassport,
}: AgentVerificationPanelProps) {
  const [passport, setPassport] = useState<Passport | null>(initialPassport ?? null)
  const [provisioning, setProvisioning] = useState(false)
  const [recentReceipt, setRecentReceipt] = useState<ReceiptSummary | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [verification, setVerification] = useState<ReceiptVerification | null>(null)
  const [verifying, setVerifying] = useState(false)

  const handleProvision = useCallback(async () => {
    setProvisioning(true)
    try {
      const csrfToken = getCsrfToken()
      const res = await fetch(`/api/assistants/${assistantId}/passport`, {
        method: 'POST',
        headers: { ...(csrfToken && { 'x-csrf-token': csrfToken }) },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Failed to provision passport')
        return
      }
      const data = await res.json()
      if (data.passport) {
        setPassport(data.passport)
        toast.success('Passport provisioned')
      }
    } catch {
      toast.error('Failed to provision passport')
    } finally {
      setProvisioning(false)
    }
  }, [assistantId])

  const fetchReceipt = useCallback(async (runId: string) => {
    setReceiptLoading(true)
    try {
      const res = await fetch(`/api/assistants/${assistantId}/receipts?runId=${runId}&action=get`)
      if (!res.ok) return
      const data = await res.json()
      if (data.receipt) setRecentReceipt(data.receipt)
    } catch {
      // Non-critical
    } finally {
      setReceiptLoading(false)
    }
  }, [assistantId])

  const handleVerify = useCallback(async (runId: string) => {
    setVerifying(true)
    try {
      const res = await fetch(`/api/assistants/${assistantId}/receipts?runId=${runId}&action=verify`)
      if (!res.ok) return
      const data = await res.json()
      if (data.verification) setVerification(data.verification)
    } catch {
      toast.error('Verification failed')
    } finally {
      setVerifying(false)
    }
  }, [assistantId])

  // Not provisioned — empty state with action
  if (!passportId) {
    return (
      <PanelLayout context="Cryptographic proof of all agent activity, anchored on-chain.">
        <PanelEmptyState
          icon={<Fingerprint className="h-4 w-4 text-zinc-600" />}
          title="Not provisioned"
          description="Enable verifiable receipts so every action, transaction, and decision has cryptographic proof."
        >
          <div className="text-[11px] text-zinc-600 space-y-1 text-left mb-3">
            <p className="text-zinc-500">Proves: actions, transactions, decisions</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs w-full"
            onClick={handleProvision}
            disabled={provisioning}
          >
            {provisioning ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <Shield className="h-3 w-3 mr-1.5" />
            )}
            Provision passport
          </Button>
        </PanelEmptyState>
      </PanelLayout>
    )
  }

  // Provisioned — show passport details + receipts
  return (
    <PanelLayout
      context="Cryptographic proof of all agent activity, anchored on-chain."
      state={
        <PanelStateCard
          icon={<Fingerprint className="h-4 w-4 text-emerald-400" />}
          title="Passport"
          subtitle="Provisioned"
          variant="success"
          status={<StatusDot status="active" />}
        >
          <div className="space-y-1.5">
            <CopyableHash value={passportId} label="ID" />
            {passport?.owner && (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] text-zinc-600 shrink-0">Owner</span>
                <img src="/logos/icon/solana.svg" alt="SOL" className="h-3 w-3 rounded-full shrink-0" />
                <a
                  href={`https://solscan.io/account/${passport.owner}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors font-mono truncate"
                >
                  {passport.owner}
                </a>
                <CopyButton value={passport.owner} />
              </div>
            )}
            {passport?.onChain?.tx && (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] text-zinc-600 shrink-0">On-chain</span>
                <img src="/logos/icon/solana.svg" alt="SOL" className="h-3 w-3 rounded-full shrink-0" />
                <a
                  href={`https://solscan.io/tx/${passport.onChain.tx}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors font-mono truncate"
                >
                  {truncateHash(passport.onChain.tx)}
                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                </a>
              </div>
            )}
            {passport?.onChain?.pda && (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] text-zinc-600 shrink-0">PDA</span>
                <img src="/logos/icon/solana.svg" alt="SOL" className="h-3 w-3 rounded-full shrink-0" />
                <a
                  href={`https://solscan.io/account/${passport.onChain.pda}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors font-mono truncate"
                >
                  {truncateHash(passport.onChain.pda)}
                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                </a>
              </div>
            )}
            {passport?.nftMint && (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] text-zinc-600 shrink-0">NFT</span>
                <ChainLogo chain={passport.nftChain ?? undefined} />
                <a
                  href={`https://solscan.io/token/${passport.nftMint}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors font-mono truncate"
                >
                  {truncateHash(passport.nftMint)}
                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                </a>
              </div>
            )}
            {passport?.externalRegistrations && Object.keys(passport.externalRegistrations).length > 0 && (
              <div className="space-y-1 pt-1.5 border-t border-border">
                <span className="text-[10px] text-zinc-600">Identity projections</span>
                {Object.entries(passport.externalRegistrations).map(([registry, reg]) => (
                  <div key={registry} className="flex items-center gap-1.5 min-w-0">
                    <StatusDot status={reg.status === 'synced' ? 'active' : reg.status === 'pending' ? 'pending' : 'none'} />
                    <span className="text-[10px] text-zinc-500 capitalize shrink-0">{registry}</span>
                    {reg.txSignature && (
                      <>
                        <ChainLogo chain="solana" />
                        <a
                          href={`https://solscan.io/tx/${reg.txSignature}`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-[10px] text-blue-400 hover:text-blue-300 transition-colors font-mono truncate"
                        >
                          {truncateHash(reg.txSignature)}
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                        </a>
                      </>
                    )}
                    {reg.status === 'failed' && reg.lastError && (
                      <span className="text-[9px] text-red-400 truncate">{reg.lastError}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </PanelStateCard>
      }
    >
      {/* Receipt verification */}
      <PanelDetailBlock>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCheck className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-300">Receipts</span>
          </div>
          <Badge variant="outline" className="text-[9px] h-4 border-zinc-700 text-zinc-500">
            <Shield className="h-2.5 w-2.5 mr-0.5" />
            Chain-anchored
          </Badge>
        </div>

        <p className="text-[10px] text-zinc-600 leading-relaxed">
          Every agent run produces a cryptographic receipt. Receipts are batched
          into epochs, then anchored on-chain.
        </p>

        {/* Receipt pipeline */}
        <div className="flex items-center gap-1 text-[10px] text-zinc-600 overflow-x-auto">
          <span className="px-1.5 py-0.5 rounded bg-muted whitespace-nowrap">Agent Run</span>
          <span>&rarr;</span>
          <span className="px-1.5 py-0.5 rounded bg-muted whitespace-nowrap">Receipt</span>
          <span>&rarr;</span>
          <span className="px-1.5 py-0.5 rounded bg-muted whitespace-nowrap">Epoch Batch</span>
          <span>&rarr;</span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 whitespace-nowrap">
            <img src="/logos/icon/solana.svg" alt="SOL" className="h-3 w-3 rounded-full" />
            Chain Anchor
          </span>
          <span>&rarr;</span>
          <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 whitespace-nowrap">DePIN Archive</span>
        </div>

        {recentReceipt && (
          <div className="rounded border border-border p-2 space-y-1.5 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-600 uppercase">Latest receipt</span>
              {verification && <VerificationBadge result={verification} />}
            </div>
            <CopyableHash value={recentReceipt.receiptHash} label="Hash" />
            <div className="flex items-center gap-3 text-[10px] text-zinc-600">
              <span>{recentReceipt.tokensIn + recentReceipt.tokensOut} tokens</span>
              <span>{recentReceipt.totalLatencyMs}ms</span>
              <span>{new Date(recentReceipt.timestamp).toLocaleString()}</span>
            </div>
            {recentReceipt.anchor?.tx && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-green-400">Anchored:</span>
                <ChainLogo chain={recentReceipt.anchor.chain} />
                <a
                  href={`https://solscan.io/tx/${recentReceipt.anchor.tx}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[10px] font-mono text-blue-400 hover:text-blue-300 transition-colors truncate"
                >
                  {truncateHash(recentReceipt.anchor.tx)}
                  <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                </a>
              </div>
            )}
            {!verification && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] mt-1"
                onClick={() => handleVerify(recentReceipt.runId)}
                disabled={verifying}
              >
                {verifying ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Shield className="h-3 w-3 mr-1" />}
                Verify
              </Button>
            )}
          </div>
        )}
      </PanelDetailBlock>
    </PanelLayout>
  )
}

// ── Utils ──

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(^| )csrf-token=([^;]+)/)
  return match ? match[2] : null
}

function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

function ChainLogo({ chain }: { chain?: string }) {
  const isSolana = !chain || chain.startsWith('solana')
  return (
    <img
      src={isSolana ? '/logos/icon/solana.svg' : '/logos/icon/ethereum.svg'}
      alt={isSolana ? 'SOL' : 'ETH'}
      className="h-3 w-3 rounded-full shrink-0"
    />
  )
}
