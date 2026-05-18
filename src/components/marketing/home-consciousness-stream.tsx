'use client'

/**
 * HomeConsciousnessStream — the "watch your agents think" reveal block.
 *
 * Self-contained Mission Control simulation. Cycles through a deterministic
 * scripted run so every visitor sees the same demo.
 *
 * No runtime data. No network. Respects prefers-reduced-motion.
 */

import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'

type StreamLine =
  | { kind: 'thought'; text: string }
  | { kind: 'tool'; name: string; args: string }
  | { kind: 'result'; text: string }
  | { kind: 'decision'; text: string }

const SCRIPT: StreamLine[] = [
  { kind: 'thought', text: 'ticket #38241 — payout failed, customer waiting' },
  { kind: 'tool', name: 'orders.get', args: 'id="38241"' },
  { kind: 'result', text: 'shipped · payout:failed · retries:2' },
  { kind: 'tool', name: 'payouts.list', args: 'order_id="38241"' },
  { kind: 'result', text: 'last_error: insufficient_funds' },
  { kind: 'decision', text: 'manual top-up needed. escalate finance.' },
  { kind: 'tool', name: 'slack.send', args: '#finance-alerts' },
  { kind: 'result', text: 'delivered · 42ms' },
  { kind: 'tool', name: 'tickets.reply', args: 'id=38241' },
  { kind: 'result', text: 'sent · status:pending_finance' },
  { kind: 'decision', text: 'done. handed off.' },
]

const KIND_LABEL: Record<StreamLine['kind'], string> = {
  thought: 'thought',
  tool: 'tool',
  result: 'result',
  decision: 'decision',
}

const KIND_COLOR: Record<StreamLine['kind'], string> = {
  thought: 'text-white/50',
  tool: 'text-sky-300/90',
  result: 'text-emerald-300/80',
  decision: 'text-amber-300/90',
}

function formatLine(line: StreamLine): string {
  switch (line.kind) {
    case 'thought':
      return line.text
    case 'tool':
      return `${line.name}(${line.args})`
    case 'result':
      return line.text
    case 'decision':
      return line.text
  }
}

export function HomeConsciousnessStream() {
  const [visibleCount, setVisibleCount] = useState(0)
  const [tokens, setTokens] = useState(0)
  const [costCents, setCostCents] = useState(0)
  const reduced = useReducedMotion()
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (reduced) {
      setVisibleCount(SCRIPT.length)
      setTokens(2480)
      setCostCents(7)
      return
    }

    let cancelled = false
    let timeout: ReturnType<typeof setTimeout> | null = null

    const tick = (i: number) => {
      if (cancelled) return
      if (i > SCRIPT.length) {
        timeout = setTimeout(() => {
          if (cancelled) return
          setVisibleCount(0)
          setTokens(0)
          setCostCents(0)
          tick(0)
        }, 4000)
        return
      }
      setVisibleCount(i)
      setTokens(Math.round(i * 210))
      setCostCents(Math.round(i * 0.6))
      timeout = setTimeout(() => tick(i + 1), 1100)
    }

    tick(1)
    return () => {
      cancelled = true
      if (timeout) clearTimeout(timeout)
    }
  }, [reduced])

  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.scrollTop = containerRef.current.scrollHeight
  }, [visibleCount])

  const visibleLines = SCRIPT.slice(0, visibleCount)
  const isRunning = visibleCount > 0 && visibleCount < SCRIPT.length

  const statusLabel =
    visibleCount === SCRIPT.length ? 'done' : isRunning ? 'running' : 'idle'
  const toolCount = visibleLines.filter((l) => l.kind === 'tool').length

  return (
    <div>
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-2 w-2">
            <span
              className={`absolute inset-0 rounded-full ${
                isRunning ? 'bg-emerald-400' : 'bg-white/30'
              }`}
            />
            {isRunning && !reduced && (
              <motion.span
                className="absolute inset-0 rounded-full bg-emerald-400"
                animate={{ scale: [1, 2.5, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-white/60">
            run #4182 · step {visibleCount.toString().padStart(2, '0')}/
            {SCRIPT.length}
          </span>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px] tabular-nums text-white/40">
          <span>{tokens.toLocaleString()} tok</span>
          <span>${(costCents / 100).toFixed(2)}</span>
          <span>{toolCount} tools</span>
          <span
            className={
              statusLabel === 'done'
                ? 'text-emerald-300/90'
                : statusLabel === 'running'
                  ? 'text-sky-300/90'
                  : 'text-white/50'
            }
          >
            {statusLabel}
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-[420px] overflow-hidden px-5 py-4"
        style={{
          maskImage:
            'linear-gradient(to bottom, transparent 0%, black 10%, black 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 0%, black 10%, black 100%)',
        }}
      >
        <ul className="space-y-2.5">
          {visibleLines.map((line, i) => (
            <motion.li
              key={`${visibleCount}-${i}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="flex gap-3 font-mono text-[12.5px] leading-relaxed"
            >
              <span className="w-14 shrink-0 text-[10px] uppercase tracking-wider text-white/30">
                {KIND_LABEL[line.kind]}
              </span>
              <span
                className={`min-w-0 flex-1 break-words ${KIND_COLOR[line.kind]}`}
              >
                {formatLine(line)}
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  )
}
