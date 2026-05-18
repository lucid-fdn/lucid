import 'server-only'

import type {
  AgentIdentityDocument,
  AgentIdentityDocumentType,
  AgentIdentityPackage,
  CreateAgentIdentityDocumentInput,
  UpdateAgentIdentityDocumentInput,
} from '@contracts/agent-identity'
import { supabase, ErrorService } from './client'

interface AssistantIdentitySeed {
  id: string
  org_id: string
  project_id: string | null
  soul_content: string | null
  name: string | null
  passport_id: string | null
  agent_wallets?: Array<{
    chain_type?: string | null
    address?: string | null
    privy_wallet_id?: string | null
    status?: string | null
  }> | null
}

const AGENT_IDENTITY_DOCUMENT_SELECT =
  'id, workspace_id, project_id, agent_id, document_type, version, status, content, passport_id, wallet_address, identity_anchor, created_by, created_at, updated_at, supersedes_document_id' as const

async function getAssistantSeed(agentId: string): Promise<AssistantIdentitySeed | null> {
  const { data, error } = await supabase
    .from('ai_assistants')
    .select('id, org_id, project_id, soul_content, name, passport_id, agent_wallets(chain_type, address, privy_wallet_id, status)')
    .eq('id', agentId)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'getAssistantSeed', agentId },
      tags: { layer: 'db', route: 'agent-identity' },
    })
    return null
  }

  return data as AssistantIdentitySeed | null
}

function getPrimaryIdentityWallet(assistant: AssistantIdentitySeed) {
  const wallets = Array.isArray(assistant.agent_wallets) ? assistant.agent_wallets : []
  return wallets.find((wallet) => wallet.status === 'active' && wallet.address) ?? wallets.find((wallet) => wallet.address) ?? null
}

export async function listAgentIdentityDocuments(agentId: string): Promise<AgentIdentityDocument[]> {
  const { data, error } = await supabase
    .from('agent_identity_documents')
    .select(AGENT_IDENTITY_DOCUMENT_SELECT)
    .eq('agent_id', agentId)
    .order('document_type', { ascending: true })
    .order('version', { ascending: false })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'listAgentIdentityDocuments', agentId },
      tags: { layer: 'db', route: 'agent-identity' },
    })
    return []
  }

  return (data ?? []) as AgentIdentityDocument[]
}

export async function getLatestAgentIdentityDocuments(agentId: string): Promise<AgentIdentityDocument[]> {
  const docs = await listAgentIdentityDocuments(agentId)
  const latest = new Map<AgentIdentityDocumentType, AgentIdentityDocument>()

  for (const doc of docs) {
    if (doc.status === 'archived') continue
    if (!latest.has(doc.document_type)) latest.set(doc.document_type, doc)
  }

  return [...latest.values()]
}

export async function createAgentIdentityDocument(
  agentId: string,
  input: CreateAgentIdentityDocumentInput,
  userId?: string | null,
): Promise<AgentIdentityDocument | null> {
  const assistant = await getAssistantSeed(agentId)
  if (!assistant) return null

  const currentDocs = await listAgentIdentityDocuments(agentId)
  const wallet = getPrimaryIdentityWallet(assistant)
  const previous = currentDocs.find((doc) => doc.document_type === input.document_type && doc.status === 'active') ?? null
  const version = Math.max(
    0,
    ...currentDocs
      .filter((doc) => doc.document_type === input.document_type)
      .map((doc) => doc.version),
  ) + 1

  if (previous) {
    await supabase
      .from('agent_identity_documents')
      .update({ status: 'superseded' })
      .eq('id', previous.id)
  }

  const insertRow = {
    workspace_id: assistant.org_id,
    project_id: assistant.project_id,
    agent_id: agentId,
    document_type: input.document_type,
    version,
    status: input.status,
    content: input.content,
    passport_id: assistant.passport_id,
    wallet_address: wallet?.address ?? null,
    identity_anchor: {
      passport_id: assistant.passport_id,
      wallet_address: wallet?.address ?? null,
      wallet_chain_type: wallet?.chain_type ?? null,
      privy_wallet_id: wallet?.privy_wallet_id ?? null,
    },
    created_by: userId ?? null,
    supersedes_document_id: previous?.id ?? null,
  }

  let { data, error } = await supabase
    .from('agent_identity_documents')
    .insert(insertRow)
    .select()
    .single()

  if (error && userId && error.code === '23503' && /created_by/i.test(error.message ?? '')) {
    const retry = await supabase
      .from('agent_identity_documents')
      .insert({ ...insertRow, created_by: null })
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'createAgentIdentityDocument', agentId, documentType: input.document_type },
      tags: { layer: 'db', route: 'agent-identity' },
    })
    return null
  }

  return data as AgentIdentityDocument
}

export async function updateAgentIdentityDocument(
  documentId: string,
  agentId: string,
  input: UpdateAgentIdentityDocumentInput,
): Promise<AgentIdentityDocument | null> {
  const { data, error } = await supabase
    .from('agent_identity_documents')
    .update(input)
    .eq('id', documentId)
    .eq('agent_id', agentId)
    .select()
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { fn: 'updateAgentIdentityDocument', documentId, agentId },
      tags: { layer: 'db', route: 'agent-identity' },
    })
    return null
  }

  return data as AgentIdentityDocument
}

export async function buildAgentIdentityPackage(agentId: string): Promise<AgentIdentityPackage | null> {
  const assistant = await getAssistantSeed(agentId)
  if (!assistant) return null

  const latestDocs = await getLatestAgentIdentityDocuments(agentId)
  const wallet = getPrimaryIdentityWallet(assistant)
  const web3Identity = assistant.passport_id || wallet?.address
    ? {
        passportId: assistant.passport_id,
        walletAddress: wallet?.address ?? null,
        anchor: {
          passport_id: assistant.passport_id,
          wallet_address: wallet?.address ?? null,
          wallet_chain_type: wallet?.chain_type ?? null,
          privy_wallet_id: wallet?.privy_wallet_id ?? null,
        },
      }
    : null
  const documents: AgentIdentityPackage['documents'] = {}
  for (const doc of latestDocs) documents[doc.document_type] = doc

  const compiledPromptSections = latestDocs
    .filter((doc) => doc.status === 'active')
    .map((doc) => {
      const summary = typeof doc.content.summary === 'string' ? doc.content.summary.trim() : ''
      if (doc.content.source === 'agent_card' && summary) return `## ${doc.document_type}\n${summary}`
      return `## ${doc.document_type}\n${JSON.stringify(doc.content, null, 2)}`
    })

  if (!documents.SOUL && assistant.soul_content?.trim()) {
    compiledPromptSections.unshift(`## SOUL\n${assistant.soul_content.trim()}`)
  }

  return {
    agentId,
    workspaceId: assistant.org_id,
    projectId: assistant.project_id,
    web3Identity,
    documents,
    compiledPromptSections,
  }
}
