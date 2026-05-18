import type { AgentIdentityDocumentType } from './agent-identity'
import type { SharedContextScopeRef } from './shared-context'

export type LucidCardSource = 'lucid'

export interface LucidCardMetadata {
  source: LucidCardSource
  version?: number
  source_hash?: string
  exported_at?: string
  [key: string]: unknown
}

export interface AgentCardConversationExample {
  label?: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface LucidCardKnowledgeRef {
  type: 'knowledge_page' | 'knowledge_source' | 'memory' | 'doc'
  label?: string
  ref: string
  provenance?: string
}

export interface AgentCard {
  schema_version: '1.0'
  kind: 'agent_card'
  metadata: LucidCardMetadata
  profile: {
    name: string
    username?: string
    description?: string
    bio: string[]
    lore: string[]
    adjectives: string[]
    topics: string[]
  }
  voice: {
    summary?: string
    formality?: 'casual' | 'neutral' | 'professional' | 'formal'
    warmth?: 'low' | 'medium' | 'high'
    humor?: 'none' | 'light' | 'high'
    verbosity?: 'concise' | 'balanced' | 'detailed'
    allowed_phrases: string[]
    banned_phrases: string[]
  }
  style: {
    all: string[]
    chat: string[]
    post: string[]
  }
  examples: {
    message_examples: AgentCardConversationExample[]
    post_examples: string[]
  }
  guardrails: {
    always: string[]
    never: string[]
    refusal_style?: string
    escalation_rules: string[]
  }
  knowledge: {
    snippets: string[]
    source_refs: LucidCardKnowledgeRef[]
  }
  policies: {
    memory_policy?: Record<string, unknown>
    access_policy?: Record<string, unknown>
    tool_policy?: Record<string, unknown>
  }
  modes: Array<Record<string, unknown>>
}

export interface OrganizationCard {
  schema_version: '1.0'
  kind: 'organization_card'
  metadata: LucidCardMetadata
  identity: {
    mission: string
    audience: string[]
    positioning: string[]
  }
  voice: {
    brand_voice: string[]
    default_style: string[]
    banned_phrases: string[]
  }
  policies: {
    compliance?: Record<string, unknown>
    memory?: Record<string, unknown>
    access?: Record<string, unknown>
    tool?: Record<string, unknown>
  }
  knowledge: { source_refs: LucidCardKnowledgeRef[] }
}

export interface ProjectCard {
  schema_version: '1.0'
  kind: 'project_card'
  metadata: LucidCardMetadata
  mission: {
    goal: string
    audience: string[]
    outcomes: string[]
    active_constraints: string[]
  }
  domain: {
    facts: string[]
    risks: string[]
    open_questions: string[]
  }
  voice_override: {
    style: string[]
    banned_phrases: string[]
  }
  policies: {
    memory?: Record<string, unknown>
    access?: Record<string, unknown>
    tool?: Record<string, unknown>
  }
  knowledge: { source_refs: LucidCardKnowledgeRef[] }
}

export interface LucidCardResolutionConflict {
  key: string
  winner: 'organization' | 'project' | 'team' | 'agent' | 'user'
  overridden: Array<'organization' | 'project' | 'team' | 'agent' | 'user'>
  message: string
}

export interface LucidCardResolution {
  organization_card: OrganizationCard | null
  project_card: ProjectCard | null
  team_context_summary: { scopes: SharedContextScopeRef[]; records: number } | null
  agent_card: AgentCard
  user_preferences: { records: number } | null
  conflicts: LucidCardResolutionConflict[]
  prompt_sections: string[]
  prompt_budget: { chars: number; cap: number }
}

export interface LucidCardValidationIssue {
  severity: 'info' | 'warning' | 'blocking'
  code: string
  path: string
  message: string
}

export interface LucidCardValidationReport {
  status: 'pass' | 'warning' | 'fail'
  issues: LucidCardValidationIssue[]
  metrics: { prompt_chars: number; examples: number; knowledge_refs: number }
}

export interface LucidCardImportPreview {
  card: AgentCard
  validation: LucidCardValidationReport
  resolution: LucidCardResolution
  diff: {
    assistant: Array<{ field: string; before: unknown; after: unknown }>
    identity_documents: Array<{ document_type: AgentIdentityDocumentType; action: 'create' | 'update'; summary: string }>
    shared_context_records: Array<{ record_type: string; title: string; body: string }>
  }
  can_apply: boolean
}
