/**
 * EncryptionService — Phase 1B: Per-tenant envelope encryption
 *
 * Implements HKDF-derived per-tenant DEKs for message/memory encryption.
 * Phase 1B backend: HKDF from env master key (no AWS dependency).
 * Phase 4 backend: AWS KMS GenerateDataKey (swap in later).
 *
 * See docs/OPENCLAW_INTEGRATION_SPEC.md §6
 */

import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { startEncryptSpan, SpanStatusCode } from '../observability/tracing.js'

/* ─── Types ─────────────────────────────────────────────── */

export type EncryptionMode = 'NONE' | 'APP_LAYER' | 'ENCLAVE'

export interface EncryptedPayload {
  ciphertext: string   // base64
  iv: string           // hex
  authTag: string      // hex
  keyId: string        // tenantId:keyVersion
  mode: EncryptionMode
}

export interface DecryptedMessage {
  content: string
  wasEncrypted: boolean
}

/* ─── EncryptionService ─────────────────────────────────── */

export class EncryptionService {
  private masterKey: Buffer | null
  private dekCache = new Map<string, { key: Buffer; keyId: string; expiresAt: number }>()
  private static readonly DEK_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

  constructor(
    private supabase: SupabaseClient,
    masterKeyHex: string | undefined
  ) {
    this.masterKey = masterKeyHex ? Buffer.from(masterKeyHex, 'hex') : null

    if (this.masterKey && this.masterKey.length !== 32) {
      console.warn('[encryption] Master key should be 32 bytes (64 hex chars). Encryption disabled.')
      this.masterKey = null
    }
  }

  /** Check if encryption is available (master key configured) */
  isAvailable(): boolean {
    return this.masterKey !== null
  }

  /**
   * Encrypt content for a tenant.
   * Returns EncryptedPayload with ciphertext, IV, auth tag, and key reference.
   *
   * AAD = tenantKey:sessionKey:messageId (binds ciphertext to context)
   */
  async encrypt(
    tenantId: string,
    plaintext: string,
    aad?: string
  ): Promise<EncryptedPayload> {
    if (!this.masterKey) {
      throw new Error('Encryption not available: MESSAGE_ENCRYPTION_MASTER_KEY not set')
    }

    const { key, keyId } = await this.getOrCreateDEK(tenantId)

    // Generate random IV (96 bits for AES-256-GCM)
    const iv = crypto.randomBytes(12)

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    if (aad) {
      cipher.setAAD(Buffer.from(aad, 'utf8'))
    }

    let encrypted = cipher.update(plaintext, 'utf8')
    encrypted = Buffer.concat([encrypted, cipher.final()])
    const authTag = cipher.getAuthTag()

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      keyId,
      mode: 'APP_LAYER',
    }
  }

  /**
   * Decrypt content for a tenant.
   * Requires the same AAD used during encryption.
   */
  async decrypt(
    tenantId: string,
    payload: EncryptedPayload,
    aad?: string
  ): Promise<string> {
    if (!this.masterKey) {
      throw new Error('Encryption not available: MESSAGE_ENCRYPTION_MASTER_KEY not set')
    }

    const { key } = await this.loadDEK(tenantId, payload.keyId)

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(payload.iv, 'hex')
    )
    decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'))
    if (aad) {
      decipher.setAAD(Buffer.from(aad, 'utf8'))
    }

    let decrypted = decipher.update(Buffer.from(payload.ciphertext, 'base64'))
    decrypted = Buffer.concat([decrypted, decipher.final()])

    return decrypted.toString('utf8')
  }

  /**
   * Decrypt a message row from the database.
   * Handles both encrypted and plaintext messages transparently.
   */
  decryptMessageRow(
    row: {
      content: string | null
      content_encrypted: string | null
      content_iv: string | null
      content_auth_tag: string | null
      encryption_mode: string | null
      key_id: string | null
    },
    tenantId: string,
    aad?: string
  ): Promise<DecryptedMessage> {
    const mode = (row.encryption_mode || 'NONE') as EncryptionMode

    if (mode === 'NONE') {
      return Promise.resolve({
        content: row.content || '',
        wasEncrypted: false,
      })
    }

    if (!row.content_encrypted || !row.content_iv || !row.content_auth_tag || !row.key_id) {
      console.warn('[encryption] Encrypted message missing required fields, returning empty')
      return Promise.resolve({ content: '', wasEncrypted: true })
    }

    return this.decrypt(tenantId, {
      ciphertext: row.content_encrypted,
      iv: row.content_iv,
      authTag: row.content_auth_tag,
      keyId: row.key_id,
      mode,
    }, aad).then(content => ({ content, wasEncrypted: true }))
  }

  /**
   * Build message insert columns based on encryption mode.
   * Returns the correct columns for INSERT into assistant_messages.
   */
  async buildMessageColumns(
    tenantId: string,
    content: string,
    encryptionMode: EncryptionMode,
    aad?: string
  ): Promise<Record<string, unknown>> {
    if (encryptionMode === 'NONE' || !this.isAvailable()) {
      return {
        content,
        content_encrypted: null,
        content_iv: null,
        content_auth_tag: null,
        encryption_mode: 'NONE',
        key_id: null,
      }
    }

    // OTel span: encrypt.message (Guardrail #5: only mode/bytes/algo/keyVersion)
    const messageId = aad?.split(':').pop() || 'unknown'
    const span = startEncryptSpan({
      tenantKey: tenantId,
      messageId,
      mode: encryptionMode,
      payloadBytes: Buffer.byteLength(content, 'utf8'),
      algo: 'aes-256-gcm',
    })

    try {
      const payload = await this.encrypt(tenantId, content, aad)
      span.setAttribute('lucid.encrypt.key_version', payload.keyId.split(':').pop() || '1')
      span.setStatus({ code: SpanStatusCode.OK })

      return {
        content: null,  // MUST be null when encrypted (spec §6.4 invariant)
        content_encrypted: payload.ciphertext,
        content_iv: payload.iv,
        content_auth_tag: payload.authTag,
        encryption_mode: payload.mode,
        key_id: payload.keyId,
      }
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : 'encrypt_failed' })
      span.recordException(err instanceof Error ? err : new Error(String(err)))
      throw err
    } finally {
      span.end()
    }
  }

  /**
   * Rotate the DEK for a tenant.
   * Creates a new key version and deactivates the old one.
   */
  async rotateKey(tenantId: string): Promise<void> {
    if (!this.masterKey) {
      throw new Error('Encryption not available')
    }

    // Get current max version
    const { data: currentKey } = await this.supabase
      .from('tenant_encryption_keys')
      .select('key_version')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('key_version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const newVersion = (currentKey?.key_version ?? 0) + 1

    // Generate new DEK
    const dek = crypto.randomBytes(32)
    const encryptedDek = this.wrapDEK(dek, tenantId)

    // Deactivate old keys
    await this.supabase
      .from('tenant_encryption_keys')
      .update({ is_active: false, rotated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('is_active', true)

    // Insert new key
    await this.supabase.from('tenant_encryption_keys').insert({
      tenant_id: tenantId,
      key_version: newVersion,
      encrypted_dek: encryptedDek,
      algorithm: 'aes-256-gcm',
      is_active: true,
    })

    // Invalidate cache
    this.dekCache.delete(tenantId)

    console.log(`[encryption] Rotated key for tenant ${tenantId} → version ${newVersion}`)
  }

  /* ─── Private: DEK Management ─────────────────────────── */

  /**
   * Get or create a DEK for a tenant.
   * Uses in-memory cache with TTL to avoid DB hits on every message.
   */
  private async getOrCreateDEK(
    tenantId: string
  ): Promise<{ key: Buffer; keyId: string }> {
    // Check cache
    const cached = this.dekCache.get(tenantId)
    if (cached && cached.expiresAt > Date.now()) {
      return { key: cached.key, keyId: cached.keyId }
    }

    // Load from DB
    const { data: keyRow } = await this.supabase
      .from('tenant_encryption_keys')
      .select('id, key_version, encrypted_dek')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('key_version', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (keyRow) {
      const dek = this.unwrapDEK(keyRow.encrypted_dek, tenantId)
      const keyId = `${tenantId}:${keyRow.key_version}`
      this.dekCache.set(tenantId, {
        key: dek,
        keyId,
        expiresAt: Date.now() + EncryptionService.DEK_CACHE_TTL_MS,
      })
      return { key: dek, keyId }
    }

    // No key exists — create first one
    const dek = crypto.randomBytes(32)
    const encryptedDek = this.wrapDEK(dek, tenantId)

    await this.supabase.from('tenant_encryption_keys').insert({
      tenant_id: tenantId,
      key_version: 1,
      encrypted_dek: encryptedDek,
      algorithm: 'aes-256-gcm',
      is_active: true,
    })

    const keyId = `${tenantId}:1`
    this.dekCache.set(tenantId, {
      key: dek,
      keyId,
      expiresAt: Date.now() + EncryptionService.DEK_CACHE_TTL_MS,
    })

    console.log(`[encryption] Created DEK v1 for tenant ${tenantId}`)
    return { key: dek, keyId }
  }

  /**
   * Load a specific DEK version (for decryption of older messages).
   */
  private async loadDEK(
    tenantId: string,
    keyId: string
  ): Promise<{ key: Buffer }> {
    // Parse version from keyId format "tenantId:version"
    const parts = keyId.split(':')
    const version = parseInt(parts[parts.length - 1], 10)

    if (isNaN(version)) {
      throw new Error(`Invalid key_id format: ${keyId}`)
    }

    const { data: keyRow, error } = await this.supabase
      .from('tenant_encryption_keys')
      .select('encrypted_dek')
      .eq('tenant_id', tenantId)
      .eq('key_version', version)
      .maybeSingle()

    if (error || !keyRow) {
      throw new Error(`DEK not found for tenant ${tenantId} version ${version}`)
    }

    const dek = this.unwrapDEK(keyRow.encrypted_dek, tenantId)
    return { key: dek }
  }

  /**
   * Wrap (encrypt) a DEK using HKDF-derived key from master key.
   * Phase 1B: HKDF derivation. Phase 4: Replace with KMS GenerateDataKey.
   */
  private wrapDEK(dek: Buffer, tenantId: string): string {
    if (!this.masterKey) throw new Error('No master key')

    // Derive a wrapping key per-tenant using HKDF
    const wrappingKey = crypto.hkdfSync(
      'sha256',
      this.masterKey,
      tenantId,     // salt = tenantId for per-tenant derivation
      'dek-wrap',   // info
      32            // 256-bit key
    )

    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(wrappingKey), iv)
    let encrypted = cipher.update(dek)
    encrypted = Buffer.concat([encrypted, cipher.final()])
    const authTag = cipher.getAuthTag()

    // Format: iv:authTag:ciphertext (all hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
  }

  /**
   * Unwrap (decrypt) a DEK using HKDF-derived key from master key.
   */
  private unwrapDEK(wrappedDek: string, tenantId: string): Buffer {
    if (!this.masterKey) throw new Error('No master key')

    const wrappingKey = crypto.hkdfSync(
      'sha256',
      this.masterKey,
      tenantId,
      'dek-wrap',
      32
    )

    const [ivHex, authTagHex, ciphertextHex] = wrappedDek.split(':')
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(wrappingKey),
      Buffer.from(ivHex, 'hex')
    )
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))

    let decrypted = decipher.update(Buffer.from(ciphertextHex, 'hex'))
    decrypted = Buffer.concat([decrypted, decipher.final()])

    return decrypted
  }
}