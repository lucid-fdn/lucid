import { nativeBootstrapSchema } from '@lucid/app-client'
import {
  normalizeLucidNativeFeatureFlags,
  type LucidNativeFeatureFlags,
  type LucidNativeFeatureId,
} from '@lucid/app-core'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const DEFAULT_APP_VERSION = '0.1.2'
const DEFAULT_DESKTOP_PROTOCOL = 'lucid'
const DEFAULT_MIN_NATIVE_VERSION = '0.1.0'

export async function GET(request: NextRequest) {
  const appUrl = resolvePublicUrl(process.env.LUCID_NATIVE_APP_URL, request.nextUrl.origin)

  const payload = nativeBootstrapSchema.parse({
    app: {
      name: 'Lucid',
      version: process.env.NEXT_PUBLIC_APP_VERSION?.trim() || DEFAULT_APP_VERSION,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    },
    urls: {
      app: appUrl,
      support: optionalUrl(process.env.NEXT_PUBLIC_SUPPORT_URL),
      status: optionalUrl(process.env.NEXT_PUBLIC_STATUS_URL),
    },
    features: resolveNativeFeatures(),
    desktop: {
      protocol: process.env.LUCID_DESKTOP_PROTOCOL?.trim() || DEFAULT_DESKTOP_PROTOCOL,
      updateChannel: normalizeUpdateChannel(process.env.LUCID_DESKTOP_UPDATE_CHANNEL),
      minVersion: process.env.LUCID_DESKTOP_MIN_VERSION?.trim() || DEFAULT_MIN_NATIVE_VERSION,
    },
    mobile: {
      minVersion: process.env.LUCID_MOBILE_MIN_VERSION?.trim() || DEFAULT_MIN_NATIVE_VERSION,
      pushProvider: 'expo',
    },
  })

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}

function resolveNativeFeatures(): Record<LucidNativeFeatureId, boolean> {
  const flags: LucidNativeFeatureFlags = {
    desktopDeepLinks: true,
    nativeDeviceRegistration: envFlag('LUCID_NATIVE_DEVICE_REGISTRATION_ENABLED', false),
    mobileCompanion: envFlag('LUCID_MOBILE_COMPANION_ENABLED', false),
    mobilePush: envFlag('LUCID_MOBILE_PUSH_ENABLED', false),
    approvalWallet: envFlag('LUCID_NATIVE_APPROVAL_WALLET_ENABLED', false),
    liveRunControl: envFlag('LUCID_NATIVE_LIVE_RUN_CONTROL_ENABLED', false),
    commandCapture: envFlag('LUCID_NATIVE_COMMAND_CAPTURE_ENABLED', false),
    holdToTalk: envFlag('LUCID_NATIVE_HOLD_TO_TALK_ENABLED', false),
    shareToLucid: envFlag('LUCID_NATIVE_SHARE_TO_LUCID_ENABLED', false),
    desktopNativeNotifications: envFlag('LUCID_DESKTOP_NATIVE_NOTIFICATIONS_ENABLED', false),
  }

  return normalizeLucidNativeFeatureFlags(flags)
}

function resolvePublicUrl(value: string | undefined, fallback: string): string {
  return optionalUrl(value) ?? fallback
}

function optionalUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.toString().replace(/\/$/, '')
  } catch {
    return undefined
  }
}

function normalizeUpdateChannel(value: string | undefined): 'stable' | 'beta' | 'dev' | 'internal' {
  const trimmed = value?.trim()
  switch (trimmed) {
    case 'stable':
    case 'beta':
    case 'internal':
      return trimmed
    default:
      return 'dev'
  }
}

function envFlag(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase()
  if (!value) return fallback
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}
