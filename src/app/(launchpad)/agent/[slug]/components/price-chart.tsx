'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { IChartApi, ISeriesApi, CandlestickData, HistogramData, Time } from 'lightweight-charts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OHLCDataPoint {
  time: string // ISO date or unix seconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type TimeRange = '1H' | '4H' | '1D' | '1W' | '1M' | 'ALL'

const TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: '1H', label: '1H' },
  { key: '4H', label: '4H' },
  { key: '1D', label: '1D' },
  { key: '1W', label: '1W' },
  { key: '1M', label: '1M' },
  { key: 'ALL', label: 'All' },
]

// ---------------------------------------------------------------------------
// Price Chart Component
// ---------------------------------------------------------------------------

export function PriceChart({
  slug,
  currentPrice,
  priceChange24h,
}: {
  slug: string
  currentPrice: number
  priceChange24h: number
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const [activeRange, setActiveRange] = useState<TimeRange>('1D')
  const [chartData, setChartData] = useState<OHLCDataPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [crosshairData, setCrosshairData] = useState<{
    price: number
    time: string
    change: number
  } | null>(null)

  // Fetch chart data
  const fetchData = useCallback(async (range: TimeRange) => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/launchpad/agents/${slug}/chart?range=${range}`)
      if (res.ok) {
        const data = await res.json()
        setChartData(data.candles ?? [])
      }
    } catch {
      // Silently fail — chart will show empty state
    } finally {
      setIsLoading(false)
    }
  }, [slug])

  useEffect(() => {
    fetchData(activeRange)
  }, [fetchData, activeRange])

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return

    let chart: IChartApi
    let candleSeries: ISeriesApi<'Candlestick'>
    let volumeSeries: ISeriesApi<'Histogram'>

    const init = async () => {
      const { createChart, CrosshairMode, ColorType } = await import('lightweight-charts')

      const container = chartContainerRef.current!

      chart = createChart(container, {
        width: container.clientWidth,
        height: 400,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: 'rgba(148, 163, 184, 0.8)',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: 'rgba(6, 182, 212, 0.3)',
            width: 1,
            style: 3,
            labelBackgroundColor: 'rgba(6, 182, 212, 0.9)',
          },
          horzLine: {
            color: 'rgba(6, 182, 212, 0.3)',
            width: 1,
            style: 3,
            labelBackgroundColor: 'rgba(6, 182, 212, 0.9)',
          },
        },
        rightPriceScale: {
          borderColor: 'rgba(255, 255, 255, 0.06)',
          scaleMargins: { top: 0.1, bottom: 0.25 },
        },
        timeScale: {
          borderColor: 'rgba(255, 255, 255, 0.06)',
          timeVisible: true,
          secondsVisible: false,
        },
        handleScale: { axisPressedMouseMove: true },
        handleScroll: { vertTouchDrag: false },
      })

      candleSeries = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      })

      volumeSeries = chart.addHistogramSeries({
        color: 'rgba(6, 182, 212, 0.15)',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      })
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      })

      // Crosshair move handler
      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.seriesData) {
          setCrosshairData(null)
          return
        }
        const candle = param.seriesData.get(candleSeries) as CandlestickData | undefined
        if (candle) {
          const timeStr = typeof param.time === 'object'
            ? `${(param.time as { year: number; month: number; day: number }).year}-${String((param.time as { year: number; month: number; day: number }).month).padStart(2, '0')}-${String((param.time as { year: number; month: number; day: number }).day).padStart(2, '0')}`
            : new Date(Number(param.time) * 1000).toLocaleDateString()
          setCrosshairData({
            price: candle.close as number,
            time: timeStr,
            change: ((candle.close as number) - (candle.open as number)) / (candle.open as number) * 100,
          })
        }
      })

      chartRef.current = chart
      candleSeriesRef.current = candleSeries
      volumeSeriesRef.current = volumeSeries

      // Resize observer
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          chart.applyOptions({ width: entry.contentRect.width })
        }
      })
      resizeObserver.observe(container)

      return () => {
        resizeObserver.disconnect()
        chart.remove()
      }
    }

    const cleanup = init()
    return () => { cleanup.then(fn => fn?.()) }
  }, [])

  // Update chart data when data changes
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || chartData.length === 0) return

    const candles: CandlestickData[] = chartData.map((d) => ({
      time: (new Date(d.time).getTime() / 1000) as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }))

    const volumes: HistogramData[] = chartData.map((d) => ({
      time: (new Date(d.time).getTime() / 1000) as Time,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
    }))

    candleSeriesRef.current.setData(candles)
    volumeSeriesRef.current.setData(volumes)
    chartRef.current?.timeScale().fitContent()
  }, [chartData])

  const displayPrice = crosshairData?.price ?? currentPrice
  const displayChange = crosshairData?.change ?? priceChange24h
  const isPositive = displayChange >= 0

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
      {/* Chart header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.04] px-5 py-3">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-white">
                ${displayPrice.toFixed(4)}
              </span>
              <span className={`text-sm font-semibold tabular-nums ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {isPositive ? '+' : ''}{displayChange.toFixed(2)}%
              </span>
            </div>
            {crosshairData && (
              <p className="text-xs text-slate-500">{crosshairData.time}</p>
            )}
          </div>
        </div>

        {/* Time range selector */}
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setActiveRange(r.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                activeRange === r.key
                  ? 'bg-cyan-500/20 text-cyan-400 shadow-sm shadow-cyan-500/10'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart container */}
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading chart...
            </div>
          </div>
        )}
        <div ref={chartContainerRef} className="h-[400px] w-full" />
      </div>
    </div>
  )
}
