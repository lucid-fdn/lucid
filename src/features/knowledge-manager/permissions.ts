export type KnowledgeManagerRole = 'owner' | 'admin' | 'member' | 'viewer' | string | null | undefined

export interface KnowledgeManagerPermissions {
  canRead: boolean
  canWrite: boolean
  canGovern: boolean
}

export function resolveKnowledgeManagerPermissions(role: KnowledgeManagerRole): KnowledgeManagerPermissions {
  const normalized = role ?? null
  const elevated = normalized === 'owner' || normalized === 'admin'
  return {
    canRead: Boolean(normalized),
    canWrite: elevated,
    canGovern: elevated,
  }
}
