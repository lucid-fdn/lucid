'use client'

import Script from 'next/script'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  TELEGRAM_VOICE_OPTIONS,
  TELEGRAM_VOICE_STYLE_PRESETS,
  describeTelegramVoiceMode,
  type TelegramVoiceMode,
} from '@/lib/telegram/voice-settings'

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void
        expand: () => void
        close: () => void
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void
        }
        colorScheme?: 'light' | 'dark'
        initData?: string
      }
    }
  }
}

const QUICK_ACTIONS = [
  {
    title: 'Open Agent Picker',
    command: '/agents',
    tone: 'primary',
  },
  {
    title: 'Open Workspace Picker',
    command: '/workspace',
    tone: 'default',
  },
  {
    title: 'Voice Controls',
    command: '/voice',
    tone: 'default',
  },
] as const

interface MiniAppState {
  userId: string
  header: {
    name: string
    imageUrl: string | null
    isPersonal: boolean
  }
  activeAgent: {
    id: string
    name: string
    roleTitle: string
    essence: string
  } | null
  agents: Array<{
    id: string
    name: string
    roleTitle: string
    orgId: string | null
    isActive: boolean
  }>
  workspace: {
    org_id: string
    org_name: string
    agent_count: number
    is_current: boolean
  } | null
  workspaces: Array<{
    org_id: string
    org_name: string
    agent_count: number
    is_current: boolean
  }>
  workspaceCount: number
  agentCount: number
  voiceSettings: {
    mode: TelegramVoiceMode
    voiceId: string | null
    instructions: string | null
  } | null
}

async function dispatchMiniAppCommand(command: string) {
  const webApp = window.Telegram?.WebApp
  if (!webApp) return false
  webApp.HapticFeedback?.impactOccurred('light')
  const response = await fetch('/api/telegram/mini-app/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      command,
      initData: webApp.initData ?? '',
    }),
  })
  if (!response.ok) {
    webApp.HapticFeedback?.notificationOccurred('error')
    return false
  }
  webApp.HapticFeedback?.notificationOccurred('success')
  window.setTimeout(() => webApp.close(), 160)
  return true
}

export function TelegramMiniAppClient() {
  const [status, setStatus] = useState('Opening chat controls...')
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [pendingCommand, setPendingCommand] = useState<string | null>(null)
  const [state, setState] = useState<MiniAppState | null>(null)
  const [loadingState, setLoadingState] = useState(true)
  const [telegramVoiceMode, setTelegramVoiceMode] = useState<TelegramVoiceMode>('off')
  const [telegramVoiceId, setTelegramVoiceId] = useState('')
  const [telegramVoiceInstructions, setTelegramVoiceInstructions] = useState('')
  const [savingVoiceSettings, setSavingVoiceSettings] = useState(false)
  const [voiceSettingsStatus, setVoiceSettingsStatus] = useState<string | null>(null)
  const [switchingTarget, setSwitchingTarget] = useState<string | null>(null)

  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    webApp?.ready()
    webApp?.expand()
    setTheme(webApp?.colorScheme ?? 'dark')
  }, [])

  const loadState = useCallback(async () => {
    const webApp = window.Telegram?.WebApp
    if (!webApp?.initData) {
      setLoadingState(false)
      setStatus('Telegram session data is unavailable in this context.')
      return false
    }

    const response = await fetch('/api/telegram/mini-app/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: webApp.initData }),
    }).catch(() => null)

    if (!response?.ok) {
      setLoadingState(false)
      setStatus('Lucid could not load this room yet.')
      return false
    }

    const payload = (await response.json().catch(() => null)) as { state?: MiniAppState } | null
    setState(payload?.state ?? null)
    setTelegramVoiceMode(payload?.state?.voiceSettings?.mode ?? 'off')
    setTelegramVoiceId(payload?.state?.voiceSettings?.voiceId ?? '')
    setTelegramVoiceInstructions(payload?.state?.voiceSettings?.instructions ?? '')
    setLoadingState(false)
    setStatus('Switch agents or workspaces here, then jump back into chat.')
    return true
  }, [])

  useEffect(() => {
    void loadState()
  }, [loadState])

  const isDark = theme === 'dark'
  const shellClass = useMemo(
    () =>
      isDark
        ? 'min-h-screen bg-[#09111d] px-4 py-5 text-white'
        : 'min-h-screen bg-[#eef2f7] px-4 py-5 text-[#0b1320]',
    [isDark],
  )
  const cardClass = useMemo(
    () =>
      isDark
        ? 'rounded-[28px] border-white/10 bg-[#0f1725] text-white shadow-[0_18px_50px_rgba(0,0,0,0.35)]'
        : 'rounded-[28px] border-black/8 bg-white text-[#0b1320] shadow-[0_18px_50px_rgba(15,23,42,0.1)]',
    [isDark],
  )
  const subTextClass = isDark ? 'text-white/62' : 'text-[#334155]'
  const chromeTextClass = isDark ? 'text-white/42' : 'text-[#64748b]'
  const buttonClass = (tone: 'default' | 'primary' | 'danger') =>
    ({
      default: isDark
        ? 'border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]'
        : 'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50',
      primary: isDark
        ? 'border border-[#223a66] bg-[#162746] text-white hover:bg-[#1b3157]'
        : 'border border-[#1f3a68] bg-[#1f3a68] text-white hover:bg-[#27497f]',
      danger: isDark
        ? 'border border-rose-400/25 bg-rose-500/12 text-rose-100 hover:bg-rose-500/18'
        : 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
    }[tone])

  const handleQuickAction = async (command: string) => {
    setPendingCommand(command)
    const ok = await dispatchMiniAppCommand(command)
    setPendingCommand(null)
    if (!ok) {
      setStatus('This Telegram session cannot send menu actions right now.')
      return
    }
    setStatus(`Sent ${command} to the chat.`)
  }

  const switchMiniAppTarget = useCallback(async (
    target:
      | { target: 'agent'; assistantId: string; name: string }
      | { target: 'workspace'; orgId: string; name: string },
  ) => {
    const webApp = window.Telegram?.WebApp
    const initData = webApp?.initData ?? ''
    if (!initData) {
      setStatus('Telegram session data is unavailable right now.')
      return
    }

    setSwitchingTarget(target.target === 'agent' ? `agent:${target.assistantId}` : `workspace:${target.orgId}`)
    setStatus(target.target === 'agent' ? `Switching to ${target.name}...` : `Switching to ${target.name}...`)

    const response = await fetch('/api/telegram/mini-app/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        target.target === 'agent'
          ? { initData, target: 'agent', assistantId: target.assistantId }
          : { initData, target: 'workspace', orgId: target.orgId },
      ),
    }).catch(() => null)

    setSwitchingTarget(null)

    if (!response?.ok) {
      const payload = (await response?.json().catch(() => null)) as { error?: string } | null
      webApp?.HapticFeedback?.notificationOccurred('error')
      setStatus(payload?.error ?? 'That switch did not go through.')
      return
    }

    webApp?.HapticFeedback?.notificationOccurred('success')
    await loadState()
    setStatus(
      target.target === 'agent'
        ? `${target.name} is now active in this chat.`
        : `${target.name} is now the active workspace for this chat.`,
    )
  }, [loadState])

  const saveVoiceSettings = useCallback(async (overrides?: {
    mode?: TelegramVoiceMode
    voiceId?: string
    instructions?: string
  }) => {
    const initData = window.Telegram?.WebApp?.initData ?? ''
    if (!initData) {
      setVoiceSettingsStatus('Telegram session data is unavailable right now.')
      return false
    }

    const nextMode = overrides?.mode ?? telegramVoiceMode
    const nextVoiceId = overrides?.voiceId ?? telegramVoiceId
    const nextInstructions = overrides?.instructions ?? telegramVoiceInstructions

    setSavingVoiceSettings(true)
    setVoiceSettingsStatus(null)

    const response = await fetch('/api/telegram/mini-app/voice-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData,
        mode: nextMode,
        voiceId: nextVoiceId || null,
        instructions: nextInstructions.trim() || null,
      }),
    }).catch(() => null)

    setSavingVoiceSettings(false)

    if (!response?.ok) {
      const payload = (await response?.json().catch(() => null)) as { error?: string } | null
      setVoiceSettingsStatus(payload?.error ?? 'Could not save voice settings.')
      return false
    }

    setState((current) =>
      current
        ? {
            ...current,
            voiceSettings: {
              mode: nextMode,
              voiceId: nextVoiceId || null,
              instructions: nextInstructions.trim() || null,
            },
          }
        : current,
    )
    setVoiceSettingsStatus('Voice settings saved for this room.')
    return true
  }, [telegramVoiceId, telegramVoiceInstructions, telegramVoiceMode])

  const handleSaveVoiceSettings = useCallback(async () => {
    await saveVoiceSettings()
  }, [saveVoiceSettings])

  const handleSelectVoiceMode = useCallback(async (mode: TelegramVoiceMode) => {
    setTelegramVoiceMode(mode)
    await saveVoiceSettings({ mode })
  }, [saveVoiceSettings])

  const handleSelectVoice = useCallback(async (voiceId: string) => {
    setTelegramVoiceId(voiceId)
    await saveVoiceSettings({ voiceId })
  }, [saveVoiceSettings])

  const handleSelectVoicePreset = useCallback(async (instructions: string) => {
    setTelegramVoiceInstructions(instructions)
    await saveVoiceSettings({ instructions })
  }, [saveVoiceSettings])

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
        onLoad={() => {
          const webApp = window.Telegram?.WebApp
          webApp?.ready()
          webApp?.expand()
          setTheme(webApp?.colorScheme ?? 'dark')
        }}
      />
      <main className={shellClass}>
        <div className="mx-auto flex max-w-sm flex-col gap-3">
          <Card className={cn(cardClass, 'overflow-hidden')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${isDark ? 'bg-white/[0.06]' : 'bg-slate-100'}`}>
                  {state?.header?.imageUrl ? (
                    <img
                      src={state.header.imageUrl}
                      alt={state.header.name}
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-xl object-cover"
                    />
                  ) : (
                    <img
                      src="/lucid_b_w.png"
                      alt="Lucid"
                      width={34}
                      height={34}
                      className="h-[34px] w-[34px] object-contain"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`truncate text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {state?.header?.name ?? state?.workspace?.org_name ?? 'Lucid'}
                  </div>
                  <div className={`mt-1 truncate text-xs ${chromeTextClass}`}>
                    {state?.activeAgent ? `${state.activeAgent.name} is active` : 'Telegram workspace'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <CardHeader className="px-4 pt-4 pb-0">
              <CardTitle className="text-sm">Linked Agents</CardTitle>
              <CardDescription className={cn('text-xs', chromeTextClass)}>
                Tap an agent to make it active in this chat.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
            <div className="mt-4 space-y-2">
              {(state?.agents ?? []).map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  disabled={switchingTarget !== null || agent.isActive}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${agent.isActive ? buttonClass('primary') : buttonClass('default')}`}
                  onClick={() => void switchMiniAppTarget({ target: 'agent', assistantId: agent.id, name: agent.name })}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{agent.name}</div>
                    <div className={`truncate text-xs ${chromeTextClass}`}>{agent.roleTitle}</div>
                  </div>
                  <div
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]',
                      agent.isActive
                        ? (isDark ? 'border-[#223a66] bg-[#162746] text-white' : 'border-[#bfd0ea] bg-[#d9e5f7] text-[#17345d]')
                        : (isDark ? 'border-white/10 bg-white/[0.06] text-white/45' : 'border-slate-200 bg-white text-slate-500'),
                    )}
                  >
                    {switchingTarget === `agent:${agent.id}` ? 'Switching' : agent.isActive ? 'Active' : 'Make Active'}
                  </div>
                </button>
              ))}
              {!loadingState && (state?.agents?.length ?? 0) === 0 ? (
                <div className={`rounded-2xl border px-4 py-3 text-sm ${isDark ? 'border-white/10 bg-white/[0.04] text-white/70' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                  No agents are linked to this room yet.
                </div>
              ) : null}
            </div>
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <CardHeader className="px-4 pt-4 pb-0">
              <CardTitle className="text-sm">Workspace Scope</CardTitle>
              <CardDescription className={cn('text-xs', chromeTextClass)}>
                Choose which workspace this Telegram chat is speaking for.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="mt-4 space-y-2">
                {(state?.workspaces ?? []).map((workspace) => (
                  <button
                    key={workspace.org_id}
                    type="button"
                    disabled={switchingTarget !== null || workspace.is_current}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${workspace.is_current ? buttonClass('primary') : buttonClass('default')}`}
                    onClick={() => void switchMiniAppTarget({ target: 'workspace', orgId: workspace.org_id, name: workspace.org_name })}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{workspace.org_name}</div>
                      <div className={`truncate text-xs ${chromeTextClass}`}>{workspace.agent_count} linked agent{workspace.agent_count === 1 ? '' : 's'}</div>
                    </div>
                    <div
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]',
                        workspace.is_current
                          ? (isDark ? 'border-[#223a66] bg-[#162746] text-white' : 'border-[#bfd0ea] bg-[#d9e5f7] text-[#17345d]')
                          : (isDark ? 'border-white/10 bg-white/[0.06] text-white/45' : 'border-slate-200 bg-white text-slate-500'),
                      )}
                    >
                      {switchingTarget === `workspace:${workspace.org_id}` ? 'Switching' : workspace.is_current ? 'Current' : 'Use Here'}
                    </div>
                  </button>
                ))}
                {!loadingState && (state?.workspaces?.length ?? 0) === 0 ? (
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${isDark ? 'border-white/10 bg-white/[0.04] text-white/70' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                    No workspaces are linked to this chat yet.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <CardHeader className="px-4 pt-4 pb-0">
              <CardTitle className="text-sm">Quick Controls</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.command}
                type="button"
                disabled={pendingCommand !== null}
                className={`rounded-2xl px-4 py-4 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${buttonClass(action.tone)}`}
                onClick={() => void handleQuickAction(action.command)}
              >
                <div>{action.title}</div>
                <div className={`mt-2 text-[11px] uppercase tracking-[0.16em] ${chromeTextClass}`}>{action.command}</div>
              </button>
            ))}
            </div>
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <CardHeader className="px-4 pt-4 pb-0">
              <CardTitle className="text-sm">Agent Voice</CardTitle>
              <CardDescription className={cn('text-xs', chromeTextClass)}>
                Room-specific overrides for the active Telegram agent.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="mt-4 space-y-4">
                <div>
                  <div className={`mb-2 text-[11px] uppercase tracking-[0.16em] ${chromeTextClass}`}>Replies</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['off', 'auto', 'always'] as TelegramVoiceMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`rounded-2xl px-3 py-3 text-sm font-medium transition ${telegramVoiceMode === mode ? buttonClass('primary') : buttonClass('default')}`}
                        onClick={() => void handleSelectVoiceMode(mode)}
                      >
                        {mode === 'off' ? 'Off' : mode === 'auto' ? 'Auto' : 'Always'}
                      </button>
                    ))}
                  </div>
                  <div className={`mt-2 text-xs ${chromeTextClass}`}>{describeTelegramVoiceMode(telegramVoiceMode)}</div>
                </div>

                <div>
                  <div className={`mb-2 text-[11px] uppercase tracking-[0.16em] ${chromeTextClass}`}>Voice</div>
                  <div className="grid grid-cols-2 gap-2">
                    {TELEGRAM_VOICE_OPTIONS.map((voice) => (
                      <button
                        key={voice.id}
                        type="button"
                        className={`rounded-2xl px-3 py-3 text-left text-sm font-medium transition ${telegramVoiceId === voice.id ? buttonClass('primary') : buttonClass('default')}`}
                        onClick={() => void handleSelectVoice(voice.id)}
                      >
                        <div>{voice.shortLabel}</div>
                        <div className={`mt-1 text-[11px] ${chromeTextClass}`}>{voice.label} · {voice.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className={`mb-2 text-[11px] uppercase tracking-[0.16em] ${chromeTextClass}`}>Style</div>
                  <div className="flex flex-wrap gap-2">
                    {TELEGRAM_VOICE_STYLE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`rounded-full px-3 py-2 text-xs font-medium transition ${telegramVoiceInstructions === preset.instructions ? buttonClass('primary') : buttonClass('default')}`}
                        onClick={() => void handleSelectVoicePreset(preset.instructions)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={`mb-2 block text-[11px] uppercase tracking-[0.16em] ${chromeTextClass}`}>
                    Custom style
                  </label>
                  <textarea
                    value={telegramVoiceInstructions}
                    onChange={(event) => setTelegramVoiceInstructions(event.target.value)}
                    rows={4}
                    className={cn(
                      'w-full rounded-2xl border px-3 py-3 text-sm outline-none transition',
                      isDark
                        ? 'border-white/10 bg-white/[0.04] text-white placeholder:text-white/35'
                        : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400',
                    )}
                    placeholder="Speak with calm confidence and a warm, expressive tone."
                  />
                </div>

                <button
                  type="button"
                  disabled={savingVoiceSettings || !state?.activeAgent}
                  className={`w-full rounded-2xl px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${buttonClass('primary')}`}
                  onClick={() => void handleSaveVoiceSettings()}
                >
                  {savingVoiceSettings ? 'Saving...' : 'Save Voice Settings'}
                </button>

                {voiceSettingsStatus ? (
                  <div className={`text-xs ${voiceSettingsStatus.includes('saved') ? subTextClass : 'text-rose-400'}`}>
                    {voiceSettingsStatus}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  )
}
