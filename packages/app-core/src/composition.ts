import {
  LUCID_NATIVE_FEATURE_IDS,
  type LucidNativeFeatureAuth,
  type LucidNativeFeatureId,
  type LucidNativeFeatureRisk,
  type LucidNativeFeatureSurface,
  isLucidNativeFeatureSupported,
} from './features.js'
import type { LucidAppKind, LucidNativePlatform } from './platform.js'

export type LucidNativeContractKind =
  | 'session-handoff'
  | 'device-registration'
  | 'push-registration'
  | 'voice-command'
  | 'action-dispatch'
  | 'content-capture'
  | 'notification-delivery'

export type LucidNativeFeaturePhase = 'foundation' | 'mvp' | 'scale'

export type LucidNativeFeatureContract = {
  kind: LucidNativeContractKind
  clientMethod: string
  route: string
  idempotent: boolean
}

export type LucidNativeFeatureComposition = {
  featureId: LucidNativeFeatureId
  phase: LucidNativeFeaturePhase
  requiredAuth: LucidNativeFeatureAuth
  maxRisk: LucidNativeFeatureRisk
  surfaces: readonly LucidNativeFeatureSurface[]
  contracts: readonly LucidNativeFeatureContract[]
  nativeModules: readonly string[]
  owner: 'shared' | 'desktop' | 'mobile'
}

export type LucidNativeFeatureTarget = {
  appKind: LucidAppKind
  platform: LucidNativePlatform
  flags?: Partial<Record<LucidNativeFeatureId, boolean>>
}

export type LucidNativeFeatureManifestItem = LucidNativeFeatureComposition & {
  enabled: boolean
}

export const LUCID_NATIVE_COMPOSITION = {
  desktopDeepLinks: {
    featureId: 'desktopDeepLinks',
    phase: 'foundation',
    requiredAuth: 'none',
    maxRisk: 'passive',
    surfaces: ['deep-link', 'desktop-ipc'],
    contracts: [],
    nativeModules: ['electron.protocol', 'electron.ipcMain', 'electron.contextBridge'],
    owner: 'desktop',
  },
  nativeDeviceRegistration: {
    featureId: 'nativeDeviceRegistration',
    phase: 'foundation',
    requiredAuth: 'session',
    maxRisk: 'user-initiated',
    surfaces: ['api'],
    contracts: [
      {
        kind: 'device-registration',
        clientMethod: 'registerDevice',
        route: '/api/native/devices',
        idempotent: true,
      },
    ],
    nativeModules: ['expo-secure-store', 'electron.safeStorage'],
    owner: 'shared',
  },
  mobileCompanion: {
    featureId: 'mobileCompanion',
    phase: 'foundation',
    requiredAuth: 'session',
    maxRisk: 'passive',
    surfaces: ['api', 'deep-link'],
    contracts: [
      {
        kind: 'session-handoff',
        clientMethod: 'createSessionHandoff',
        route: '/api/native/session/handoff',
        idempotent: false,
      },
    ],
    nativeModules: ['expo-router', 'expo-linking', 'expo-secure-store'],
    owner: 'mobile',
  },
  mobilePush: {
    featureId: 'mobilePush',
    phase: 'mvp',
    requiredAuth: 'device-bound-session',
    maxRisk: 'confirmation-required',
    surfaces: ['push', 'notification-action'],
    contracts: [
      {
        kind: 'push-registration',
        clientMethod: 'registerPushToken',
        route: '/api/native/push/register',
        idempotent: true,
      },
    ],
    nativeModules: ['expo-notifications', 'expo-device'],
    owner: 'mobile',
  },
  approvalWallet: {
    featureId: 'approvalWallet',
    phase: 'mvp',
    requiredAuth: 'biometric-confirmation',
    maxRisk: 'confirmation-required',
    surfaces: ['api', 'push', 'notification-action'],
    contracts: [
      {
        kind: 'action-dispatch',
        clientMethod: 'dispatchNativeAction',
        route: '/api/native/actions/dispatch',
        idempotent: true,
      },
    ],
    nativeModules: ['expo-local-authentication', 'electron.safeStorage'],
    owner: 'shared',
  },
  liveRunControl: {
    featureId: 'liveRunControl',
    phase: 'mvp',
    requiredAuth: 'device-bound-session',
    maxRisk: 'confirmation-required',
    surfaces: ['api', 'push', 'notification-action', 'widget'],
    contracts: [
      {
        kind: 'action-dispatch',
        clientMethod: 'dispatchNativeAction',
        route: '/api/native/actions/dispatch',
        idempotent: true,
      },
    ],
    nativeModules: ['expo-notifications', 'electron.Notification', 'electron.Tray'],
    owner: 'shared',
  },
  commandCapture: {
    featureId: 'commandCapture',
    phase: 'mvp',
    requiredAuth: 'session',
    maxRisk: 'user-initiated',
    surfaces: ['api', 'share-extension', 'desktop-ipc'],
    contracts: [
      {
        kind: 'content-capture',
        clientMethod: 'captureNativeCommand',
        route: '/api/native/actions/dispatch',
        idempotent: true,
      },
    ],
    nativeModules: ['expo-sharing', 'electron.clipboard', 'electron.globalShortcut'],
    owner: 'shared',
  },
  holdToTalk: {
    featureId: 'holdToTalk',
    phase: 'mvp',
    requiredAuth: 'device-bound-session',
    maxRisk: 'confirmation-required',
    surfaces: ['voice', 'api'],
    contracts: [
      {
        kind: 'voice-command',
        clientMethod: 'createVoiceCommand',
        route: '/api/native/voice/commands',
        idempotent: false,
      },
    ],
    nativeModules: ['expo-audio', 'expo-speech', 'navigator.mediaDevices'],
    owner: 'shared',
  },
  agentVoiceReplies: {
    featureId: 'agentVoiceReplies',
    phase: 'scale',
    requiredAuth: 'session',
    maxRisk: 'passive',
    surfaces: ['voice'],
    contracts: [
      {
        kind: 'voice-command',
        clientMethod: 'createVoiceCommand',
        route: '/api/native/voice/commands',
        idempotent: false,
      },
    ],
    nativeModules: ['expo-speech', 'SpeechSynthesis'],
    owner: 'shared',
  },
  agentActionLinks: {
    featureId: 'agentActionLinks',
    phase: 'scale',
    requiredAuth: 'biometric-confirmation',
    maxRisk: 'privileged',
    surfaces: ['api', 'notification-action', 'os-shortcut', 'widget', 'desktop-ipc'],
    contracts: [
      {
        kind: 'action-dispatch',
        clientMethod: 'dispatchNativeAction',
        route: '/api/native/actions/dispatch',
        idempotent: true,
      },
    ],
    nativeModules: ['AppIntents', 'Android Shortcuts', 'electron.globalShortcut'],
    owner: 'shared',
  },
  shareToLucid: {
    featureId: 'shareToLucid',
    phase: 'mvp',
    requiredAuth: 'session',
    maxRisk: 'user-initiated',
    surfaces: ['share-extension', 'api'],
    contracts: [
      {
        kind: 'content-capture',
        clientMethod: 'captureNativeCommand',
        route: '/api/native/actions/dispatch',
        idempotent: true,
      },
    ],
    nativeModules: ['ShareExtension', 'Android Sharesheet'],
    owner: 'mobile',
  },
  osShortcuts: {
    featureId: 'osShortcuts',
    phase: 'scale',
    requiredAuth: 'biometric-confirmation',
    maxRisk: 'confirmation-required',
    surfaces: ['os-shortcut', 'api'],
    contracts: [
      {
        kind: 'action-dispatch',
        clientMethod: 'dispatchNativeAction',
        route: '/api/native/actions/dispatch',
        idempotent: true,
      },
    ],
    nativeModules: ['AppIntents', 'Android App Actions'],
    owner: 'mobile',
  },
  lockScreenLiveActivity: {
    featureId: 'lockScreenLiveActivity',
    phase: 'scale',
    requiredAuth: 'biometric-confirmation',
    maxRisk: 'confirmation-required',
    surfaces: ['widget', 'notification-action'],
    contracts: [
      {
        kind: 'push-registration',
        clientMethod: 'registerPushToken',
        route: '/api/native/push/register',
        idempotent: true,
      },
    ],
    nativeModules: ['ActivityKit', 'WidgetKit'],
    owner: 'mobile',
  },
  desktopNativeNotifications: {
    featureId: 'desktopNativeNotifications',
    phase: 'mvp',
    requiredAuth: 'device-bound-session',
    maxRisk: 'confirmation-required',
    surfaces: ['desktop-ipc', 'notification-action'],
    contracts: [
      {
        kind: 'notification-delivery',
        clientMethod: 'notify',
        route: 'lucid:notify',
        idempotent: false,
      },
    ],
    nativeModules: ['electron.Notification'],
    owner: 'desktop',
  },
  desktopCommandPalette: {
    featureId: 'desktopCommandPalette',
    phase: 'scale',
    requiredAuth: 'device-bound-session',
    maxRisk: 'confirmation-required',
    surfaces: ['desktop-ipc', 'api'],
    contracts: [
      {
        kind: 'action-dispatch',
        clientMethod: 'dispatchNativeAction',
        route: '/api/native/actions/dispatch',
        idempotent: true,
      },
    ],
    nativeModules: ['electron.globalShortcut', 'electron.ipcMain'],
    owner: 'desktop',
  },
  desktopTrayControl: {
    featureId: 'desktopTrayControl',
    phase: 'scale',
    requiredAuth: 'device-bound-session',
    maxRisk: 'confirmation-required',
    surfaces: ['desktop-ipc', 'notification-action'],
    contracts: [
      {
        kind: 'action-dispatch',
        clientMethod: 'dispatchNativeAction',
        route: '/api/native/actions/dispatch',
        idempotent: true,
      },
    ],
    nativeModules: ['electron.Tray', 'electron.Menu'],
    owner: 'desktop',
  },
} as const satisfies Record<LucidNativeFeatureId, LucidNativeFeatureComposition>

export function getLucidNativeFeatureComposition(id: LucidNativeFeatureId): LucidNativeFeatureComposition {
  return LUCID_NATIVE_COMPOSITION[id]
}

export function listLucidNativeFeatureComposition(target?: LucidNativeFeatureTarget): LucidNativeFeatureComposition[] {
  return LUCID_NATIVE_FEATURE_IDS
    .map((id) => LUCID_NATIVE_COMPOSITION[id])
    .filter((composition) => {
      if (!target) return true
      return isLucidNativeFeatureSupported(composition.featureId, target)
    })
}

export function createLucidNativeFeatureManifest(target: LucidNativeFeatureTarget): LucidNativeFeatureManifestItem[] {
  return listLucidNativeFeatureComposition(target).map((composition) => ({
    ...composition,
    enabled: target.flags?.[composition.featureId] === true,
  }))
}

