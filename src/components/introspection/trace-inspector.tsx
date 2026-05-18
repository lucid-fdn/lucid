'use client'

/**
 * TraceInspector — Click-to-expand trace panel.
 *
 * Chrome DevTools for agents. Shows input args, output preview,
 * duration, token counts, and a "Copy as JSON" button.
 */

import { useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DetailRow, JsonBlock, TokensSummary } from './trace-detail'
import type { StreamNode } from '@/hooks/use-introspection-stream'

interface TraceInspectorProps {
  node: StreamNode
  onClose?: () => void
  className?: string
}

export function TraceInspector({ node, onClose, className }: TraceInspectorProps) {
  const [copied, setCopied] = useState(false)

  const copyAsJson = useCallback(() => {
    void navigator.clipboard.writeText(JSON.stringify(node, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [node])

  return (
    <div
      className={cn(
        'border border-border rounded-md bg-muted/80 p-3 space-y-3',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-xs font-medium">{node.kind}</span>
          {node.durationMs != null && (
            <span className="text-muted-foreground bg-muted px-1.5 py-0.5 rounded text-[10px]">
              {node.durationMs}ms
            </span>
          )}
        </div>
        <button
          onClick={copyAsJson}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy JSON
            </>
          )}
        </button>
      </div>

      {/* Common fields */}
      <DetailRow label="Run ID" value={<span className="font-mono text-[10px]">{node.runId}</span>} />
      <DetailRow label="Time" value={new Date(node.createdAt).toLocaleTimeString()} />
      <DetailRow label="Status" value={
        <span className={cn(
          'px-1.5 py-0.5 rounded text-[10px] font-medium',
          node.status === 'error' ? 'bg-red-500/10 text-red-400' :
          node.status === 'complete' ? 'bg-emerald-500/10 text-emerald-400' :
          'bg-blue-500/10 text-blue-400',
        )}>
          {node.status}
        </span>
      } />

      {/* Tool-specific details */}
      {(node.kind === 'tool_start' || node.kind === 'tool_result' || node.kind === 'tool_error') && (
        <>
          <DetailRow label="Tool" value={
            <span className="font-mono text-[11px]">{String(node.data.tool_name ?? '')}</span>
          } />
          {node.data.args_preview && (
            <JsonBlock label="Input" data={node.data.args_preview} />
          )}
          {node.data.output_preview && (
            <JsonBlock label="Output" data={node.data.output_preview} />
          )}
          {node.data.error && (
            <div className="text-xs text-red-400 bg-red-500/[0.05] border border-red-500/10 rounded p-2 break-all">
              {String(node.data.error)}
            </div>
          )}
        </>
      )}

      {/* LLM details */}
      {(node.kind === 'llm_end') && (
        <>
          <DetailRow label="Model" value={String(node.data.model ?? '')} />
          <TokensSummary
            inputTokens={node.data.input_tokens as number}
            outputTokens={node.data.output_tokens as number}
          />
        </>
      )}

      {/* Run summary */}
      {node.kind === 'run_end' && (
        <>
          <TokensSummary
            inputTokens={undefined}
            outputTokens={node.data.total_tokens as number}
          />
          {node.data.tool_count != null && (
            <DetailRow label="Tool calls" value={String(node.data.tool_count)} />
          )}
        </>
      )}

      {/* Routing details */}
      {node.kind === 'routing_decision' && (
        <>
          <DetailRow label="Lane" value={String(node.data.lane ?? '')} />
          <DetailRow label="Model" value={String(node.data.model_used ?? '')} />
          {node.data.reason && (
            <DetailRow label="Reason" value={String(node.data.reason)} />
          )}
        </>
      )}

      {/* Context details */}
      {node.kind === 'context_loaded' && (
        <>
          <DetailRow label="Messages" value={String(node.data.message_count ?? 0)} />
          <DetailRow label="Memories" value={String(node.data.memory_count ?? 0)} />
        </>
      )}

      {/* Raw data fallback */}
      {Object.keys(node.data).length > 0 && (
        <details className="text-[10px]">
          <summary className="text-muted-foreground cursor-pointer hover:text-muted-foreground">
            Raw event data
          </summary>
          <pre className="mt-1 text-muted-foreground bg-muted/50 rounded p-2 overflow-auto max-h-[150px] whitespace-pre-wrap font-mono">
            {JSON.stringify(node.data, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}
