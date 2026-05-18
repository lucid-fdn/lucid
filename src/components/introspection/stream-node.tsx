'use client'

/**
 * StreamNode — Each node is a moment of consciousness.
 *
 * Renders a single introspection event by kind with rich visualizations.
 * Nodes are classified into 3 layers:
 *   - thought: LLM calls, routing decisions, context loading (amber/violet — cognitive)
 *   - action:  tool calls, approvals (blue/red — executable)
 *   - impact:  run lifecycle, memory, cost (emerald/zinc — outcomes)
 */

import { cn } from '@/lib/utils'
import {
  Play, Square, Route, Database,
  CheckCircle2, Brain,
  Shield, ShieldCheck, ShieldX,
  GitBranch, GitMerge, Zap,
} from 'lucide-react'
import { ToolProgress } from './visualizations/tool-progress'
import { MemoryBubble } from './visualizations/memory-bubble'
import { DecisionFork } from './visualizations/decision-fork'
import { CostTicker } from './visualizations/cost-ticker'
import type { StreamNode as StreamNodeType } from '@/hooks/use-introspection-stream'

interface StreamNodeProps {
  node: StreamNodeType
  onExpand?: (node: StreamNodeType) => void
  /** 0 = newest (crisp), higher = older (fades) */
  ageIndex?: number
}

// Layer classification — drives visual weight
type NodeLayer = 'thought' | 'action' | 'impact'

const NODE_LAYER: Record<string, NodeLayer> = {
  llm_start: 'thought',
  llm_end: 'thought',
  routing_decision: 'thought',
  context_loaded: 'thought',
  tool_start: 'action',
  tool_result: 'action',
  tool_error: 'action',
  tool_cache_hit: 'action',
  approval_wait: 'action',
  approval_resolved: 'action',
  run_start: 'impact',
  run_end: 'impact',
  cost_update: 'impact',
  memory_load: 'impact',
  memory_extract: 'impact',
  subagent_spawn: 'action',
  subagent_complete: 'impact',
}

// High-attention events get a left-border glow
const ATTENTION_KINDS = new Set(['tool_error', 'approval_wait', 'approval_resolved'])

function formatDuration(ms?: number): string {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTokens(n?: unknown): string {
  if (typeof n !== 'number') return ''
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}K`
}

function DurationBadge({ ms }: { ms?: number }) {
  if (!ms) return null
  return (
    <span className="text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded text-[10px]">
      {formatDuration(ms)}
    </span>
  )
}

function RelativeTime({ iso }: { iso: string }) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 5000) return <span className="text-muted-foreground/60 text-[10px]">now</span>
  if (diff < 60000) return <span className="text-muted-foreground/60 text-[10px]">{Math.round(diff / 1000)}s ago</span>
  return <span className="text-muted-foreground/60 text-[10px]">{Math.round(diff / 60000)}m ago</span>
}

// ─── Run lifecycle ─────────────────────────────────────────────

function RunStartNode({ node }: { node: StreamNodeType }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Play className="h-3 w-3 text-emerald-400" />
      <span className="text-foreground font-medium">Run started</span>
      <span className="text-muted-foreground">{String(node.data.model ?? '')}</span>
      <RelativeTime iso={node.createdAt} />
    </div>
  )
}

function RunEndNode({ node }: { node: StreamNodeType }) {
  const tokens = (node.data.total_tokens as number) ?? 0
  const cost = node.data.cost_usd as number | undefined
  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <Square className="h-3 w-3 text-muted-foreground" />
      <span className="text-muted-foreground">Run completed</span>
      <DurationBadge ms={node.durationMs} />
      {tokens > 0 && <span className="text-muted-foreground text-[10px]">{formatTokens(tokens)} tokens</span>}
      {node.data.tool_count != null && (
        <span className="text-muted-foreground text-[10px]">{String(node.data.tool_count)} tools</span>
      )}
      {cost != null && cost > 0 && (
        <span className="text-muted-foreground text-[10px]">${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(3)}</span>
      )}
    </div>
  )
}

// ─── Context + routing ─────────────────────────────────────────

function ContextLoadedNode({ node }: { node: StreamNodeType }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Database className="h-3 w-3 text-blue-400" />
      <span className="text-muted-foreground">
        {String(node.data.message_count ?? 0)} msgs, {String(node.data.memory_count ?? 0)} memories
      </span>
      {node.data.prompt_tokens != null && (
        <span className="text-muted-foreground/60 text-[10px]">{formatTokens(node.data.prompt_tokens)} prompt</span>
      )}
    </div>
  )
}

function RoutingDecisionNode({ node }: { node: StreamNodeType }) {
  const lane = String(node.data.lane ?? 'unknown')
  return (
    <div className="flex items-center gap-2 text-xs">
      <Route className="h-3 w-3 text-violet-400" />
      <span className="text-foreground">Route</span>
      <DecisionFork lane={lane} />
      <span className="text-muted-foreground text-[10px]">{String(node.data.model_used ?? '')}</span>
    </div>
  )
}

// ─── LLM calls ─────────────────────────────────────────────────

function LlmNode({ node }: { node: StreamNodeType }) {
  const isEnd = node.kind === 'llm_end'
  return (
    <div className="flex items-center gap-2 text-xs">
      <Brain className={cn('h-3 w-3', isEnd ? 'text-emerald-400' : 'text-amber-400')} />
      <span className="text-muted-foreground">{isEnd ? 'LLM done' : 'Thinking...'}</span>
      {isEnd && <DurationBadge ms={node.durationMs} />}
      {isEnd && node.data.input_tokens != null && (
        <span className="text-muted-foreground/60 text-[10px]">{formatTokens(node.data.input_tokens)} in</span>
      )}
      {isEnd && node.data.output_tokens != null && (
        <span className="text-muted-foreground/60 text-[10px]">{formatTokens(node.data.output_tokens)} out</span>
      )}
    </div>
  )
}

// ─── Tool calls ────────────────────────────────────────────────

function ToolStartNode({ node }: { node: StreamNodeType }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <ToolProgress status="active" />
      <span className="text-blue-300 font-mono text-[11px]">{String(node.data.tool_name ?? 'tool')}</span>
    </div>
  )
}

function ToolCacheHitNode({ node }: { node: StreamNodeType }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Zap className="h-3 w-3 text-amber-400" />
      <span className="text-foreground font-mono text-[11px]">{String(node.data.tool_name ?? 'tool')}</span>
      <span className="text-amber-400/60 text-[10px] bg-amber-500/5 px-1 py-0.5 rounded">cached</span>
    </div>
  )
}

function ToolResultNode({ node }: { node: StreamNodeType }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <ToolProgress status="complete" />
      <span className="text-foreground font-mono text-[11px]">{String(node.data.tool_name ?? 'tool')}</span>
      <DurationBadge ms={node.durationMs} />
      <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
    </div>
  )
}

function ToolErrorNode({ node }: { node: StreamNodeType }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <ToolProgress status="error" />
      <span className="text-red-300 font-mono text-[11px]">{String(node.data.tool_name ?? 'tool')}</span>
      <DurationBadge ms={node.durationMs} />
      <span className="text-red-400 text-[10px] truncate max-w-[200px]">
        {String(node.data.error ?? 'failed')}
      </span>
    </div>
  )
}

// ─── Approvals ─────────────────────────────────────────────────

function ApprovalWaitNode({ node }: { node: StreamNodeType }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Shield className="h-3 w-3 text-amber-400" />
      <span className="text-amber-300">Awaiting approval</span>
      <span className="text-muted-foreground font-mono text-[11px]">{String(node.data.tool_name ?? '')}</span>
    </div>
  )
}

function ApprovalResolvedNode({ node }: { node: StreamNodeType }) {
  const approved = node.data.action === 'approved'
  return (
    <div className="flex items-center gap-2 text-xs">
      {approved
        ? <ShieldCheck className="h-3 w-3 text-emerald-400" />
        : <ShieldX className="h-3 w-3 text-red-400" />}
      <span className={approved ? 'text-emerald-300' : 'text-red-300'}>
        {approved ? 'Approved' : 'Denied'}
      </span>
      <span className="text-muted-foreground font-mono text-[11px]">{String(node.data.tool_name ?? '')}</span>
    </div>
  )
}

// ─── Cost ──────────────────────────────────────────────────────

function CostUpdateNode({ node }: { node: StreamNodeType }) {
  return (
    <CostTicker
      costUsd={(node.data.cost_usd as number) ?? 0}
      totalTokens={node.data.total_tokens as number | undefined}
    />
  )
}

// ─── Memory ────────────────────────────────────────────────────

function MemoryLoadNode({ node }: { node: StreamNodeType }) {
  return (
    <MemoryBubble
      kind="memory_load"
      count={node.data.memory_count as number | undefined}
      preview={node.data.top_memory as string | undefined}
    />
  )
}

function MemoryExtractNode({ node }: { node: StreamNodeType }) {
  return (
    <MemoryBubble
      kind="memory_extract"
      count={node.data.facts_count as number | undefined}
      preview={node.data.preview as string | undefined}
    />
  )
}

// ─── Subagents ─────────────────────────────────────────────────

function SubagentSpawnNode({ node }: { node: StreamNodeType }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <GitBranch className="h-3 w-3 text-violet-400" />
      <span className="text-violet-300">Spawned subagent</span>
      {node.data.model != null && <span className="text-muted-foreground text-[10px]">{String(node.data.model)}</span>}
    </div>
  )
}

function SubagentCompleteNode({ node }: { node: StreamNodeType }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <GitMerge className="h-3 w-3 text-violet-400" />
      <span className="text-muted-foreground">Subagent complete</span>
      <DurationBadge ms={node.durationMs} />
    </div>
  )
}

// ─── Registry ──────────────────────────────────────────────────

const NODE_RENDERERS: Record<string, React.FC<{ node: StreamNodeType }>> = {
  run_start: RunStartNode,
  run_end: RunEndNode,
  context_loaded: ContextLoadedNode,
  routing_decision: RoutingDecisionNode,
  llm_start: LlmNode,
  llm_end: LlmNode,
  tool_start: ToolStartNode,
  tool_cache_hit: ToolCacheHitNode,
  tool_result: ToolResultNode,
  tool_error: ToolErrorNode,
  approval_wait: ApprovalWaitNode,
  approval_resolved: ApprovalResolvedNode,
  cost_update: CostUpdateNode,
  memory_load: MemoryLoadNode,
  memory_extract: MemoryExtractNode,
  subagent_spawn: SubagentSpawnNode,
  subagent_complete: SubagentCompleteNode,
}

export function StreamNode({ node, onExpand, ageIndex = 0 }: StreamNodeProps) {
  const Renderer = NODE_RENDERERS[node.kind]
  if (!Renderer) return null

  const layer = NODE_LAYER[node.kind] ?? 'impact'
  const isAttention = ATTENTION_KINDS.has(node.kind)
  const isError = node.status === 'error' || node.kind === 'tool_error'
  const isApproval = node.kind === 'approval_wait'

  // Density gradient: newer nodes are crisp, older ones fade
  // ageIndex 0 = newest (opacity 1), each step fades by ~15%
  const opacityStyle = ageIndex > 0
    ? { opacity: Math.max(0.25, 1 - ageIndex * 0.14) }
    : undefined

  // Layer-based left border accent
  const layerBorder = {
    thought: 'border-l-violet-500/30',
    action: 'border-l-blue-500/30',
    impact: 'border-l-transparent',
  }[layer]

  return (
    <div
      className={cn(
        'py-1.5 pl-3 pr-2 cursor-pointer',
        'border-l-2 border-r border-r-transparent border-b border-b-transparent border-t border-t-transparent',
        'hover:border-r-border hover:bg-muted/30 transition-colors duration-150 rounded-r-sm',
        layerBorder,
        // Attention glow
        isError && 'border-l-red-500/50 bg-red-500/[0.03]',
        isApproval && 'border-l-amber-500/60 bg-amber-500/[0.03]',
        node.kind === 'approval_resolved' && node.data.action === 'approved' && 'border-l-emerald-500/40',
        node.kind === 'approval_resolved' && node.data.action !== 'approved' && 'border-l-red-500/40',
      )}
      style={opacityStyle}
      onClick={() => onExpand?.(node)}
    >
      <Renderer node={node} />
    </div>
  )
}
