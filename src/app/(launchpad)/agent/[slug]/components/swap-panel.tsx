'use client'

import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { USDC_MINT, JUPITER_SWAP_BASE } from '@/lib/launchpad/constants'

// ---------------------------------------------------------------------------
// Jupiter Terminal integration for token swaps
// ---------------------------------------------------------------------------

interface SwapPanelProps {
  tokenMint: string | null
  tokenSymbol: string
  currentPrice: number
}

type SwapSide = 'buy' | 'sell'

export function SwapPanel({ tokenMint, tokenSymbol, currentPrice }: SwapPanelProps) {
  const { publicKey, connected } = useWallet()
  const { setVisible } = useWalletModal()
  const [side, setSide] = useState<SwapSide>('buy')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(1) // 1%

  const amountNum = Number(amount) || 0
  const estimatedTokens = side === 'buy' && currentPrice > 0 ? amountNum / currentPrice : amountNum
  const estimatedUsd = side === 'sell' ? amountNum * currentPrice : amountNum

  const handleSwap = () => {
    if (!tokenMint) return

    const inputMint = side === 'buy' ? USDC_MINT : tokenMint
    const outputMint = side === 'buy' ? tokenMint : USDC_MINT

    const jupUrl = `${JUPITER_SWAP_BASE}/${inputMint}-${outputMint}${amountNum > 0 ? `?amount=${amountNum}` : ''}`
    window.open(jupUrl, '_blank', 'noopener,noreferrer')
  }

  if (!tokenMint) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          Trade
        </h3>
        <div className="mt-4 flex flex-col items-center py-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03]">
            <svg className="h-6 w-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <p className="text-sm text-slate-500">Token not yet minted</p>
          <p className="mt-1 text-xs text-slate-600">Trading will be available after token launch</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
        <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
        Trade {tokenSymbol}
      </h3>

      {/* Buy/Sell toggle */}
      <div className="mt-4 flex rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
        <button
          onClick={() => setSide('buy')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-all ${
            side === 'buy'
              ? 'bg-emerald-500/20 text-emerald-400 shadow-sm shadow-emerald-500/20'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setSide('sell')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-all ${
            side === 'sell'
              ? 'bg-red-500/20 text-red-400 shadow-sm shadow-red-500/20'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Sell
        </button>
      </div>

      {/* Amount input */}
      <div className="mt-4">
        <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-400">
          <span>{side === 'buy' ? 'You pay (USDC)' : `You sell (${tokenSymbol})`}</span>
          {connected && publicKey && (
            <button
              onClick={() => setAmount('max')}
              className="text-[10px] uppercase tracking-wider text-cyan-400/60 transition-colors hover:text-cyan-400"
            >
              Max
            </button>
          )}
        </label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="any"
            className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2.5 pr-16 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500">
            {side === 'buy' ? 'USDC' : tokenSymbol}
          </span>
        </div>
      </div>

      {/* Arrow */}
      <div className="my-3 flex justify-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03]">
          <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
          </svg>
        </div>
      </div>

      {/* Estimated output */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-400">
          {side === 'buy' ? `You receive (${tokenSymbol})` : 'You receive (USDC)'}
        </label>
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm text-white/60">
          {amountNum > 0 ? (
            <span className="tabular-nums">
              ~{side === 'buy' ? estimatedTokens.toLocaleString(undefined, { maximumFractionDigits: 2 }) : `$${estimatedUsd.toFixed(2)}`}
            </span>
          ) : (
            <span className="text-slate-600">0.00</span>
          )}
        </div>
      </div>

      {/* Slippage */}
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-slate-400">Slippage Tolerance</label>
        <div className="flex gap-1.5">
          {[0.5, 1, 2, 5].map((s) => (
            <button
              key={s}
              onClick={() => setSlippage(s)}
              className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-all ${
                slippage === s
                  ? 'border border-cyan-500/50 bg-cyan-500/15 text-cyan-400'
                  : 'border border-white/[0.08] bg-white/[0.03] text-slate-500 hover:text-slate-300'
              }`}
            >
              {s}%
            </button>
          ))}
        </div>
      </div>

      {/* Price info */}
      {currentPrice > 0 && (
        <div className="mt-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Price</span>
            <span className="tabular-nums text-slate-300">${currentPrice < 0.01 ? currentPrice.toFixed(6) : currentPrice.toFixed(4)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-slate-500">Slippage</span>
            <span className="text-slate-300">{slippage}%</span>
          </div>
        </div>
      )}

      {/* CTA button */}
      {!connected ? (
        <button
          onClick={() => setVisible(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-400 transition-all hover:bg-cyan-500/20"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3" />
          </svg>
          Connect Wallet
        </button>
      ) : (
        <button
          onClick={handleSwap}
          disabled={amountNum <= 0}
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            side === 'buy'
              ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:brightness-110'
              : 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg shadow-red-500/20 hover:shadow-red-500/30 hover:brightness-110'
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          {side === 'buy' ? `Buy ${tokenSymbol}` : `Sell ${tokenSymbol}`}
          {amountNum > 0 && ` — via Jupiter`}
        </button>
      )}

      {/* Jupiter attribution */}
      <p className="mt-2 text-center text-[10px] text-slate-600">
        Powered by Jupiter Aggregator
      </p>
    </div>
  )
}
