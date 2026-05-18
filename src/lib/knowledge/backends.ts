import type { KnowledgePromptPacket, RetrievedKnowledge } from './types'

export type KnowledgeBackendId = 'local_db' | 'mission_control_evidence' | 'lucid_l2'
export type KnowledgeBackendCapability =
  | 'retrieve'
  | 'write'
  | 'project'
  | 'verify'
  | 'restore'

export interface KnowledgeBackendContext {
  orgId: string
  projectId?: string | null
  teamId?: string | null
  assistantId?: string | null
  scopedUserId?: string | null
}

export interface KnowledgeBackendReadInput extends KnowledgeBackendContext {
  query: string
  limit?: number
  proofMode?: 'off' | 'optional' | 'required'
}

export interface KnowledgeBackendWriteInput extends KnowledgeBackendContext {
  contentHash: string
  payload: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface KnowledgeBackendProof {
  backendId: KnowledgeBackendId
  localResourceId?: string | null
  contentHash: string
  receiptHash?: string | null
  snapshotCid?: string | null
  anchorEpochId?: string | null
  anchorStatus?: 'pending' | 'anchored' | 'verified' | 'failed'
  verificationStatus?: 'unverified' | 'verified' | 'failed'
}

export interface KnowledgeBackend {
  id: KnowledgeBackendId
  label: string
  capabilities: KnowledgeBackendCapability[]
  localFirst: boolean
  defaultForPromptPackets: boolean
  retrieve?(input: KnowledgeBackendReadInput): Promise<RetrievedKnowledge[]>
  write?(input: KnowledgeBackendWriteInput): Promise<{ localResourceId?: string | null; proof?: KnowledgeBackendProof | null }>
  verify?(proof: KnowledgeBackendProof): Promise<KnowledgeBackendProof>
  restore?(input: KnowledgeBackendReadInput): Promise<KnowledgePromptPacket | null>
}

export const localKnowledgeBackend: KnowledgeBackend = {
  id: 'local_db',
  label: 'Local Knowledge DB',
  capabilities: ['retrieve', 'write'],
  localFirst: true,
  defaultForPromptPackets: true,
}

export const missionControlEvidenceBackend: KnowledgeBackend = {
  id: 'mission_control_evidence',
  label: 'Mission Control Evidence',
  capabilities: ['retrieve', 'write', 'verify'],
  localFirst: true,
  defaultForPromptPackets: true,
}

export const lucidL2VerifiableMemoryBackend: KnowledgeBackend = {
  id: 'lucid_l2',
  label: 'Lucid-L2 Verifiable Memory',
  capabilities: ['project', 'verify', 'restore'],
  localFirst: false,
  defaultForPromptPackets: false,
}

export const knowledgeBackends = Object.freeze([
  localKnowledgeBackend,
  missionControlEvidenceBackend,
  lucidL2VerifiableMemoryBackend,
])
