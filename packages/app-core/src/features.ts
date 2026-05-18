import type { LucidAppKind, LucidNativePlatform } from './platform.js'

export type LucidNativeFeatureRisk =
  | 'passive'
  | 'user-initiated'
  | 'confirmation-required'
  | 'privileged'

export type LucidNativeFeatureStatus =
  | 'foundation'
  | 'mvp'
  | 'next'

export type LucidNativeFeatureAuth =
  | 'none'
  | 'session'
  | 'device-bound-session'
  | 'biometric-confirmation'

export type LucidNativeFeatureSurface =
  | 'api'
  | 'deep-link'
  | 'push'
  | 'notification-action'
  | 'voice'
  | 'share-extension'
  | 'os-shortcut'
  | 'widget'
  | 'desktop-ipc'

export type LucidNativeFeatureDefinition = {
  id: string
  title: string
  summary: string
  appKinds: readonly LucidAppKind[]
  platforms: readonly LucidNativePlatform[]
  surfaces: readonly LucidNativeFeatureSurface[]
  status: LucidNativeFeatureStatus
  risk: LucidNativeFeatureRisk
  auth: LucidNativeFeatureAuth
}

const DESKTOP_PLATFORMS = ['macos', 'windows', 'linux'] as const
const MOBILE_PLATFORMS = ['ios', 'android'] as const
const ALL_NATIVE_PLATFORMS = [...DESKTOP_PLATFORMS, ...MOBILE_PLATFORMS] as const

export const LUCID_NATIVE_FEATURES = {
  desktopDeepLinks: {
    id: 'desktopDeepLinks',
    title: 'Desktop Deep Links',
    summary: 'Route lucid:// links into the desktop shell and canonical web surface.',
    appKinds: ['desktop'],
    platforms: DESKTOP_PLATFORMS,
    surfaces: ['deep-link', 'desktop-ipc'],
    status: 'foundation',
    risk: 'passive',
    auth: 'none',
  },
  nativeDeviceRegistration: {
    id: 'nativeDeviceRegistration',
    title: 'Native Device Registration',
    summary: 'Register installs, push addresses, and device metadata through the native API.',
    appKinds: ['desktop', 'mobile', 'pwa'],
    platforms: [...ALL_NATIVE_PLATFORMS, 'web'],
    surfaces: ['api'],
    status: 'foundation',
    risk: 'user-initiated',
    auth: 'session',
  },
  mobileCompanion: {
    id: 'mobileCompanion',
    title: 'Mobile Companion',
    summary: 'Provide the mobile inbox, run status, settings, and web fallback shell.',
    appKinds: ['mobile'],
    platforms: MOBILE_PLATFORMS,
    surfaces: ['api', 'deep-link'],
    status: 'foundation',
    risk: 'passive',
    auth: 'session',
  },
  mobilePush: {
    id: 'mobilePush',
    title: 'Mobile Push',
    summary: 'Deliver approval, run, and escalation notifications to mobile devices.',
    appKinds: ['mobile'],
    platforms: MOBILE_PLATFORMS,
    surfaces: ['push', 'notification-action'],
    status: 'mvp',
    risk: 'confirmation-required',
    auth: 'device-bound-session',
  },
  approvalWallet: {
    id: 'approvalWallet',
    title: 'Approval Wallet',
    summary: 'Review, explain, approve, deny, and receipt risky agent actions on native clients.',
    appKinds: ['desktop', 'mobile'],
    platforms: ALL_NATIVE_PLATFORMS,
    surfaces: ['api', 'push', 'notification-action'],
    status: 'mvp',
    risk: 'confirmation-required',
    auth: 'biometric-confirmation',
  },
  liveRunControl: {
    id: 'liveRunControl',
    title: 'Live Run Control',
    summary: 'Watch, pause, resume, escalate, and open active agent runs from native surfaces.',
    appKinds: ['desktop', 'mobile'],
    platforms: ALL_NATIVE_PLATFORMS,
    surfaces: ['api', 'push', 'notification-action', 'widget'],
    status: 'mvp',
    risk: 'confirmation-required',
    auth: 'device-bound-session',
  },
  commandCapture: {
    id: 'commandCapture',
    title: 'Command Capture',
    summary: 'Capture text, URLs, screenshots, and files into Lucid as agent-ready commands.',
    appKinds: ['desktop', 'mobile'],
    platforms: ALL_NATIVE_PLATFORMS,
    surfaces: ['api', 'share-extension', 'desktop-ipc'],
    status: 'mvp',
    risk: 'user-initiated',
    auth: 'session',
  },
  holdToTalk: {
    id: 'holdToTalk',
    title: 'Hold To Talk',
    summary: 'Push-to-talk voice command loop for asking, explaining, and controlling agents.',
    appKinds: ['desktop', 'mobile'],
    platforms: ALL_NATIVE_PLATFORMS,
    surfaces: ['voice', 'api'],
    status: 'mvp',
    risk: 'confirmation-required',
    auth: 'device-bound-session',
  },
  agentVoiceReplies: {
    id: 'agentVoiceReplies',
    title: 'Agent Voice Replies',
    summary: 'Read important agent answers aloud after user-initiated command sessions.',
    appKinds: ['desktop', 'mobile'],
    platforms: ALL_NATIVE_PLATFORMS,
    surfaces: ['voice'],
    status: 'next',
    risk: 'passive',
    auth: 'session',
  },
  agentActionLinks: {
    id: 'agentActionLinks',
    title: 'Agent Action Links',
    summary: 'Let users bind trusted agent commands to native buttons, shortcuts, widgets, and notification actions.',
    appKinds: ['desktop', 'mobile'],
    platforms: ALL_NATIVE_PLATFORMS,
    surfaces: ['api', 'notification-action', 'os-shortcut', 'widget', 'desktop-ipc'],
    status: 'next',
    risk: 'privileged',
    auth: 'biometric-confirmation',
  },
  shareToLucid: {
    id: 'shareToLucid',
    title: 'Share To Lucid',
    summary: 'Route OS share sheet content into command capture and agent investigation flows.',
    appKinds: ['mobile'],
    platforms: MOBILE_PLATFORMS,
    surfaces: ['share-extension', 'api'],
    status: 'mvp',
    risk: 'user-initiated',
    auth: 'session',
  },
  osShortcuts: {
    id: 'osShortcuts',
    title: 'OS Shortcuts',
    summary: 'Expose safe Lucid actions to Siri Shortcuts, App Intents, Android shortcuts, and assistant actions.',
    appKinds: ['mobile'],
    platforms: MOBILE_PLATFORMS,
    surfaces: ['os-shortcut', 'api'],
    status: 'next',
    risk: 'confirmation-required',
    auth: 'biometric-confirmation',
  },
  lockScreenLiveActivity: {
    id: 'lockScreenLiveActivity',
    title: 'Lock Screen Live Activity',
    summary: 'Show important run progress and approval state on lock-screen and widget surfaces.',
    appKinds: ['mobile'],
    platforms: ['ios'],
    surfaces: ['widget', 'notification-action'],
    status: 'next',
    risk: 'confirmation-required',
    auth: 'biometric-confirmation',
  },
  desktopNativeNotifications: {
    id: 'desktopNativeNotifications',
    title: 'Desktop Native Notifications',
    summary: 'Use OS desktop notifications for approvals, run state, and local escalations.',
    appKinds: ['desktop'],
    platforms: DESKTOP_PLATFORMS,
    surfaces: ['desktop-ipc', 'notification-action'],
    status: 'mvp',
    risk: 'confirmation-required',
    auth: 'device-bound-session',
  },
  desktopCommandPalette: {
    id: 'desktopCommandPalette',
    title: 'Desktop Command Palette',
    summary: 'Expose fast keyboard-first command capture, run control, and approval flows in the desktop shell.',
    appKinds: ['desktop'],
    platforms: DESKTOP_PLATFORMS,
    surfaces: ['desktop-ipc', 'api'],
    status: 'next',
    risk: 'confirmation-required',
    auth: 'device-bound-session',
  },
  desktopTrayControl: {
    id: 'desktopTrayControl',
    title: 'Desktop Tray Control',
    summary: 'Keep lightweight run, approval, and pause/resume controls available from the system tray.',
    appKinds: ['desktop'],
    platforms: DESKTOP_PLATFORMS,
    surfaces: ['desktop-ipc', 'notification-action'],
    status: 'next',
    risk: 'confirmation-required',
    auth: 'device-bound-session',
  },
} as const satisfies Record<string, LucidNativeFeatureDefinition>

export type LucidNativeFeatureId = keyof typeof LUCID_NATIVE_FEATURES

export type LucidNativeFeatureFilter = {
  appKind?: LucidAppKind
  platform?: LucidNativePlatform
  status?: LucidNativeFeatureStatus
}

export type LucidNativeFeatureFlags = Partial<Record<LucidNativeFeatureId, boolean>> & Record<string, boolean | undefined>

export const LUCID_NATIVE_FEATURE_IDS = Object.keys(LUCID_NATIVE_FEATURES) as LucidNativeFeatureId[]

export function getLucidNativeFeature(id: LucidNativeFeatureId): LucidNativeFeatureDefinition {
  return LUCID_NATIVE_FEATURES[id]
}

export function listLucidNativeFeatures(filter: LucidNativeFeatureFilter = {}): LucidNativeFeatureDefinition[] {
  return LUCID_NATIVE_FEATURE_IDS
    .map((id) => LUCID_NATIVE_FEATURES[id])
    .filter((feature) => {
      if (filter.appKind && !(feature.appKinds as readonly LucidAppKind[]).includes(filter.appKind)) return false
      if (filter.platform && !(feature.platforms as readonly LucidNativePlatform[]).includes(filter.platform)) return false
      if (filter.status && feature.status !== filter.status) return false
      return true
    })
}

export function isLucidNativeFeatureSupported(
  id: LucidNativeFeatureId,
  target: {
    appKind: LucidAppKind
    platform: LucidNativePlatform
  },
): boolean {
  const feature = LUCID_NATIVE_FEATURES[id]
  return (
    (feature.appKinds as readonly LucidAppKind[]).includes(target.appKind) &&
    (feature.platforms as readonly LucidNativePlatform[]).includes(target.platform)
  )
}

export function normalizeLucidNativeFeatureFlags(flags: LucidNativeFeatureFlags = {}): Record<LucidNativeFeatureId, boolean> {
  return Object.fromEntries(
    LUCID_NATIVE_FEATURE_IDS.map((id) => [id, flags[id] === true]),
  ) as Record<LucidNativeFeatureId, boolean>
}
