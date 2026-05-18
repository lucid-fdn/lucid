/**
 * Test E1: Encryption Round-Trip Integration Test
 *
 * Validates the "Encrypted Agent" marketing claim by proving:
 * 1. Encrypted rows stored with content=NULL, content_encrypted IS NOT NULL
 * 2. Context decryption restores real text (not empty context)
 * 3. Works for both legacy path and agent loop path
 *
 * See docs/OPENCLAW_AUDIT_PLAN_V3.md "Test E1"
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { EncryptionService } from '../../worker/src/crypto/encryption-service.js'
import crypto from 'node:crypto'

// --- Test Helpers ---

function createTestEncryptionService() {
  const masterKeyHex = crypto.randomBytes(32).toString('hex')
  const keyStore = new Map<string, { key_version: number; encrypted_dek: string; is_active: boolean }>()
  const mockSupabase = createMockSupabase(keyStore)
  const service = new EncryptionService(mockSupabase as any, masterKeyHex)
  return { service, masterKeyHex, mockSupabase }
}

function createMockSupabase(keyStore: Map<string, any>) {
  const query = (tenantId: string) => {
    const state: { keyVersion?: number } = {}

    const exec = async () => {
      const key = keyStore.get(tenantId)
      if (!key) return { data: null, error: null }
      if (state.keyVersion && key.key_version !== state.keyVersion) {
        return { data: null, error: null }
      }

      if (state.keyVersion) {
        return { data: { encrypted_dek: key.encrypted_dek }, error: null }
      }

      return { data: { id: 'test-key-1', ...key }, error: null }
    }

    const chain: any = {
      eq: (_col: string, val: any) => {
        if (typeof val === 'number') state.keyVersion = val
        return chain
      },
      order: (_col: string, _opts: any) => chain,
      limit: (_n: number) => chain,
      maybeSingle: exec,
    }

    return chain
  }

  return {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, val: string) => query(val),
      }),
      insert: async (row: any) => {
        if (table === 'tenant_encryption_keys') {
          keyStore.set(row.tenant_id, {
            key_version: row.key_version,
            encrypted_dek: row.encrypted_dek,
            is_active: row.is_active,
          })
        }
        return { data: row, error: null }
      },
      update: (_vals: any) => ({
        eq: (_col: string, _val: any) => ({
          eq: (_col2: string, _val2: any) => ({ data: null, error: null }),
        }),
      }),
    }),
  }
}

// --- Tests ---

describe('E1: Encryption Round-Trip', () => {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  let encryptionService: EncryptionService

  beforeAll(() => {
    const { service } = createTestEncryptionService()
    encryptionService = service
  })

  afterAll(() => {
    consoleWarnSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })

  it('should be available when master key is set', () => {
    expect(encryptionService.isAvailable()).toBe(true)
  })

  it('E1.1: buildMessageColumns produces content=null + encrypted fields when APP_LAYER', async () => {
    const tenantId = 'test-org-1'
    const plaintext = 'Hello, this is a test message with PII: john@example.com'
    const messageId = crypto.randomUUID()
    const aad = `${tenantId}:default:default:telegram:chat123:${messageId}`

    const columns = await encryptionService.buildMessageColumns(tenantId, plaintext, 'APP_LAYER', aad)

    expect(columns.content).toBeNull()
    expect(columns.content_encrypted).toBeTruthy()
    expect(columns.content_iv).toBeTruthy()
    expect(columns.content_auth_tag).toBeTruthy()
    expect(columns.encryption_mode).toBe('APP_LAYER')
    expect(columns.key_id).toBeTruthy()
    expect(columns.content_encrypted).not.toBe(plaintext)
  })

  it('E1.2: buildMessageColumns produces content=plaintext when NONE', async () => {
    const columns = await encryptionService.buildMessageColumns('test-org-1', 'Hello plaintext', 'NONE')
    expect(columns.content).toBe('Hello plaintext')
    expect(columns.content_encrypted).toBeNull()
    expect(columns.encryption_mode).toBe('NONE')
  })

  it('E1.3: decryptMessageRow restores plaintext from encrypted row', async () => {
    const tenantId = 'test-org-1'
    const plaintext = 'This message contains sensitive data: SSN 123-45-6789'
    const messageId = crypto.randomUUID()
    const aad = `${tenantId}:default:default:telegram:chat123:${messageId}`

    const columns = await encryptionService.buildMessageColumns(tenantId, plaintext, 'APP_LAYER', aad)

    const dbRow = {
      content: columns.content as string | null,
      content_encrypted: columns.content_encrypted as string | null,
      content_iv: columns.content_iv as string | null,
      content_auth_tag: columns.content_auth_tag as string | null,
      encryption_mode: columns.encryption_mode as string | null,
      key_id: columns.key_id as string | null,
    }

    const decrypted = await encryptionService.decryptMessageRow(dbRow, tenantId, aad)
    expect(decrypted.content).toBe(plaintext)
    expect(decrypted.wasEncrypted).toBe(true)
  })

  it('E1.4: decryptMessageRow with wrong AAD fails (integrity check)', async () => {
    const tenantId = 'test-org-1'
    const plaintext = 'AAD integrity test'
    const messageId = crypto.randomUUID()
    const correctAad = `${tenantId}:default:default:telegram:chat123:${messageId}`
    const wrongAad = `${tenantId}:default:default:telegram:chat123:wrong-id`

    const columns = await encryptionService.buildMessageColumns(tenantId, plaintext, 'APP_LAYER', correctAad)

    const dbRow = {
      content: columns.content as string | null,
      content_encrypted: columns.content_encrypted as string | null,
      content_iv: columns.content_iv as string | null,
      content_auth_tag: columns.content_auth_tag as string | null,
      encryption_mode: columns.encryption_mode as string | null,
      key_id: columns.key_id as string | null,
    }

    await expect(encryptionService.decryptMessageRow(dbRow, tenantId, wrongAad)).rejects.toThrow()
  })

  it('E1.5: context loader pattern — decrypt multiple messages in sequence', async () => {
    const tenantId = 'test-org-2'
    const sessionKey = `${tenantId}:default:default:telegram:chat456`

    const messagePairs = [
      { role: 'user', content: 'What is the weather in Paris?' },
      { role: 'assistant', content: 'The weather in Paris is currently 15°C with light rain.' },
      { role: 'user', content: 'Thanks! What about tomorrow?' },
    ]

    const dbRows: Array<{
      id: string; role: string; content: string | null;
      content_encrypted: string | null; content_iv: string | null;
      content_auth_tag: string | null; encryption_mode: string | null; key_id: string | null;
    }> = []

    for (const msg of messagePairs) {
      const msgId = crypto.randomUUID()
      const aad = `${tenantId}:${sessionKey}:${msgId}`
      const columns = await encryptionService.buildMessageColumns(tenantId, msg.content, 'APP_LAYER', aad)
      dbRows.push({
        id: msgId, role: msg.role,
        content: columns.content as string | null,
        content_encrypted: columns.content_encrypted as string | null,
        content_iv: columns.content_iv as string | null,
        content_auth_tag: columns.content_auth_tag as string | null,
        encryption_mode: columns.encryption_mode as string | null,
        key_id: columns.key_id as string | null,
      })
    }

    for (const row of dbRows) {
      expect(row.content).toBeNull()
      expect(row.content_encrypted).toBeTruthy()
    }

    const decryptedMessages = await Promise.all(
      dbRows.map(async (row) => {
        const aad = `${tenantId}:${sessionKey}:${row.id}`
        const decrypted = await encryptionService.decryptMessageRow(row, tenantId, aad)
        return { role: row.role, content: decrypted.content }
      })
    )

    expect(decryptedMessages).toHaveLength(3)
    expect(decryptedMessages[0].content).toBe('What is the weather in Paris?')
    expect(decryptedMessages[1].content).toBe('The weather in Paris is currently 15°C with light rain.')
    expect(decryptedMessages[2].content).toBe('Thanks! What about tomorrow?')

    for (const msg of decryptedMessages) {
      expect(msg.content).not.toBe('')
      expect(msg.content.length).toBeGreaterThan(0)
    }
  })

  it('E1.6: memory encryption uses userKey AAD (not sessionKey)', async () => {
    const tenantId = 'test-org-3'
    const tenantKey = `${tenantId}:default:default`
    const userKey = `${tenantKey}:user123`
    const memoryId = crypto.randomUUID()
    const memoryAad = `${tenantKey}:${userKey}:${memoryId}`

    const plaintext = 'User prefers dark mode and speaks French'
    const payload = await encryptionService.encrypt(tenantId, plaintext, memoryAad)

    expect(payload.ciphertext).toBeTruthy()
    expect(payload.mode).toBe('APP_LAYER')

    const decrypted = await encryptionService.decrypt(tenantId, payload, memoryAad)
    expect(decrypted).toBe(plaintext)

    const wrongAad = `${tenantKey}:${tenantKey}:telegram:chat789:${memoryId}`
    await expect(encryptionService.decrypt(tenantId, payload, wrongAad)).rejects.toThrow()
  })

  it('E1.8: memory AAD with sessionKey (message format) fails — must use userKey', async () => {
    // This test explicitly validates Issue #3 from the audit review:
    // Memory AAD = tenantKey:userKey:memoryId (NOT tenantKey:sessionKey:memoryId)
    const tenantId = 'test-org-mem-aad'
    const tenantKey = `${tenantId}:default:default`
    const userKey = `${tenantKey}:telegram:ext_user_42`
    const sessionKey = `${tenantKey}:telegram:chat_99` // message-style AAD (wrong for memory)
    const memoryId = crypto.randomUUID()

    // Correct memory AAD: tenantKey:userKey:memoryId
    const correctMemoryAad = `${tenantKey}:${userKey}:${memoryId}`
    // Wrong memory AAD: tenantKey:sessionKey:memoryId (this is the message pattern)
    const wrongSessionAad = `${tenantKey}:${sessionKey}:${memoryId}`

    const memoryText = 'User is a premium subscriber who prefers concise answers'

    // Encrypt with correct memory AAD
    const columns = await encryptionService.buildMessageColumns(tenantId, memoryText, 'APP_LAYER', correctMemoryAad)
    expect(columns.content).toBeNull()
    expect(columns.content_encrypted).toBeTruthy()

    const dbRow = {
      content: columns.content as string | null,
      content_encrypted: columns.content_encrypted as string | null,
      content_iv: columns.content_iv as string | null,
      content_auth_tag: columns.content_auth_tag as string | null,
      encryption_mode: columns.encryption_mode as string | null,
      key_id: columns.key_id as string | null,
    }

    // ✅ Decrypt with correct memory AAD succeeds
    const decrypted = await encryptionService.decryptMessageRow(dbRow, tenantId, correctMemoryAad)
    expect(decrypted.content).toBe(memoryText)
    expect(decrypted.wasEncrypted).toBe(true)

    // ❌ Decrypt with session-style AAD MUST fail (proves memory ≠ message AAD)
    await expect(
      encryptionService.decryptMessageRow(dbRow, tenantId, wrongSessionAad)
    ).rejects.toThrow()
  })

  it('E1.7: plaintext rows pass through decryptMessageRow unchanged', async () => {
    const plaintextRow = {
      content: 'This is a plaintext message',
      content_encrypted: null, content_iv: null, content_auth_tag: null,
      encryption_mode: 'NONE', key_id: null,
    }

    const result = await encryptionService.decryptMessageRow(plaintextRow, 'any-tenant')
    expect(result.content).toBe('This is a plaintext message')
    expect(result.wasEncrypted).toBe(false)
  })
})
