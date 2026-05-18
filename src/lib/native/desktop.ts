'use client'

import {
  isLucidDeepLink,
  parseLucidDeepLink,
  resolveLucidDeepLinkToWebPath,
} from '@lucid/app-core'

export type NativeNotificationInput = {
  title: string
  body?: string
  deepLink?: string
  silent?: boolean
  urgency?: 'normal' | 'critical'
}

export type NativeNotificationResult =
  | {
      ok: true
    }
  | {
      ok: false
      error: string
    }

export type LucidDesktopApi = {
  version: string
  platform: 'darwin' | 'win32' | 'linux'
  appMode: 'production' | 'self-hosted' | 'development'
  openExternal(url: string): Promise<{ ok: true } | { ok: false; error: string }>
  notify(input: NativeNotificationInput): Promise<NativeNotificationResult>
  onDeepLink(callback: (url: string) => void): () => void
  getLaunchDeepLink(): Promise<string | null>
  setBadgeCount(count: number): Promise<void>
  clearBadge(): Promise<void>
}

declare global {
  interface Window {
    lucidDesktop?: LucidDesktopApi
  }
}

export type DesktopDeepLinkResolution =
  | {
      ok: true
      path: string
      source: string
    }
  | {
      ok: false
      source: string
      error: string
    }

export function getLucidDesktopApi(): LucidDesktopApi | null {
  if (typeof window === 'undefined') return null
  return window.lucidDesktop ?? null
}

export function isLucidDesktopRuntime(): boolean {
  return getLucidDesktopApi() !== null
}

export function resolveDesktopDeepLink(source: string, defaultWorkspaceSlug?: string | null): DesktopDeepLinkResolution {
  if (!isLucidDeepLink(source)) {
    return {
      ok: false,
      source,
      error: 'not-lucid-deep-link',
    }
  }

  const parsed = parseLucidDeepLink(source)
  if (!parsed.ok) {
    return {
      ok: false,
      source,
      error: parsed.error,
    }
  }

  const resolved = resolveLucidDeepLinkToWebPath(parsed.link, {
    defaultWorkspaceSlug,
  })
  if (!resolved.ok) {
    return {
      ok: false,
      source,
      error: resolved.error,
    }
  }

  return {
    ok: true,
    source,
    path: resolved.path,
  }
}

export function workspaceSlugFromPathname(pathname: string | null | undefined): string | null {
  const firstSegment = pathname?.split('/').filter(Boolean)[0]?.trim()
  if (!firstSegment) return null

  const reserved = new Set([
    'api',
    'assets',
    'blog',
    'company',
    'contact',
    'dashboard',
    'discover',
    'explore',
    'join',
    'login',
    'oauth',
    'onboarding',
    'pricing',
    'privacy',
    'settings',
    'status',
    'styleguide',
    'telegram',
    'test',
  ])

  return reserved.has(firstSegment) ? null : firstSegment
}

export async function notifyDesktop(input: NativeNotificationInput): Promise<NativeNotificationResult> {
  const desktop = getLucidDesktopApi()
  if (!desktop) return { ok: false, error: 'desktop-runtime-unavailable' }
  return desktop.notify(input)
}

export async function setDesktopBadgeCount(count: number): Promise<boolean> {
  const desktop = getLucidDesktopApi()
  if (!desktop) return false
  await desktop.setBadgeCount(count)
  return true
}

export async function clearDesktopBadge(): Promise<boolean> {
  const desktop = getLucidDesktopApi()
  if (!desktop) return false
  await desktop.clearBadge()
  return true
}

export async function openDesktopExternal(url: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const desktop = getLucidDesktopApi()
  if (!desktop) return { ok: false, error: 'desktop-runtime-unavailable' }
  return desktop.openExternal(url)
}
