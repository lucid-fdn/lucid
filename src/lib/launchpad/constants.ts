/**
 * Launchpad Shared Constants
 *
 * Category colors, status configs, and other shared constants
 * used across launchpad pages. Single source of truth.
 */

// ---------------------------------------------------------------------------
// Agent Categories
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'trading', label: 'Trading' },
  { key: 'research', label: 'Research' },
  { key: 'creative', label: 'Creative' },
  { key: 'data', label: 'Data' },
  { key: 'social', label: 'Social' },
  { key: 'defi', label: 'DeFi' },
  { key: 'gaming', label: 'Gaming' },
] as const

export type AgentCategory = (typeof CATEGORIES)[number]['key']

// ---------------------------------------------------------------------------
// Category Colors (Tailwind classes)
// ---------------------------------------------------------------------------

export const CATEGORY_COLORS: Record<string, {
  badge: string
  bg: string
  text: string
  border: string
  accent: string
  glow: string
}> = {
  trading: {
    badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    accent: 'from-cyan-500/20 via-blue-600/10',
    glow: 'shadow-cyan-500/40',
  },
  research: {
    badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    bg: 'bg-blue-500/15',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    accent: 'from-violet-500/20 via-purple-600/10',
    glow: 'shadow-violet-500/40',
  },
  creative: {
    badge: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    bg: 'bg-purple-500/15',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    accent: 'from-pink-500/20 via-rose-600/10',
    glow: 'shadow-pink-500/40',
  },
  data: {
    badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    accent: 'from-amber-500/20 via-orange-600/10',
    glow: 'shadow-amber-500/40',
  },
  social: {
    badge: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    bg: 'bg-pink-500/15',
    text: 'text-pink-400',
    border: 'border-pink-500/30',
    accent: 'from-sky-500/20 via-indigo-600/10',
    glow: 'shadow-sky-500/40',
  },
  defi: {
    badge: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    bg: 'bg-cyan-500/15',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    accent: 'from-emerald-500/20 via-green-600/10',
    glow: 'shadow-emerald-500/40',
  },
  gaming: {
    badge: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    bg: 'bg-orange-500/15',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    accent: 'from-fuchsia-500/20 via-purple-600/10',
    glow: 'shadow-fuchsia-500/40',
  },
  general: {
    badge: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    bg: 'bg-slate-500/15',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    accent: 'from-cyan-500/20 via-teal-600/10',
    glow: 'shadow-cyan-500/40',
  },
  other: {
    badge: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    bg: 'bg-slate-500/15',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    accent: 'from-slate-500/20 via-gray-600/10',
    glow: 'shadow-slate-500/40',
  },
}

export function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.general
}

// ---------------------------------------------------------------------------
// Agent Status Config
// ---------------------------------------------------------------------------

export const STATUS_CONFIG: Record<string, {
  label: string
  dot: string
  bg: string
  text: string
}> = {
  draft: { label: 'Draft', dot: 'bg-gray-400', bg: 'bg-gray-500/10 border-gray-500/20', text: 'text-gray-400' },
  launching: { label: 'Launching', dot: 'bg-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', text: 'text-yellow-400' },
  trading: { label: 'Trading', dot: 'bg-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400' },
  sunset: { label: 'Sunset', dot: 'bg-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', text: 'text-orange-400' },
  archived: { label: 'Archived', dot: 'bg-red-400', bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-400' },
}

// ---------------------------------------------------------------------------
// Sort Options
// ---------------------------------------------------------------------------

export const SORT_OPTIONS = [
  { key: 'revenue', label: 'Top Revenue' },
  { key: 'holders', label: 'Most Holders' },
  { key: 'newest', label: 'Newest' },
  { key: 'price', label: 'Highest Price' },
  { key: 'requests', label: 'Most Requests' },
] as const

export type SortKey = (typeof SORT_OPTIONS)[number]['key']

// ---------------------------------------------------------------------------
// Solana Constants
// ---------------------------------------------------------------------------

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
export const JUPITER_SWAP_BASE = 'https://jup.ag/swap'
export const JUPITER_PRICE_API = 'https://api.jup.ag/price/v3'
export const SOLSCAN_TOKEN_BASE = 'https://solscan.io/token'
export const SOLSCAN_TX_BASE = 'https://solscan.io/tx'
