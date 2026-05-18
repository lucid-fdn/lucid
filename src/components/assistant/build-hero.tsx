'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { Activity, MessageSquare, Pause, Play } from 'lucide-react'
import { AgentPulse, EMOTION_COLORS } from '@/components/introspection/hero/agent-pulse'
import type { IntrospectionEmotion } from '@contracts/introspection'
import type { FeedEvent } from '@/lib/mission-control/types'
import { getChannelUiStats } from '@/lib/channels/types'
import type { AgentChannel as AssistantChannel } from '@/types/agent'

function darkenHex(hex: string, factor: number): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor)
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor)
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function useEmotionTheme(emotion: IntrospectionEmotion, isActive: boolean, isLight: boolean) {
  const hex = EMOTION_COLORS[emotion]
  const dotColor = isLight ? darkenHex(isActive ? '#34d399' : hex, 0.55) : undefined
  return {
    stateDot: isActive && !isLight ? 'bg-emerald-400 animate-pulse' : 'animate-pulse',
    stateDotStyle: isActive && !isLight ? undefined : { backgroundColor: dotColor ?? hex },
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

interface BuildHeroProps {
  name: string
  /** One-line mission / purpose (from system prompt or soul) */
  mission?: string
  emotion?: IntrospectionEmotion
  channels?: AssistantChannel[]
  lastEvent?: FeedEvent | null
  onNameChange?: (name: string) => void
  onConnectChannel?: () => void
  onOpenChat?: () => void
  onOpenActivity?: () => void
  hasChannels?: boolean
  hasRuntime?: boolean
  isActive?: boolean
  /** Whether the agent is in Live mode (responding to channels) */
  isLive?: boolean
  /** Toggle Live/Standby mode */
  onToggleLive?: (live: boolean) => void
}


export function BuildHero({
  name,
  mission,
  emotion = 'idle',
  channels = [],
  lastEvent,
  onNameChange,
  onConnectChannel,
  onOpenChat,
  onOpenActivity,
  hasChannels = false,
  hasRuntime = false,
  isActive = false,
  isLive = true,
  onToggleLive,
}: BuildHeroProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isLight = mounted && resolvedTheme === 'light'

  const channelCount = getChannelUiStats(channels).connected

  const theme = useEmotionTheme(emotion, isActive, isLight)
  const dotHex = EMOTION_COLORS[emotion]

  // Event tick — increments when a new event arrives, triggers dot reactive kick
  const eventTickRef = useRef(0)
  const lastEventIdRef = useRef<string | null>(null)
  if (lastEvent && lastEvent.id !== lastEventIdRef.current) {
    lastEventIdRef.current = lastEvent.id
    eventTickRef.current++
  }
  const eventTick = eventTickRef.current

  // Inline name editing
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(name) }, [name])

  const commitEdit = () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== name) onNameChange?.(trimmed)
    else setDraft(name)
  }

  const stateChips = [
    isLive ? 'Live' : 'Standby',
    channelCount > 0 ? `${channelCount} channel${channelCount > 1 ? 's' : ''}` : 'No channels',
    hasRuntime ? 'Dedicated runtime' : 'Shared Lucid Cloud',
  ]

  return (
    <div>
      {/* Hero: dot + identity as one unified object */}
      <div
        className="flex items-center gap-5 pt-10 pb-4 px-14 max-w-[860px] relative"
        style={{
          background: `radial-gradient(ellipse at 160px 50%, ${hexToRgba(dotHex, 0.03)} 0%, transparent 55%)`,
        }}
      >
        {/* Presence anchor */}
        <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${hexToRgba(dotHex, 0.06)} 0%, transparent 50%)`,
              transform: 'scale(2.2)',
            }}
          />
          <AgentPulse emotion={emotion} size="xl" eventTick={eventTick} />
        </div>

        {/* Identity stack */}
        <div className="flex-1 min-w-0">
          {/* Layer 1: name — editable on click */}
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                if (e.key === 'Escape') { setEditing(false); setDraft(name) }
              }}
              className="text-5xl font-bold tracking-tight text-foreground bg-transparent border-b border-border outline-none w-full mb-1.5 pb-0.5"
              autoFocus
              style={{ caretColor: dotHex }}
            />
          ) : (
            <h2
              className="text-5xl font-bold tracking-tight text-foreground mb-1.5 cursor-text hover:opacity-80 transition-opacity duration-120"
              onClick={() => { if (onNameChange) setEditing(true) }}
              title={onNameChange ? 'Click to rename' : undefined}
            >
              {name}
            </h2>
          )}

          {/* Layer 2: alive signal + mode switch */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${isLive ? theme.stateDot : 'bg-amber-400'}`}
                style={isLive ? theme.stateDotStyle : undefined}
              />
              <span className="text-sm font-medium text-foreground">
                {!isLive
                  ? 'Standby — connected but not responding'
                  : isActive
                    ? 'Live — processing messages'
                    : 'Live — waiting for messages'}
              </span>
            </div>
            {onToggleLive && (
              <button
                type="button"
                onClick={() => onToggleLive(!isLive)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all duration-120 ${
                  isLive
                    ? 'text-muted-foreground border-border hover:text-amber-400 hover:border-amber-800/50'
                    : 'text-emerald-400 border-emerald-800/50 hover:text-emerald-300 hover:border-emerald-700/50'
                }`}
                title={isLive ? 'Switch to standby' : 'Switch to live'}
              >
                {isLive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {isLive ? 'Standby' : 'Go live'}
              </button>
            )}
          </div>

          {/* Layer 2.5: mission — one sentence, only when meaningful */}
          {mission && (
            <p className="text-[13px] text-muted-foreground mb-2 max-w-md leading-relaxed line-clamp-2">
              {mission}
            </p>
          )}

          {/* Layer 3: metadata — faded, tertiary */}
          <p className="text-[11px] text-muted-foreground/50 mb-5">
            {stateChips.join(' · ')}
          </p>

          {/* Layer 4: controls */}
          <div className="flex items-center gap-3">
            {onOpenChat && (
              <button
                type="button"
                onClick={onOpenChat}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-120"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Chat
              </button>
            )}
            {onOpenActivity && (
              <button
                type="button"
                onClick={onOpenActivity}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium text-muted-foreground border border-border hover:text-foreground hover:border-primary/50 transition-all duration-120"
              >
                <Activity className="h-3.5 w-3.5" />
                Activity
              </button>
            )}
          </div>

          {/* Connect hint */}
          {!hasChannels && onConnectChannel && (
            <div className="mt-3">
              <button
                type="button"
                onClick={onConnectChannel}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors duration-120"
              >
                Connect a channel to start receiving messages
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
