'use client'

/**
 * HomeAmbientPresence — quiet "agents are alive" proof strip for the home hero.
 *
 * Self-contained. No runtime data. No network. Pure CSS heartbeat animation.
 * Renders a row of agent dots with names, status, and a slow pulse.
 */

import { motion, useReducedMotion } from 'motion/react'

const AGENTS = [
  { name: 'support-triage-01', role: 'tickets', state: 'thinking', hue: 142 },
  { name: 'billing-dunning', role: 'finance', state: 'active', hue: 142 },
  { name: 'onboarding-bot', role: 'signups', state: 'idle', hue: 200 },
  { name: 'refund-agent-v2', role: 'payments', state: 'thinking', hue: 38 },
  { name: 'alerts-oncall', role: 'ops', state: 'active', hue: 142 },
  { name: 'sales-inbox', role: 'crm', state: 'idle', hue: 200 },
]

const STATE_LABEL: Record<string, string> = {
  thinking: 'thinking',
  active: 'running',
  idle: 'listening',
}

export function HomeAmbientPresence() {
  const reduced = useReducedMotion()

  const running = AGENTS.filter((a) => a.state !== 'idle').length
  const idle = AGENTS.length - running

  return (
    <div className="py-2">
      <div className="mb-5 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-white/40">
          fleet · 60s window
        </span>
        <span className="font-mono text-[11px] tabular-nums text-white/40">
          {AGENTS.length} agents · {running} running · {idle} idle
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        {AGENTS.map((agent, i) => (
          <li
            key={agent.name}
            className="flex items-center gap-3"
          >
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background: `hsl(${agent.hue} 80% 60%)`,
                  opacity: agent.state === 'idle' ? 0.5 : 1,
                }}
              />
              {!reduced && agent.state !== 'idle' && (
                <motion.span
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `hsl(${agent.hue} 80% 60%)`,
                  }}
                  animate={{ scale: [1, 2.4, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.3,
                    ease: 'easeOut',
                  }}
                />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[13px] text-white/80">
                {agent.name}
              </div>
              <div className="truncate font-mono text-[10px] text-white/40">
                {agent.role} · {STATE_LABEL[agent.state]}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
