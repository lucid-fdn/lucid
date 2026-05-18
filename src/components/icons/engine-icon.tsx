'use client'

import Image from 'next/image'
import type { AgentEngine } from '@/lib/engines/types'
import { cn } from '@/lib/utils'

export type { AgentEngine } from '@/lib/engines/types'

interface EngineConfig {
  label: string
  abbr: string
  bg: string
  text: string
}

const ENGINE_CONFIG: Record<AgentEngine, EngineConfig> = {
  openclaw: {
    label: 'OpenClaw',
    abbr: 'OC',
    bg: 'bg-orange-500/15',
    text: 'text-orange-400',
  },
  langchain: {
    label: 'LangChain',
    abbr: 'LC',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
  },
  crewai: {
    label: 'CrewAI',
    abbr: 'CA',
    bg: 'bg-blue-500/15',
    text: 'text-blue-400',
  },
  hermes: {
    label: 'Hermes',
    abbr: 'H',
    bg: 'bg-purple-500/15',
    text: 'text-purple-400',
  },
  autogen: {
    label: 'AutoGen',
    abbr: 'AG',
    bg: 'bg-sky-500/15',
    text: 'text-sky-400',
  },
  smolagents: {
    label: 'Smolagents',
    abbr: 'SA',
    bg: 'bg-yellow-500/15',
    text: 'text-yellow-400',
  },
  lucid: {
    label: 'Lucid',
    abbr: 'L',
    bg: 'bg-white/10',
    text: 'text-white',
  },
}

/** Engines that have a real logo asset in /public */
const ENGINE_LOGO: Partial<Record<AgentEngine, string>> = {
  openclaw: '/logos/openclaw.svg',
  hermes: '/logos/nous.jpeg',
  lucid: '/lucid_w.png',
}

export function engineHasLogo(engine?: string | null): boolean {
  return !!ENGINE_LOGO[engine as AgentEngine]
}

const SIZE_CLASSES: Record<number, { wrapper: string; text: string }> = {
  9: { wrapper: 'w-[14px] h-[14px] rounded-[2px]', text: 'text-[6px] leading-none' },
  16: { wrapper: 'w-4 h-4 rounded-[3px]', text: 'text-[7px] leading-none' },
  20: { wrapper: 'w-5 h-5 rounded-[4px]', text: 'text-[8px] leading-none' },
  24: { wrapper: 'w-6 h-6 rounded-[4px]', text: 'text-[9px] leading-none' },
  32: { wrapper: 'w-8 h-8 rounded-[5px]', text: 'text-[11px] leading-none' },
}

export function EngineIcon({
  engine = 'openclaw',
  size = 20,
  className,
}: {
  engine?: AgentEngine | string
  size?: number
  className?: string
}) {
  const cfg = ENGINE_CONFIG[engine as AgentEngine] ?? ENGINE_CONFIG.openclaw
  const sizeCfg = SIZE_CLASSES[size] ?? SIZE_CLASSES[20]
  const logoSrc = ENGINE_LOGO[engine as AgentEngine]

  if (logoSrc) {
    return (
      <Image
        src={logoSrc}
        alt={cfg.label}
        width={size}
        height={size}
        className={cn('shrink-0 select-none w-full h-full rounded-lg', className)}
        title={cfg.label}
      />
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-mono font-bold select-none shrink-0',
        cfg.bg,
        cfg.text,
        sizeCfg.wrapper,
        className,
      )}
      title={cfg.label}
    >
      <span className={sizeCfg.text}>{cfg.abbr}</span>
    </span>
  )
}

export function getEngineLabel(engine?: string | null): string {
  if (!engine) return 'OpenClaw'
  return ENGINE_CONFIG[engine as AgentEngine]?.label ?? engine
}
