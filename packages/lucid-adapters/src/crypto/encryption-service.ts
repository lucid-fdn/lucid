/**
 * EncryptionService — Phase 1B: HKDF-based envelope encryption
 *
 * Backend-agnostic interface with HKDF implementation (Option A).
 * Phase 4 swaps to KMS-backed (Option B) without changing callers.
 *
 * See docs/OPENCLAW_INTEGRATION_SPEC.md §3.3
 */

import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/* ─── Types ─────────────────────────────────────────────── */

export type EncryptionMode = 'NONE' | 'APP_LAYER' | 'ENCLAVE'

export interface EncryptedPayload {
  ciphertext: string   // base64
  iv: string           // hex
  authTag: string      // hex
  keyId: string        // tenant key ID + version
}

export interface EncryptionService {
  encrypt(tenantId: string, plaintext: string, aad?: string): Promise<EncryptedPayload>
  decrypt(tenantId: string, payload: EncryptedPayload, aad?: string): Promise<string>
  rotateKey(tenantId: string): Promise<void>
  getMode(tenantId: string): Promise<EncryptionMode>
}

/* ─── HKDF helpers ──────────────────────────────────────── */

/**
 * Derive a 256-bit DEK from master key + tenant salt using HKDF-SHA256.
 * No AWS dependency — runs locally.
 */
function hkdfDerive(masterKey: Buffer, salt: string, info: string): Buffer {
  // HKDF-Extract: PRK = HMAC-SHA256(salt, IKM)
  const prk = createHmac('sha256', Buffer.from(salt, 'utf8'))
    .update(masterKey)
    .digest()

  // HKDF-Expand: OKM = HMAC-SHA256(PRK, info || 0x01) — single block (32 bytes)
  const okm = createHmac('sha256', prk)
    .update(Buffer.concat([Buffer.from(info, 'utf8'), Buffer.from([0x01])]))
    .digest()

  return okm // 32 bytes = AES-256 key
}

/* ─── NullEncryptionService (mode = NONE) ───────────────── */

/** No-op encryption for free tier / dev environments */
export class NullEncryptionService implements EncryptionService {
  async encrypt(_tenantId: string, plaintext: string): Promise<EncryptedPayload> {
    // Should never be called when mode is NONE, but safe fallback
    return {
      ciphertext: Buffer.from(plaintext, 'utf8').toString('base64'),
      iv: '',
      authTag: '',
      keyId: 'none',
    }
  }

  async decrypt(_tenantId: string, payload: EncryptedPayload): Promise<string> {
    return Buffer.from(payload.ciphertext, 'base64').toString('utf8')
  }

  async rotateKey(): Promise<void> {
    // No-op
  }

  async getMode(): Promise<EncryptionMode> {
    return 'NONE'
  }
}

/* ─── HKDFEncryptionService (mode = APP_LAYER) ──────────── */

/**
 * Production-grade per-tenant encryption using HKDF key derivation.
 *
 * Key hierarchy:
 *   Master Key (env var) → HKDF → per-tenant DEK → AES-256-GCM
 *
 * DEKs are stored encrypted in `tenant_encryption_keys` table.
 * The "encrypted_dek" column stores the raw DEK encrypted by master key,
 * but in Phase 1B we derive DEKs deterministically via HKDF so the
 * table mainly serves as an audit trail + future KMS migration path.
 */
export class HKDFEncryptionService implements EncryptionService {
  private masterKey: Buffer
  private dekCache: Map<string, { dek: Buffer; keyId: string }> = new Map()

  constructor(
    private supabase: SupabaseClient,
    masterKeyHex: string
  ) {
    if (!masterKeyHex || masterKeyHex.length < 64) {
      throw new Error(
        'MESSAGE_ENCRYPTION_MASTER_KEY must be at least 32 bytes (64 hex chars)'
      )
    }
    this.masterKey = Buffer.from(masterKeyHex, 'hex')
  }

  async encrypt(tenantId: string, plaintext: string, aad?: string): Promise<EncryptedPayload> {
    const { dek, keyId } = await this.getOrCreateDEK(tenantId)
    const iv = randomBytes(12) // 96-bit IV for GCM

    const cipher = createCipheriv('aes-256-gcm', dek, iv)
    if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'))

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ])
    const authTag = cipher.getAuthTag()

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      keyId,
    }
  }

  async decrypt(tenantId: string, payload: EncryptedPayload, aad?: string): Promise<string> {
    const { dek } = await this.getDEK(tenantId, payload.keyId)
    const iv = Buffer.from(payload.iv, 'hex')
    const authTag = Buffer.from(payload.authTag, 'hex')
    const ciphertext = Buffer.from(payload.ciphertext, 'base64')

    const decipher = createDecipheriv('aes-256-gcm', dek, iv)
    decipher.setAuthTag(authTag)
    if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'))

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])

    return decrypted.toString('utf8')
  }

  async rotateKey(tenantId: string): Promise<void> {
    // Deactivate current key
    await this.supabase
      .from('tenant_encryption_keys')
      .update({ is_active: false, rotated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('is_active', true)

    // Get next version
    const { data: maxRow } = await this.supabase
      .from('tenant_encryption_keys')
      .select('key_version')
      .eq('tenant_id', tenantId)
      .order('key_version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextVersion = (maxRow?.key_version ?? 0) + 1

    // Derive new DEK
    const dek = hkdfDerive(
      this.masterKey,
      tenantId,
      `lucid-dek-v${nextVersion}`
    )

    // Encrypt DEK with master for storage (audit trail + KMS migration)
    const wrappedDek = this.wrapDEK(dek)

    await this.supabase.from('tenant_encryption_keys').insert({
      tenant_id: tenantId,
      key_version: nextVersion,
      encrypted_dek: wrappedDek,
      algorithm: 'aes-256-gcm',
      is_active: true,
    })

    // Invalidate cache
    this.dekCache.delete(tenantId)
  }

  async getMode(): Promise<EncryptionMode> {
    return 'APP_LAYER'
  }

  /* ─── Internal helpers ──────────────────────────────── */

  private async getOrCreateDEK(tenantId: string): Promise<{ dek: Buffer; keyId: string }> {
    // Check cache
    const cached = this.dekCache.get(tenantId)
    if (cached) return cached

    // Try to load active key from DB
    const { data: row } = await this.supabase
      .from('tenant_encryption_keys')
      .select('id, key_version')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle()

    if (row) {
      const dek = hkdfDerive(this.masterKey, tenantId, `lucid-dek-v${row.key_version}`)
      const keyId = `${row.id}:v${row.key_version}`
      const result = { dek, keyId }
      this.dekCache.set(tenantId, result)
      return result
    }

    // First time: create key version 1
    const dek = hkdfDerive(this.masterKey, tenantId, 'lucid-dek-v1')
    const wrappedDek = this.wrapDEK(dek)

    const { data: created, error } = await this.supabase
      .from('tenant_encryption_keys')
      .insert({
        tenant_id: tenantId,
        key_version: 1,
        encrypted_dek: wrappedDek,
        algorithm: 'aes-256-gcm',
        is_active: true,
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to create tenant encryption key: ${error.message}`)

    const keyId = `${created.id}:v1`
    const result = { dek, keyId }
    this.dekCache.set(tenantId, result)
    return result
  }

  private async getDEK(tenantId: string, keyId: string): Promise<{ dek: Buffer }> {
    // Parse keyId format: "uuid:vN"
    const versionMatch = keyId.match(/:v(\d+)$/)
    if (!versionMatch) {
      throw new Error(`Invalid key ID format: ${keyId}`)
    }
    const version = parseInt(versionMatch[1], 10)
    const dek = hkdfDerive(this.masterKey, tenantId, `lucid-dek-v${version}`)
    return { dek }
  }

  /** Wrap DEK with master key for audit/storage (simple AES-256-GCM) */
  private wrapDEK(dek: Buffer): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv)
    const encrypted = Buffer.concat([cipher.update(dek), cipher.final()])
    const authTag = cipher.getAuthTag()
    // Format: iv_hex:authTag_hex:ciphertext_base64
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('base64')}`
  }
}

/* ─── Factory ───────────────────────────────────────────── */

export function createEncryptionService(
  supabase: SupabaseClient,
  masterKeyHex?: string
): EncryptionService {
  if (!masterKeyHex) {
    return new NullEncryptionService()
  }
  return new HKDFEncryptionService(supabase, masterKeyHex)
}