'use client'

const CHAIN_CONFIG: Record<string, { label: string; color: string; logo: string | null }> = {
  base: {
    label: 'Base',
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    logo: null, // inline SVG below
  },
  eth: {
    label: 'Ethereum',
    color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    logo: '/logos/icon/ethereum.svg',
  },
  solana: {
    label: 'Solana',
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    logo: '/logos/icon/solana.svg',
  },
  bsc: {
    label: 'BSC',
    color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    logo: null,
  },
  poly: {
    label: 'Polygon',
    color: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    logo: null,
  },
  monad: {
    label: 'Monad',
    color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    logo: null,
  },
}

// Inline SVG logos for chains without files in /public
function BaseLogo({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="12" fill="#0052FF" />
      <path d="M12 4.5a7.5 7.5 0 100 15 7.5 7.5 0 000-15zm0 12a4.5 4.5 0 110-9 4.5 4.5 0 010 9z" fill="white" />
    </svg>
  )
}

function BSCLogo({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="12" fill="#F3BA2F" />
      <path d="M12 5l2.5 2.5-4 4L8 9l4-4zm-4.5 4.5L10 12l-2.5 2.5L5 12l2.5-2.5zm9 0L19 12l-2.5 2.5L14 12l2.5-2.5zM12 14l2.5 2.5L12 19l-2.5-2.5L12 14z" fill="white" />
    </svg>
  )
}

function PolygonLogo({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="12" fill="#8247E5" />
      <path d="M15.5 9.5L12 7l-3.5 2.5v5L12 17l3.5-2.5v-5z" fill="white" />
    </svg>
  )
}

function MonadLogo({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="12" fill="#06B6D4" />
      <path d="M8 8h8v8H8z" fill="white" rx="2" />
    </svg>
  )
}

function ChainLogo({ chain, size = 12 }: { chain: string; size?: number }) {
  const config = CHAIN_CONFIG[chain]
  if (!config) return null

  if (config.logo) {
    return <img src={config.logo} alt={config.label} width={size} height={size} className="rounded-full" />
  }

  switch (chain) {
    case 'base': return <BaseLogo size={size} />
    case 'bsc': return <BSCLogo size={size} />
    case 'poly': return <PolygonLogo size={size} />
    case 'monad': return <MonadLogo size={size} />
    default: return null
  }
}

export function ChainBadge({ chain, showLabel = true }: { chain: string; showLabel?: boolean }) {
  const config = CHAIN_CONFIG[chain] ?? { label: chain, color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20', logo: null }
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border ${config.color}`}>
      <ChainLogo chain={chain} size={12} />
      {showLabel && config.label}
    </span>
  )
}

/** Just the logo, no badge wrapper */
export function ChainIcon({ chain, size = 14 }: { chain: string; size?: number }) {
  return <ChainLogo chain={chain} size={size} />
}
