"use client"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  CheckCircle,
  ChevronDown,
  Loader2,
  XCircle,
} from "lucide-react"
import { useState } from "react"
import { LogoIcon } from "@/components/ui/logo-icon"

export type ToolPart = {
  type: string
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error"
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  toolCallId?: string
  errorText?: string
}

export type ToolProps = {
  toolPart: ToolPart
  defaultOpen?: boolean
  className?: string
}

/* ── Human-friendly tool name + verb mapping ─────────────── */

const TOOL_LABELS: Record<string, { label: string; verb: string }> = {
  // Web3 Read
  get_price: { label: 'Get Price', verb: 'Fetching price' },
  search_token: { label: 'Search Token', verb: 'Searching tokens' },
  get_portfolio: { label: 'Portfolio', verb: 'Loading portfolio' },
  wallet_balance: { label: 'Wallet Balance', verb: 'Checking balance' },
  wallet_history: { label: 'Transaction History', verb: 'Loading history' },
  dex_get_quote: { label: 'Swap Quote', verb: 'Getting quote' },
  get_quote_0x: { label: 'Swap Quote', verb: 'Getting quote' },
  // Web3 Reason
  risk_check: { label: 'Risk Analysis', verb: 'Analyzing risk' },
  portfolio_snapshot: { label: 'Portfolio Snapshot', verb: 'Taking snapshot' },
  get_pnl: { label: 'P&L Report', verb: 'Calculating P&L' },
  // Web3 Action
  dex_swap: { label: 'Swap', verb: 'Executing swap' },
  wallet_transfer: { label: 'Transfer', verb: 'Sending tokens' },
  limit_order: { label: 'Limit Order', verb: 'Placing limit order' },
  dca_create: { label: 'DCA Order', verb: 'Setting up DCA' },
  stop_loss: { label: 'Stop Loss', verb: 'Setting stop loss' },
  bridge: { label: 'Bridge', verb: 'Bridging tokens' },
  // Hyperliquid
  hl_place_order: { label: 'Place Order', verb: 'Placing order' },
  hl_cancel_order: { label: 'Cancel Order', verb: 'Cancelling order' },
  hl_account_info: { label: 'Account Info', verb: 'Loading account' },
  // Data Intelligence
  get_token_info: { label: 'Token Info', verb: 'Getting token info' },
  get_trending: { label: 'Trending', verb: 'Checking trending' },
  get_liquidity: { label: 'Liquidity', verb: 'Checking liquidity' },
  get_holders: { label: 'Holders', verb: 'Analyzing holders' },
  get_defi_positions: { label: 'DeFi Positions', verb: 'Loading positions' },
  get_wallet_profile: { label: 'Wallet Profile', verb: 'Analyzing wallet' },
  get_market_data: { label: 'Market Data', verb: 'Loading market data' },
  detect_snipers: { label: 'Sniper Detection', verb: 'Detecting snipers' },
  // Platform
  get_trading_policy: { label: 'Trading Policy', verb: 'Checking policy' },
  generate_content: { label: 'Generate Content', verb: 'Generating content' },
  code_interpreter: { label: 'Run Code', verb: 'Running code' },
  // Native (OpenClaw)
  web_search: { label: 'Web Search', verb: 'Searching the web' },
  web_fetch: { label: 'Read Page', verb: 'Reading page' },
  // Agent primitives
  spawn_subagent: { label: 'Spawn Agent', verb: 'Spawning agent' },
  sessions_spawn: { label: 'Spawn Agent', verb: 'Spawning agent' },
  send_message_to_agent: { label: 'Message Agent', verb: 'Sending message' },
  sessions_send: { label: 'Message Agent', verb: 'Sending message' },
  schedule_task: { label: 'Schedule Task', verb: 'Scheduling task' },
  cron_schedule: { label: 'Schedule Task', verb: 'Scheduling task' },
  cron_list: { label: 'List Tasks', verb: 'Listing tasks' },
  cron_cancel: { label: 'Cancel Task', verb: 'Cancelling task' },
  // Mission Control Copilot
  getFleetOverview: { label: 'Fleet Overview', verb: 'Loading fleet data' },
  getAgentDetail: { label: 'Agent Detail', verb: 'Loading agent detail' },
  getRecentEvents: { label: 'Recent Events', verb: 'Loading events' },
  getPendingApprovalsList: { label: 'Pending Approvals', verb: 'Loading approvals' },
  searchDocs: { label: 'Documentation', verb: 'Searching docs' },
}

function getToolLabel(toolName: string): string {
  if (TOOL_LABELS[toolName]) return TOOL_LABELS[toolName].label
  // Integration tools: "slack__send_message" → "Slack: Send Message"
  if (toolName.includes('__')) {
    const [provider, action] = toolName.split('__', 2)
    const providerLabel = provider.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const actionLabel = action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return `${providerLabel}: ${actionLabel}`
  }
  return toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function getToolVerb(toolName: string): string {
  return TOOL_LABELS[toolName]?.verb ?? 'Processing'
}

function getToolLogoMeta(toolName: string): {
  slug: string
  category?: string
  alwaysOn?: boolean
  section?: 'core' | 'connected' | 'installed'
} {
  if (toolName.includes('__')) {
    const [provider] = toolName.split('__', 1)
    return {
      slug: provider,
      category: 'communication',
      section: 'connected',
    }
  }

  const platformCategories: Record<string, string> = {
    web_search: 'web',
    web_fetch: 'web',
    code_interpreter: 'general',
    generate_content: 'media',
    spawn_subagent: 'general',
    sessions_spawn: 'general',
    send_message_to_agent: 'communication',
    sessions_send: 'communication',
    schedule_task: 'general',
    cron_schedule: 'general',
    cron_list: 'general',
    cron_cancel: 'general',
    getFleetOverview: 'general',
    getAgentDetail: 'general',
    getRecentEvents: 'general',
    getPendingApprovalsList: 'general',
    searchDocs: 'web',
  }

  if (platformCategories[toolName]) {
    return {
      slug: `platform-${toolName}`,
      category: platformCategories[toolName],
      alwaysOn: true,
      section: 'core',
    }
  }

  const tradingTools = new Set([
    'get_price',
    'search_token',
    'get_portfolio',
    'wallet_balance',
    'wallet_history',
    'dex_get_quote',
    'get_quote_0x',
    'risk_check',
    'portfolio_snapshot',
    'get_pnl',
    'dex_swap',
    'wallet_transfer',
    'limit_order',
    'dca_create',
    'stop_loss',
    'bridge',
    'hl_place_order',
    'hl_cancel_order',
    'hl_account_info',
    'get_token_info',
    'get_trending',
    'get_liquidity',
    'get_holders',
    'get_defi_positions',
    'get_wallet_profile',
    'get_market_data',
    'detect_snipers',
    'get_trading_policy',
  ])

  if (tradingTools.has(toolName)) {
    return {
      slug: `platform-${toolName}`,
      category: 'trading',
      alwaysOn: true,
      section: 'core',
    }
  }

  return {
    slug: toolName,
    category: 'general',
    alwaysOn: true,
    section: 'core',
  }
}

/** Extract a brief summary from tool output for inline display */
function getOutputSummary(toolName: string, output?: Record<string, unknown>): string | null {
  if (!output) return null

  // If output has a single string value at top level, use a truncated version
  const keys = Object.keys(output)
  if (keys.length === 1) {
    const val = output[keys[0]]
    if (typeof val === 'string' && val.length < 120) return val
  }

  // If output has 'result' or 'content' key
  for (const key of ['result', 'content', 'message', 'text']) {
    if (typeof output[key] === 'string') {
      const str = output[key] as string
      return str.length > 100 ? str.slice(0, 100) + '...' : str
    }
  }

  // If output has 'error' key
  if (typeof output['error'] === 'string') {
    return `Error: ${output['error']}`
  }

  return null
}

const Tool = ({ toolPart, defaultOpen = false, className }: ToolProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const { state, input, output } = toolPart

  const isLoading = state === 'input-streaming' || state === 'input-available'
  const isError = state === 'output-error'
  const isDone = state === 'output-available'
  const label = getToolLabel(toolPart.type)
  const summary = isDone ? getOutputSummary(toolPart.type, output) : null
  const logo = getToolLogoMeta(toolPart.type)

  const formatValue = (value: unknown): string => {
    if (value === null) return "null"
    if (value === undefined) return "undefined"
    if (typeof value === "string") return value
    if (typeof value === "object") return JSON.stringify(value, null, 2)
    return String(value)
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={cn("group/tool", className)}>
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50">
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <LogoIcon
            slug={logo.slug}
            category={logo.category}
            alwaysOn={logo.alwaysOn}
            section={logo.section}
            size={16}
          />
          {isLoading ? (
            <Loader2 className="absolute -right-1 -bottom-1 h-3 w-3 rounded-full bg-background p-[1px] text-muted-foreground animate-spin" />
          ) : isError ? (
            <XCircle className="absolute -right-1 -bottom-1 h-3 w-3 rounded-full bg-background text-red-500" />
          ) : isDone ? (
            <CheckCircle className="absolute -right-1 -bottom-1 h-3 w-3 rounded-full bg-background text-green-500" />
          ) : null}
        </span>

        {/* Label + summary */}
        <span className="min-w-0 flex-1 text-left">
          {isLoading ? (
            <span className="text-muted-foreground">{getToolVerb(toolPart.type)}...</span>
          ) : isError ? (
            <span className="text-red-500">
              {label} <span className="font-normal">failed</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{label}</span>
          )}
        </span>

        {/* Expand chevron — subtle */}
        {(isDone || isError) && (
          <ChevronDown className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform",
            isOpen && "rotate-180"
          )} />
        )}
      </CollapsibleTrigger>

      {/* Expandable details — power user view */}
      <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
        <div className="ml-8 space-y-2 pb-1 pt-1">
          {/* Brief summary if available */}
          {summary && (
            <p className="text-xs text-muted-foreground">{summary}</p>
          )}

          {input && Object.keys(input).length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Input</p>
              <div className="max-h-32 overflow-auto rounded border bg-muted/30 p-2 font-mono text-xs">
                {Object.entries(input).map(([key, value]) => (
                  <div key={key} className="mb-0.5">
                    <span className="text-muted-foreground">{key}:</span>{" "}
                    <span>{formatValue(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {output && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Output</p>
              <div className="max-h-40 overflow-auto rounded border bg-muted/30 p-2 font-mono text-xs">
                <pre className="whitespace-pre-wrap">{formatValue(output)}</pre>
              </div>
            </div>
          )}

          {isError && toolPart.errorText && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
              {toolPart.errorText}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export { Tool, getToolLabel, getToolVerb }
