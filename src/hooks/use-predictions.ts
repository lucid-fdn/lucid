'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { PREDICTIONS_POLL_INTERVAL } from '@/lib/trading/polymarket/constants'
import { setVisibleInterval } from '@/lib/utils/visible-interval'
import type {
  Position,
  OpenOrder,
  PredictionMarket,
  Orderbook,
  FundingInfo,
  PredictionsApiResponse,
  MarketSearchResponse,
  CancelOrderResponse,
  FundingApiResponse,
  WithdrawApiResponse,
} from '@/lib/trading/polymarket/types'

interface UsePredictionsOptions {
  assistantId: string
  orgId: string
  enabled?: boolean
  pollInterval?: number
}

interface UsePredictionsResult {
  positions: Position[]
  openOrders: OpenOrder[]
  loading: boolean
  error: string | null
  cancelOrder: (orderId: string) => Promise<void>
  cancellingOrderId: string | null
  searchMarkets: (query: string) => Promise<PredictionMarket[]>
  fetchOrderbook: (conditionId: string) => Promise<Orderbook | null>
  refetch: () => Promise<void>
  // Funding
  funding: FundingInfo | null
  fundingLoading: boolean
  fundingError: string | null
  fetchFunding: () => Promise<void>
  withdraw: (recipientAddress: string, amount: string) => Promise<WithdrawApiResponse>
}

export function usePredictions({
  assistantId,
  orgId,
  enabled = true,
  pollInterval = PREDICTIONS_POLL_INTERVAL,
}: UsePredictionsOptions): UsePredictionsResult {
  const [positions, setPositions] = useState<Position[]>([])
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null)
  const [funding, setFunding] = useState<FundingInfo | null>(null)
  const [fundingLoading, setFundingLoading] = useState(false)
  const [fundingError, setFundingError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/predictions?assistant_id=${encodeURIComponent(assistantId)}&org_id=${encodeURIComponent(orgId)}`,
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as PredictionsApiResponse
      if (!mountedRef.current) return

      setPositions(data.positions)
      setOpenOrders(data.openOrders)
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to fetch predictions')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [assistantId, orgId])

  // Initial fetch + polling
  useEffect(() => {
    mountedRef.current = true
    if (!enabled) return

    fetchData()
    const cleanup = setVisibleInterval(fetchData, pollInterval)

    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [fetchData, enabled, pollInterval])

  const cancelOrder = useCallback(async (orderId: string) => {
    setCancellingOrderId(orderId)
    try {
      const res = await fetch(
        `/api/predictions/${encodeURIComponent(assistantId)}/orders/${encodeURIComponent(orderId)}?org_id=${encodeURIComponent(orgId)}`,
        { method: 'DELETE' },
      )
      const data = (await res.json()) as CancelOrderResponse
      if (data.success) {
        setOpenOrders((prev) => prev.filter((o) => o.id !== orderId))
      }
    } finally {
      setCancellingOrderId(null)
    }
  }, [assistantId, orgId])

  const searchMarkets = useCallback(async (query: string): Promise<PredictionMarket[]> => {
    const res = await fetch(
      `/api/predictions/search?q=${encodeURIComponent(query)}&org_id=${encodeURIComponent(orgId)}`,
    )
    if (!res.ok) return []
    const data = (await res.json()) as MarketSearchResponse
    return data.markets
  }, [orgId])

  const fetchOrderbook = useCallback(async (conditionId: string): Promise<Orderbook | null> => {
    const res = await fetch(
      `/api/predictions/orderbook?condition_id=${encodeURIComponent(conditionId)}&assistant_id=${encodeURIComponent(assistantId)}&org_id=${encodeURIComponent(orgId)}`,
    )
    if (!res.ok) return null
    return (await res.json()) as Orderbook
  }, [assistantId, orgId])

  const fetchFunding = useCallback(async () => {
    setFundingLoading(true)
    setFundingError(null)
    try {
      const res = await fetch(
        `/api/predictions/funding?assistant_id=${encodeURIComponent(assistantId)}&org_id=${encodeURIComponent(orgId)}`,
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as FundingApiResponse
      if (mountedRef.current) setFunding(data.funding)
    } catch (err) {
      if (mountedRef.current) {
        setFundingError(err instanceof Error ? err.message : 'Failed to fetch funding info')
      }
    } finally {
      if (mountedRef.current) setFundingLoading(false)
    }
  }, [assistantId, orgId])

  const withdraw = useCallback(async (recipientAddress: string, amount: string): Promise<WithdrawApiResponse> => {
    const res = await fetch(
      `/api/predictions/funding?org_id=${encodeURIComponent(orgId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assistant_id: assistantId,
          recipient_address: recipientAddress,
          amount,
        }),
      },
    )
    return (await res.json()) as WithdrawApiResponse
  }, [assistantId, orgId])

  return {
    positions,
    openOrders,
    loading,
    error,
    cancelOrder,
    cancellingOrderId,
    searchMarkets,
    fetchOrderbook,
    refetch: fetchData,
    // Funding
    funding,
    fundingLoading,
    fundingError,
    fetchFunding,
    withdraw,
  }
}
