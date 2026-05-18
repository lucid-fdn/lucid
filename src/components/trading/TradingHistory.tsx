'use client'

import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { notificationCopy } from '@/lib/notifications/copy'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'

interface TradingTransaction {
  id: string
  tx_hash: string | null
  tx_type: 'swap' | 'transfer' | 'perp_order' | 'perp_cancel'
  chain_type: 'ethereum' | 'solana'
  chain_id: string | null
  input_token: string | null
  input_amount: string | null
  output_token: string | null
  output_amount: string | null
  value_usd: number
  status: 'pending' | 'submitted' | 'confirmed' | 'failed' | 'rejected'
  error_message: string | null
  dex_used: string | null
  created_at: string
  confirmed_at: string | null
  assistants?: {
    name: string
  }
}

interface TradingStats {
  period: string
  totalTrades: number
  totalVolumeUsd: number
  successfulTrades: number
  failedTrades: number
  pendingTrades: number
  byType: Record<string, { count: number; volumeUsd: number }>
  byChain: Record<string, { count: number; volumeUsd: number }>
}

interface TradingHistoryProps {
  assistantId?: string
  showStats?: boolean
}

const CHAIN_DISPLAY: Record<string, { name: string; icon: string }> = {
  ethereum: { name: 'Ethereum', icon: '⟠' },
  solana: { name: 'Solana', icon: '◎' },
  base: { name: 'Base', icon: '🔵' },
  polygon: { name: 'Polygon', icon: '⬡' },
  arbitrum: { name: 'Arbitrum', icon: '🔷' },
}

const STATUS_DISPLAY: Record<string, { label: string; color: string; Icon: typeof CheckCircleIcon }> = {
  pending: { label: 'Pending', color: 'text-yellow-500', Icon: ClockIcon },
  submitted: { label: 'Submitted', color: 'text-blue-500', Icon: ArrowPathIcon },
  confirmed: { label: 'Confirmed', color: 'text-green-500', Icon: CheckCircleIcon },
  failed: { label: 'Failed', color: 'text-red-500', Icon: XCircleIcon },
  rejected: { label: 'Rejected', color: 'text-red-500', Icon: XCircleIcon },
}

const TX_TYPE_DISPLAY: Record<string, { label: string; Icon: typeof ArrowsRightLeftIcon }> = {
  swap: { label: 'Swap', Icon: ArrowsRightLeftIcon },
  transfer: { label: 'Transfer', Icon: ArrowUpRightIcon },
  perp_order: { label: 'Perp Order', Icon: ArrowsRightLeftIcon },
  perp_cancel: { label: 'Cancel Order', Icon: XCircleIcon },
}

export default function TradingHistory({
  assistantId,
  showStats = true,
}: TradingHistoryProps) {
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [transactions, setTransactions] = useState<TradingTransaction[]>([])
  const [stats, setStats] = useState<TradingStats | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const limit = 20

  // Filters
  const [chainFilter, setChainFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Load transactions
  const loadTransactions = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      })
      if (assistantId) params.append('assistantId', assistantId)
      if (chainFilter !== 'all') params.append('chainType', chainFilter)
      if (statusFilter !== 'all') params.append('status', statusFilter)

      const response = await fetch(`/api/trading/history?${params}`)
      if (!response.ok) throw new Error('Failed to load transactions')

      const data = await response.json()
      setTransactions(data.transactions)
      setTotal(data.total)
    } catch (error) {
      console.error('Error loading transactions:', error)
      toast.error(notificationCopy.title.error, 'Failed to load trading history')
    } finally {
      setIsLoading(false)
    }
  }, [assistantId, chainFilter, statusFilter, offset, toast])

  // Load stats
  const loadStats = useCallback(async () => {
    if (!showStats) return
    try {
      const response = await fetch('/api/trading/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistantId, period: 'day' }),
      })
      if (!response.ok) return

      const data = await response.json()
      setStats(data.stats)
    } catch (error) {
      console.error('Error loading stats:', error)
    }
  }, [assistantId, showStats])

  useEffect(() => {
    loadTransactions()
    loadStats()
  }, [loadTransactions, loadStats])

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0)
  }, [chainFilter, statusFilter])

  const _formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  const _formatAmount = (amount: string | null, token: string | null) => {
    if (!amount || !token) return '-'
    const num = parseFloat(amount)
    if (num < 0.001) return `<0.001 ${token}`
    return `${num.toFixed(4)} ${token}`
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {showStats && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Trades"
            value={stats.totalTrades.toString()}
            subtitle="Today"
          />
          <StatCard
            label="Volume"
            value={`$${stats.totalVolumeUsd.toFixed(2)}`}
            subtitle="Today"
          />
          <StatCard
            label="Successful"
            value={stats.successfulTrades.toString()}
            subtitle={`${((stats.successfulTrades / Math.max(stats.totalTrades, 1)) * 100).toFixed(0)}%`}
            valueColor="text-green-600"
          />
          <StatCard
            label="Failed"
            value={stats.failedTrades.toString()}
            subtitle={`${((stats.failedTrades / Math.max(stats.totalTrades, 1)) * 100).toFixed(0)}%`}
            valueColor="text-red-600"
          />
        </div>
      )}

      {/* Transactions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>
                Recent trading transactions {total > 0 && `(${total} total)`}
              </CardDescription>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
              <FunnelIcon className="h-4 w-4 text-muted-foreground" />
              <Select value={chainFilter} onValueChange={setChainFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Chain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Chains</SelectItem>
                  <SelectItem value="ethereum">Ethereum</SelectItem>
                  <SelectItem value="solana">Solana</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  loadTransactions()
                  loadStats()
                }}
              >
                <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && transactions.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <ArrowPathIcon className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ArrowsRightLeftIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="font-medium">No transactions found</p>
              <p className="text-sm mt-1">
                Trading transactions will appear here once executed
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <TransactionRow key={tx.id} transaction={tx} />
              ))}

              {/* Pagination */}
              {total > limit && (
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - limit))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={offset + limit >= total}
                      onClick={() => setOffset(offset + limit)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Stat card component
function StatCard({
  label,
  value,
  subtitle,
  valueColor,
}: {
  label: string
  value: string
  subtitle: string
  valueColor?: string
}) {
  return (
    <div className="p-4 rounded-lg bg-muted border border-border">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${valueColor || 'text-foreground'}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    </div>
  )
}

// Transaction row component
function TransactionRow({ transaction }: { transaction: TradingTransaction }) {
  const chain = CHAIN_DISPLAY[transaction.chain_type] || { name: transaction.chain_type, icon: '?' }
  const status = STATUS_DISPLAY[transaction.status] || STATUS_DISPLAY.pending
  const txType = TX_TYPE_DISPLAY[transaction.tx_type] || TX_TYPE_DISPLAY.swap
  const StatusIcon = status.Icon
  const TxIcon = txType.Icon

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    // Less than 1 hour
    if (diff < 60 * 60 * 1000) {
      const mins = Math.floor(diff / (60 * 1000))
      return `${mins}m ago`
    }
    // Less than 24 hours
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000))
      return `${hours}h ago`
    }
    // Otherwise show date
    return date.toLocaleDateString()
  }

  return (
    <div className="p-3 rounded-lg border border-border hover:bg-accent transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Chain Icon */}
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-lg">
            {chain.icon}
          </div>

          {/* Transaction Details */}
          <div>
            <div className="flex items-center gap-2">
              <TxIcon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-foreground">
                {txType.label}
              </span>
              {transaction.assistants?.name && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  {transaction.assistants.name}
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {transaction.tx_type === 'swap' ? (
                <>
                  {transaction.input_amount} {transaction.input_token} →{' '}
                  {transaction.output_amount} {transaction.output_token}
                </>
              ) : transaction.tx_type === 'transfer' ? (
                <>
                  {transaction.input_amount} {transaction.input_token}
                </>
              ) : (
                <>
                  {transaction.output_token} {transaction.input_amount}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          {/* Value */}
          <div className="text-right">
            <p className="font-medium text-foreground">
              ${transaction.value_usd.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">{formatDate(transaction.created_at)}</p>
          </div>

          {/* Status */}
          <div className={`flex items-center gap-1 ${status.color}`}>
            <StatusIcon className="h-4 w-4" />
            <span className="text-sm">{status.label}</span>
          </div>

          {/* Tx Link */}
          {transaction.tx_hash && (
            <a
              href={getExplorerUrl(transaction.chain_type, transaction.tx_hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600"
            >
              <ArrowUpRightIcon className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      {/* Error message */}
      {transaction.error_message && (
        <div className="mt-2 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded">
          {transaction.error_message}
        </div>
      )}
    </div>
  )
}

// Get explorer URL for transaction
function getExplorerUrl(chainType: string, txHash: string): string {
  const explorers: Record<string, string> = {
    ethereum: `https://etherscan.io/tx/${txHash}`,
    solana: `https://solscan.io/tx/${txHash}`,
    base: `https://basescan.org/tx/${txHash}`,
    polygon: `https://polygonscan.com/tx/${txHash}`,
    arbitrum: `https://arbiscan.io/tx/${txHash}`,
  }
  return explorers[chainType] || '#'
}
