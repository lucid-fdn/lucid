import 'server-only'

import crypto from 'node:crypto'

import type {
  NativeDevice,
  RegisterNativeDeviceInput,
  UpdateNativeDeviceInput,
} from '@lucid/app-client'

import { supabase } from './client'

type NativeDeviceRow = {
  id: string
  user_id: string
  org_id: string | null
  platform: NativeDevice['platform']
  app_kind: NativeDevice['appKind']
  install_id: string
  device_name: string | null
  app_version: string | null
  os_version: string | null
  push_provider: NativeDevice['pushProvider']
  push_token_hash: string | null
  push_token_encrypted: string | null
  notification_settings: Record<string, unknown>
  metadata: Record<string, unknown>
  last_seen_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

const NATIVE_DEVICE_SELECT = `
  id,
  user_id,
  org_id,
  platform,
  app_kind,
  install_id,
  device_name,
  app_version,
  os_version,
  push_provider,
  push_token_hash,
  push_token_encrypted,
  notification_settings,
  metadata,
  last_seen_at,
  revoked_at,
  created_at,
  updated_at
`

export class NativeDeviceSecretError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NativeDeviceSecretError'
  }
}

export class NativeDeviceAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NativeDeviceAccessError'
  }
}

export function hashNativeSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex')
}

export function encryptNativeSecret(secret: string, keyHex = process.env.ENCRYPTION_KEY): string {
  if (!keyHex || !/^[a-f0-9]{64}$/i.test(keyHex)) {
    throw new NativeDeviceSecretError('ENCRYPTION_KEY must be set to a 64-character hex string to store push tokens.')
  }

  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`
}

export function sealNativePushToken(
  pushToken: string | null | undefined,
  keyHex = process.env.ENCRYPTION_KEY,
): { push_token_hash: string | null; push_token_encrypted: string | null } {
  if (pushToken === undefined) {
    return {
      push_token_hash: null,
      push_token_encrypted: null,
    }
  }

  if (pushToken === null || pushToken.trim() === '') {
    return {
      push_token_hash: null,
      push_token_encrypted: null,
    }
  }

  return {
    push_token_hash: hashNativeSecret(pushToken),
    push_token_encrypted: encryptNativeSecret(pushToken, keyHex),
  }
}

export function mapNativeDeviceRow(row: NativeDeviceRow): NativeDevice {
  return {
    id: row.id,
    userId: row.user_id,
    orgId: row.org_id,
    platform: row.platform,
    appKind: row.app_kind,
    installId: row.install_id,
    deviceName: row.device_name,
    appVersion: row.app_version,
    osVersion: row.os_version,
    pushProvider: row.push_provider,
    hasPushToken: Boolean(row.push_token_hash && row.push_token_encrypted),
    notificationSettings: row.notification_settings ?? {},
    metadata: row.metadata ?? {},
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listNativeDevices(userId: string): Promise<NativeDevice[]> {
  const { data, error } = await supabase
    .from('native_devices')
    .select(NATIVE_DEVICE_SELECT)
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false, nullsFirst: false })

  if (error) throw error
  return ((data ?? []) as NativeDeviceRow[]).map(mapNativeDeviceRow)
}

export async function registerNativeDevice(
  userId: string,
  input: RegisterNativeDeviceInput,
): Promise<NativeDevice> {
  await assertNativeDeviceOrgMembership(userId, input.orgId ?? null)

  const now = new Date().toISOString()
  const sealedPushToken = input.pushToken
    ? sealNativePushToken(input.pushToken)
    : { push_token_hash: null, push_token_encrypted: null }

  const payload = {
    user_id: userId,
    org_id: input.orgId ?? null,
    platform: input.platform,
    app_kind: input.appKind,
    install_id: input.installId,
    device_name: input.deviceName ?? null,
    app_version: input.appVersion ?? null,
    os_version: input.osVersion ?? null,
    push_provider: input.pushProvider ?? null,
    ...sealedPushToken,
    notification_settings: input.notificationSettings ?? {},
    metadata: input.metadata ?? {},
    last_seen_at: now,
    revoked_at: null,
    updated_at: now,
  }

  const { data, error } = await supabase
    .from('native_devices')
    .upsert(payload, { onConflict: 'user_id,app_kind,install_id' })
    .select(NATIVE_DEVICE_SELECT)
    .single()

  if (error) throw error
  return mapNativeDeviceRow(data as NativeDeviceRow)
}

export async function updateNativeDevice(
  userId: string,
  deviceId: string,
  input: UpdateNativeDeviceInput,
): Promise<NativeDevice> {
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = {
    updated_at: now,
    last_seen_at: now,
  }

  if (input.deviceName !== undefined) updates.device_name = input.deviceName
  if (input.appVersion !== undefined) updates.app_version = input.appVersion
  if (input.osVersion !== undefined) updates.os_version = input.osVersion
  if (input.pushProvider !== undefined) updates.push_provider = input.pushProvider
  if (input.notificationSettings !== undefined) updates.notification_settings = input.notificationSettings
  if (input.metadata !== undefined) updates.metadata = input.metadata
  if (input.revoked !== undefined) updates.revoked_at = input.revoked ? now : null

  if (input.pushToken !== undefined) {
    Object.assign(updates, sealNativePushToken(input.pushToken))
  }

  const { data, error } = await supabase
    .from('native_devices')
    .update(updates)
    .eq('id', deviceId)
    .eq('user_id', userId)
    .select(NATIVE_DEVICE_SELECT)
    .single()

  if (error) throw error
  return mapNativeDeviceRow(data as NativeDeviceRow)
}

export async function revokeNativeDevice(userId: string, deviceId: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('native_devices')
    .update({ revoked_at: now, updated_at: now })
    .eq('id', deviceId)
    .eq('user_id', userId)

  if (error) throw error

  const { error: sessionError } = await supabase
    .from('native_auth_sessions')
    .update({ revoked_at: now })
    .eq('device_id', deviceId)
    .eq('user_id', userId)
    .is('revoked_at', null)

  if (sessionError) throw sessionError
}

export async function resolveNativeAccessTokenUserId(accessToken: string): Promise<string | null> {
  const tokenHash = hashNativeSecret(accessToken)
  const now = new Date().toISOString()

  const { data: session, error: sessionError } = await supabase
    .from('native_auth_sessions')
    .select('id, user_id, device_id, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (sessionError) throw sessionError
  if (!session?.user_id || session.revoked_at || new Date(String(session.expires_at)).getTime() <= Date.now()) {
    return null
  }

  const { data: device, error: deviceError } = await supabase
    .from('native_devices')
    .select('id, revoked_at')
    .eq('id', session.device_id)
    .eq('user_id', session.user_id)
    .maybeSingle()

  if (deviceError) throw deviceError
  if (!device || device.revoked_at) return null

  await supabase
    .from('native_auth_sessions')
    .update({ last_used_at: now })
    .eq('id', session.id)
    .is('revoked_at', null)

  await supabase
    .from('native_devices')
    .update({ last_seen_at: now, updated_at: now })
    .eq('id', session.device_id)
    .eq('user_id', session.user_id)

  return String(session.user_id)
}

async function assertNativeDeviceOrgMembership(userId: string, orgId: string | null): Promise<void> {
  if (!orgId) return

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) {
    throw new NativeDeviceAccessError('User is not a member of the requested native device organization.')
  }
}
