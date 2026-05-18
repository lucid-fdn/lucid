export const LUCID_DESKTOP_PROTOCOL = 'lucid'

export type LucidAppKind = 'desktop' | 'mobile' | 'pwa'

export type LucidNativePlatform =
  | 'macos'
  | 'windows'
  | 'linux'
  | 'ios'
  | 'android'
  | 'web'

export function normalizeLucidProtocol(protocol = LUCID_DESKTOP_PROTOCOL): string {
  const normalized = protocol.trim().replace(/:$/, '').toLowerCase()
  return normalized || LUCID_DESKTOP_PROTOCOL
}
