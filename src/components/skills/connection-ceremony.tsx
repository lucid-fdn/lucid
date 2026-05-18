'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { Check, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LogoIcon } from '@/components/ui/logo-icon'
import { TypingText } from '@/ui/components/typing-text'

// ─── Types ───────────────────────────────────────────────────────────

export type CeremonyPhase = 'authorizing' | 'connecting' | 'ready' | 'failed'

export interface ConnectionCeremonyProps {
  /** OAuth provider id (e.g. 'slack', 'google', 'notion') */
  provider: string
  /** Display name for the provider */
  providerName: string
  /** Skill branding metadata for real integration logos */
  slug?: string
  category?: string
  alwaysOn?: boolean
  section?: string
  /** Current phase of the connection flow */
  phase: CeremonyPhase
  /** Optional explicit error detail for interrupted or provider-specific failures */
  failureMessage?: string | null
  /** Called when user cancels the flow */
  onCancel: () => void
  /** Called when user retries after failure */
  onRetry?: () => void
  /** Auto-dismiss delay in ms after 'ready' phase (default 2000) */
  readyDismissMs?: number
  /** Called when ready phase auto-dismisses */
  onDismiss?: () => void
}

// ─── Storytelling Messages ───────────────────────────────────────────

const PROVIDER_MESSAGES: Record<string, { authorizing: string[]; connecting: string[] }> = {
  slack: {
    authorizing: [
      'Opening Slack authorization...',
      'Waiting for workspace approval...',
      'Select your Slack workspace and channels...',
      'Take your time — we\'ll be here...',
    ],
    connecting: [
      'Authorization received...',
      'Handshaking with Slack API...',
      'Syncing workspace metadata...',
      'Registering webhook endpoints...',
      'Verifying channel access...',
      'Almost ready...',
    ],
  },
  google: {
    authorizing: [
      'Opening Google sign-in...',
      'Waiting for account selection...',
      'Review the requested permissions...',
      'Take your time — we\'ll be here...',
    ],
    connecting: [
      'Authorization received...',
      'Connecting to Google services...',
      'Verifying access scopes...',
      'Syncing calendar metadata...',
      'Indexing available resources...',
      'Finalizing connection...',
    ],
  },
  notion: {
    authorizing: [
      'Opening Notion authorization...',
      'Select the pages to share...',
      'Choose your workspace access level...',
      'Take your time — we\'ll be here...',
    ],
    connecting: [
      'Authorization received...',
      'Connecting to your workspace...',
      'Mapping database schemas...',
      'Indexing shared pages...',
      'Registering sync hooks...',
      'Connection secured...',
    ],
  },
}

const DEFAULT_MESSAGES = {
  authorizing: [
    'Opening authorization...',
    'Waiting for approval...',
    'Complete the sign-in in the popup...',
    'Take your time — we\'ll be here...',
  ],
  connecting: [
    'Authorization received...',
    'Establishing secure connection...',
    'Verifying access permissions...',
    'Syncing account metadata...',
    'Finalizing setup...',
  ],
}

const PROVIDER_AUTH_HINTS: Record<string, string> = {
  linear: 'If you need to create a Linear account or workspace first, finish signup in the popup and then complete the final authorization step.',
  calendly: 'If Calendly asks you to create an account first, finish signup in the popup and then complete the final authorization step.',
  github: 'If GitHub asks you to sign in or create an account, finish that flow in the popup and then approve the OAuth request.',
  notion: 'If you need to pick a workspace or create one first, finish that flow in the popup and then return to the authorization step.',
}

const DEFAULT_AUTH_HINT =
  'If the provider asks you to create an account first, finish signup in the popup and then complete the final authorization step.'

// ─── Provider Icons (inline SVG — no external deps) ──────────────────

function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  const size = 32
  const shared = cn('flex-shrink-0', className)

  switch (provider) {
    case 'slack':
      return (
        <svg className={shared} width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
          <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
          <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.271 0a2.528 2.528 0 0 1-2.52 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.52 2.522v6.312z" fill="#2EB67D"/>
          <path d="M15.165 18.956a2.528 2.528 0 0 1 2.52 2.522A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.522v-2.522h2.52zm0-1.271a2.528 2.528 0 0 1-2.521-2.52 2.528 2.528 0 0 1 2.521-2.521h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.52h-6.313z" fill="#ECB22E"/>
        </svg>
      )
    case 'notion':
      return (
        <svg className={shared} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" opacity={0.9}>
          <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.29 2.14c-.42-.326-.98-.7-2.055-.607L3.41 2.604c-.466.046-.56.28-.374.466l1.423 1.138zm.793 2.89v13.9c0 .746.373 1.026 1.214.98l14.523-.84c.84-.046.933-.56.933-1.166V6.144c0-.606-.233-.933-.746-.886l-15.177.886c-.56.047-.747.327-.747.933zm14.337.42c.093.42 0 .84-.42.886l-.7.14v10.264c-.606.327-1.166.514-1.633.514-.746 0-.933-.234-1.493-.933l-4.571-7.177v6.944l1.446.327s0 .84-1.166.84l-3.22.187c-.093-.186 0-.653.327-.746l.84-.233V8.604L7.36 8.464c-.094-.42.14-1.026.793-1.073l3.453-.233 4.757 7.27V8.278l-1.213-.14c-.093-.513.28-.886.746-.933l3.453-.187z"/>
        </svg>
      )
    case 'google':
      return (
        <svg className={shared} width={size} height={size} viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      )
    default:
      return (
        <div className={cn('flex items-center justify-center rounded-full bg-primary/10', shared)} style={{ width: size, height: size }}>
          <span className="text-sm font-bold text-primary">{provider.charAt(0).toUpperCase()}</span>
        </div>
      )
  }
}

// ─── Phase Progress Dots ─────────────────────────────────────────────

function PhaseDots({ phase }: { phase: CeremonyPhase }) {
  const phases: CeremonyPhase[] = ['authorizing', 'connecting', 'ready']
  const currentIdx = phases.indexOf(phase)

  return (
    <div className="flex items-center gap-2">
      {phases.map((p, i) => (
        <div key={p} className="flex items-center gap-2">
          <div
            className={cn(
              'h-1.5 rounded-full transition-all duration-500',
              i < currentIdx
                ? 'w-6 bg-emerald-500'
                : i === currentIdx
                  ? 'w-8 bg-primary animate-pulse'
                  : 'w-4 bg-muted-foreground/20',
            )}
          />
        </div>
      ))}
    </div>
  )
}

// ─── Pulsing Ring (around provider icon) ─────────────────────────────

function PulsingRing({ phase }: { phase: CeremonyPhase }) {
  if (phase === 'ready') {
    return (
      <div className="absolute inset-0 rounded-2xl">
        <div className="absolute inset-0 rounded-2xl ring-2 ring-emerald-500/60 animate-[ping_1s_ease-out_1]" />
      </div>
    )
  }
  if (phase === 'failed') return null

  return (
    <div className="absolute inset-0 rounded-2xl">
      <div className="absolute inset-0 rounded-2xl ring-1 ring-primary/20 animate-pulse" />
      <div className="absolute inset-[-3px] rounded-[18px] ring-1 ring-primary/10 animate-pulse" style={{ animationDelay: '0.5s' }} />
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────

const FADE_DURATION_MS = 240

export function ConnectionCeremony({
  provider,
  providerName,
  slug,
  category,
  alwaysOn,
  section,
  phase,
  failureMessage,
  onCancel,
  onRetry,
  readyDismissMs = 2000,
  onDismiss,
}: ConnectionCeremonyProps) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  // Fade in on mount
  useEffect(() => {
    setMounted(true)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true))
    })
  }, [])

  // Auto-dismiss on ready
  useEffect(() => {
    if (phase !== 'ready') return
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismissRef.current?.(), FADE_DURATION_MS)
    }, readyDismissMs)
    return () => clearTimeout(timer)
  }, [phase, readyDismissMs])

  const handleCancel = useCallback(() => {
    setVisible(false)
    setTimeout(() => onCancelRef.current(), FADE_DURATION_MS)
  }, [])

  const providerMessages = PROVIDER_MESSAGES[provider] || DEFAULT_MESSAGES
  const messages = phase === 'connecting'
    ? providerMessages.connecting
    : providerMessages.authorizing
  const authorizingHint = PROVIDER_AUTH_HINTS[provider] || DEFAULT_AUTH_HINT

  if (!mounted) return null

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-[52] flex items-center justify-center transition-all duration-[240ms]',
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )}
    >
      {/* Scrim */}
      <div className="absolute inset-0 pointer-events-auto bg-black/80 backdrop-blur-sm" onClick={handleCancel} />

      {/* Card */}
      <div
        className={cn(
          'relative z-[53] pointer-events-auto w-[380px] rounded-2xl border bg-background/95 backdrop-blur-md shadow-2xl transition-all duration-[240ms]',
          visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4',
          phase === 'ready' && 'border-emerald-500/40 shadow-[0_0_40px_rgba(16,185,129,0.15)]',
          phase === 'failed' && 'border-destructive/40',
          phase !== 'ready' && phase !== 'failed' && 'border-border',
        )}
      >
        <div className="p-6 space-y-5">
          {/* Provider Icon */}
          <div className="flex justify-center">
            <div className="relative p-4">
              <PulsingRing phase={phase} />
              <div className={cn(
                'relative rounded-2xl p-3 transition-colors duration-500',
                phase === 'ready' ? 'bg-emerald-500/10' : phase === 'failed' ? 'bg-destructive/10' : 'bg-muted',
              )}>
                {phase === 'ready' ? (
                  <div className="flex items-center justify-center" style={{ width: 32, height: 32 }}>
                    <Check className="h-6 w-6 text-emerald-500" strokeWidth={3} />
                  </div>
                ) : phase === 'failed' ? (
                  <div className="flex items-center justify-center" style={{ width: 32, height: 32 }}>
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                  </div>
                ) : (
                  slug ? (
                    <LogoIcon
                      slug={slug}
                      category={category}
                      alwaysOn={alwaysOn}
                      section={section}
                      size={32}
                    />
                  ) : (
                    <ProviderIcon provider={provider} />
                  )
                )}
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="text-center space-y-1">
            <h3 className="text-sm font-semibold">
              {phase === 'ready' && `${providerName} connected`}
              {phase === 'failed' && 'Connection failed'}
              {phase === 'authorizing' && `Authorizing ${providerName}`}
              {phase === 'connecting' && `Connecting ${providerName}`}
            </h3>
            {phase === 'authorizing' && (
              <p className="text-xs text-muted-foreground">
                Complete the provider flow in the popup
              </p>
            )}
            {phase === 'connecting' && (
              <p className="text-xs text-muted-foreground">
                Finalizing the connection
              </p>
            )}
          </div>

          {/* Storytelling */}
          {(phase === 'authorizing' || phase === 'connecting') && (
            <div className="flex justify-center min-h-[24px]">
              <TypingText
                messages={messages}
                intervalMs={2500}
                className="text-[11px] text-muted-foreground"
              />
            </div>
          )}

          {/* Ready message */}
          {phase === 'ready' && (
            <p className="text-center text-xs text-emerald-500/80">
              Your agent can now use {providerName} tools
            </p>
          )}

          {phase === 'authorizing' && (
            <p className="text-center text-xs text-muted-foreground">
              {authorizingHint}
            </p>
          )}

          {/* Failed message */}
          {phase === 'failed' && (
            <p className="text-center text-xs text-muted-foreground">
              {failureMessage || 'The connection could not be established. The popup may have been closed before authorization completed.'}
            </p>
          )}

          {/* Progress dots */}
          {phase !== 'failed' && (
            <div className="flex justify-center">
              <PhaseDots phase={phase} />
            </div>
          )}

          {/* Phase label */}
          {(phase === 'authorizing' || phase === 'connecting') && (
            <div className="flex items-center justify-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[9px] text-muted-foreground/60 font-mono uppercase tracking-wider">
                {phase === 'authorizing' ? 'waiting for provider' : 'establishing connection'}
              </span>
            </div>
          )}

          {/* Actions */}
          {phase === 'failed' && (
            <div className="flex items-center justify-center gap-3 pt-1">
              {onRetry && (
                <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onRetry}>
                  <RefreshCw className="h-3 w-3" />
                  Try again
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          )}

          {/* Cancel link (always visible during active phases) */}
          {(phase === 'authorizing' || phase === 'connecting') && (
            <div className="flex justify-center">
              <button
                onClick={handleCancel}
                className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
