'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

import {
  captureDesktopClipboard,
  getLucidDesktopApi,
  notifyDesktop,
  resolveDesktopDeepLink,
  workspaceSlugFromPathname,
} from '@/lib/native/desktop'

export function DesktopNativeBridge() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const desktop = getLucidDesktopApi()
    if (!desktop) return

    const routeDeepLink = (url: string | null) => {
      if (!url) return
      const resolved = resolveDesktopDeepLink(url, workspaceSlugFromPathname(pathname))
      if (resolved.ok) router.push(resolved.path)
    }

    void desktop.getLaunchDeepLink().then(routeDeepLink).catch(() => null)
    return desktop.onDeepLink(routeDeepLink)
  }, [pathname, router])

  useEffect(() => {
    const desktop = getLucidDesktopApi()
    if (!desktop) return

    const captureRequested = searchParams?.get('native_capture') === '1'
    const voiceRequested = searchParams?.get('native_voice') === '1'
    if (!captureRequested && !voiceRequested) return

    const requestKey = `lucid:native-action:${pathname}:${searchParams?.toString() ?? ''}`
    if (window.sessionStorage.getItem(requestKey)) return
    window.sessionStorage.setItem(requestKey, '1')

    if (captureRequested) {
      void captureAndShareClipboard()
    }

    if (voiceRequested) {
      void sendDesktopVoicePrompt()
    }
  }, [pathname, searchParams])

  return null
}

async function captureAndShareClipboard() {
  const captured = await captureDesktopClipboard()
  if (!captured.ok) {
    await notifyDesktop({
      title: 'Nothing captured',
      body: captured.error,
      urgency: 'normal',
    })
    return
  }

  const response = await fetch('/api/native/share', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: looksLikeUrl(captured.text) ? 'url' : 'text',
      intent: looksLikeUrl(captured.text) ? 'browser-qa' : 'investigate',
      content: captured.text,
      context: { source: 'desktop' },
    }),
  })

  if (!response.ok) {
    await notifyDesktop({
      title: 'Capture failed',
      body: 'Lucid could not turn the clipboard into a native action.',
      urgency: 'normal',
    })
    return
  }

  const result = await response.json() as { title?: string; deepLink?: string }
  await notifyDesktop({
    title: 'Captured to Lucid',
    body: result.title ?? 'Your clipboard is queued for an agent.',
    deepLink: result.deepLink,
    urgency: 'normal',
  })
}

async function sendDesktopVoicePrompt() {
  const response = await fetch('/api/native/voice/commands', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'typed-command',
      transcript: 'What needs me right now?',
      context: { source: 'desktop' },
    }),
  })

  if (!response.ok) {
    await notifyDesktop({
      title: 'Hold To Talk unavailable',
      body: 'Lucid could not reach the native voice command endpoint.',
      urgency: 'normal',
    })
    return
  }

  const result = await response.json() as { responseText?: string; requiresConfirmation?: boolean }
  await notifyDesktop({
    title: result.requiresConfirmation ? 'Review needed' : 'Lucid heard you',
    body: result.responseText ?? 'Command queued.',
    urgency: result.requiresConfirmation ? 'critical' : 'normal',
  })
}

function looksLikeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
