import type { EncryptionService } from '../crypto/encryption-service.js'
import type { TenantKeys } from '../utils/tenant-keys.js'

export interface AssistantMessageContextRow {
  id: string
  role: string
  content: string | null
  content_encrypted?: string | null
  content_iv?: string | null
  content_auth_tag?: string | null
  encryption_mode?: string | null
  key_id?: string | null
}

export async function decryptAssistantMessageRows(params: {
  rows: AssistantMessageContextRow[]
  encryptionService?: EncryptionService
  assistantOrgId: string | null
  tenantKeys: TenantKeys
  logPrefix?: string
}): Promise<Array<{ role: string; content: string }>> {
  const messages: Array<{ role: string; content: string }> = []
  const logPrefix = params.logPrefix ?? '[memory-context]'

  for (const row of params.rows) {
    if (row.content == null || (typeof row.content === 'string' && row.content.trim() === '')) continue
    if (
      row.encryption_mode === 'APP_LAYER' &&
      row.content_encrypted &&
      params.encryptionService &&
      params.assistantOrgId
    ) {
      try {
        const rowAad = `${params.tenantKeys.tenantKey}:${params.tenantKeys.sessionKey}:${row.id}`
        const decrypted = await params.encryptionService.decryptMessageRow(
          {
            ...row,
            content_encrypted: row.content_encrypted ?? null,
            content_iv: row.content_iv ?? null,
            content_auth_tag: row.content_auth_tag ?? null,
            encryption_mode: row.encryption_mode ?? null,
            key_id: row.key_id ?? null,
          },
          params.assistantOrgId,
          rowAad,
        )
        messages.push({ role: row.role, content: decrypted.content })
      } catch (error) {
        console.warn(`${logPrefix} Context decrypt failed for msg ${row.id}, using fallback`, error)
        messages.push({ role: row.role, content: row.content || '[encrypted]' })
      }
    } else {
      messages.push({ role: row.role, content: row.content })
    }
  }

  return messages
}
