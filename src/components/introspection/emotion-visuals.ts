/**
 * Emotion Visuals — Maps emotion state to CSS classes.
 *
 * Single source of truth for the visual language of agent emotion.
 * Used by spine.tsx, stream-node.tsx, idle-view.tsx.
 */

import type { IntrospectionEmotion } from '@contracts/introspection'

export interface EmotionVisual {
  spine: string       // border classes for spine line
  dot: string         // BreathingDot color
  dotAnimate: boolean // whether dot breathes
  text: string        // text color for labels
  label: string       // human-readable state name
  gradient: string    // CSS radial gradient for ambient presence background
  pulseMs: number     // AgentPulse rhythm speed in ms
  streamBg?: string   // optional subtle background tint for active stream
}

export const EMOTION_VISUALS: Record<IntrospectionEmotion, EmotionVisual> = {
  idle: {
    spine: 'border-dashed border-border',
    dot: 'bg-amber-400/70',
    dotAnimate: true,
    text: 'text-muted-foreground',
    label: 'Idle',
    gradient: 'radial-gradient(ellipse at center, rgba(232,184,109,0.06) 0%, transparent 70%)',
    pulseMs: 3000,
  },
  confident: {
    spine: 'border-solid border-emerald-500/60',
    dot: 'bg-emerald-400',
    dotAnimate: false,
    text: 'text-foreground',
    label: 'Active',
    gradient: 'radial-gradient(ellipse at center, rgba(52,211,153,0.06) 0%, transparent 70%)',
    pulseMs: 1500,
    streamBg: 'rgba(52,211,153,0.015)',
  },
  cautious: {
    spine: 'border-solid border-amber-500/60',
    dot: 'bg-amber-400',
    dotAnimate: true,
    text: 'text-amber-300',
    label: 'Awaiting approval',
    gradient: 'radial-gradient(ellipse at center, rgba(245,158,11,0.06) 0%, transparent 70%)',
    pulseMs: 2000,
    streamBg: 'rgba(245,158,11,0.015)',
  },
  strained: {
    spine: 'border-solid border-red-500/50',
    dot: 'bg-red-400',
    dotAnimate: true,
    text: 'text-red-400',
    label: 'Errors detected',
    gradient: 'radial-gradient(ellipse at center, rgba(239,68,68,0.06) 0%, transparent 70%)',
    pulseMs: 600,
    streamBg: 'rgba(239,68,68,0.02)',
  },
  learning: {
    spine: 'border-solid border-blue-500/50',
    dot: 'bg-blue-400',
    dotAnimate: true,
    text: 'text-blue-300',
    label: 'Learning',
    gradient: 'radial-gradient(ellipse at center, rgba(59,130,246,0.06) 0%, transparent 70%)',
    pulseMs: 1800,
    streamBg: 'rgba(59,130,246,0.015)',
  },
}
