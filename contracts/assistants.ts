/**
 * AI Assistant Configuration Schemas
 * 
 * Pure TypeScript + Zod - no framework dependencies.
 * Shared between src/ (Next.js) and worker/ (Node.js).
 */

import { z } from 'zod'

// =============================================================================
// AI ASSISTANT (Main entity)
// =============================================================================

export const AIAssistantSchema = z.object({
  id: z.string().uuid(),
  
  // Multi-tenancy (follows LucidMerged hierarchy)
  org_id: z.string().uuid(),
  project_id: z.string().uuid(),
  env_id: z.string().uuid(),
  
  // Identity
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable(),
  avatar_url: z.string().url().nullable(),
  
  // AI Configuration
  system_prompt: z.string().max(10000).nullable(),
  lucid_model: z.string().default('lucid-auto'), // Lucid-L2 model identifier
  temperature: z.number().min(0).max(2).default(0.7),
  max_tokens: z.number().int().min(100).max(32000).default(4096),
  
  // Tool configuration (n8n nodes this assistant can use)
  enabled_n8n_nodes: z.array(z.string()).default([]),
  
  // Memory configuration
  memory_enabled: z.boolean().default(true),
  memory_window_size: z.number().int().min(1).max(100).default(10), // Messages to include in context
  
  // Lucid Layer integration
  passport_id: z.string().uuid().nullable(), // For portable identity
  
  // Channel integrations
  telegram_connected: z.boolean().default(false),
  telegram_bot_token: z.string().nullable(),
  telegram_webhook_verified_at: z.string().datetime().nullable(),
  
  whatsapp_connected: z.boolean().default(false),
  whatsapp_phone_number_id: z.string().nullable(),
  whatsapp_business_account_id: z.string().nullable(),
  whatsapp_access_token_encrypted: z.string().nullable(),
  whatsapp_verified_at: z.string().datetime().nullable(),
  whatsapp_webhook_verify_token: z.string().nullable(),
  
  // Status
  is_active: z.boolean().default(true),
  
  // Ownership
  created_by: z.string().uuid().nullable(),
  
  // Timestamps
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable(), // Soft delete
})

export type AIAssistant = z.infer<typeof AIAssistantSchema>

// For creating new assistants
export const AIAssistantInsertSchema = AIAssistantSchema.pick({
  org_id: true,
  project_id: true,
  env_id: true,
  name: true,
  description: true,
  avatar_url: true,
  system_prompt: true,
  lucid_model: true,
  temperature: true,
  max_tokens: true,
  enabled_n8n_nodes: true,
  memory_enabled: true,
  memory_window_size: true,
  passport_id: true,
  created_by: true,
}).partial({
  description: true,
  avatar_url: true,
  system_prompt: true,
  lucid_model: true,
  temperature: true,
  max_tokens: true,
  enabled_n8n_nodes: true,
  memory_enabled: true,
  memory_window_size: true,
  passport_id: true,
  created_by: true,
})

export type AIAssistantInsert = z.infer<typeof AIAssistantInsertSchema>

// For updating assistants
export const AIAssistantUpdateSchema = AIAssistantInsertSchema.partial()

export type AIAssistantUpdate = z.infer<typeof AIAssistantUpdateSchema>

// =============================================================================
// CONVERSATION / SESSION
// =============================================================================

export const AssistantConversationSchema = z.object({
  id: z.string().uuid(),
  assistant_id: z.string().uuid(),
  channel_id: z.string().uuid(),
  
  // External user who started this conversation
  external_user_id: z.string(),
  external_chat_id: z.string(),
  
  // Metadata
  title: z.string().nullable(), // Auto-generated or user-set
  
  // Status
  is_active: z.boolean().default(true),
  
  // Timestamps
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  last_message_at: z.string().datetime().nullable(),
})

export type AssistantConversation = z.infer<typeof AssistantConversationSchema>

// =============================================================================
// CONVERSATION MESSAGES (Transcript)
// =============================================================================

export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool'])

export type MessageRole = z.infer<typeof MessageRoleSchema>

export const AssistantMessageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  
  // Message content
  role: MessageRoleSchema,
  content: z.string(),
  
  // Tool call info (if role === 'tool')
  tool_name: z.string().nullable(),
  tool_input: z.record(z.string(), z.unknown()).nullable(),
  tool_output: z.record(z.string(), z.unknown()).nullable(),
  
  // External reference (for user messages from channels)
  external_message_id: z.string().nullable(),
  
  // Token usage tracking
  tokens_prompt: z.number().int().nullable(),
  tokens_completion: z.number().int().nullable(),
  
  // Timestamps
  created_at: z.string().datetime(),
})

export type AssistantMessage = z.infer<typeof AssistantMessageSchema>

// For inserting messages
export const AssistantMessageInsertSchema = AssistantMessageSchema.pick({
  conversation_id: true,
  role: true,
  content: true,
  tool_name: true,
  tool_input: true,
  tool_output: true,
  external_message_id: true,
  tokens_prompt: true,
  tokens_completion: true,
}).partial({
  tool_name: true,
  tool_input: true,
  tool_output: true,
  external_message_id: true,
  tokens_prompt: true,
  tokens_completion: true,
})

export type AssistantMessageInsert = z.infer<typeof AssistantMessageInsertSchema>

// =============================================================================
// MEMORY (Long-term extracted facts)
// =============================================================================

export const AssistantMemorySchema = z.object({
  id: z.string().uuid(),
  assistant_id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable(), // Source conversation
  
  // Memory content
  content: z.string(), // Natural language fact
  embedding: z.array(z.number()).nullable(), // For similarity search (pgvector)
  
  // Categorization
  category: z.enum(['fact', 'preference', 'instruction', 'context']).default('fact'),
  importance: z.number().min(0).max(1).default(0.5), // For relevance scoring
  
  // Source tracking
  source_message_id: z.string().uuid().nullable(),
  
  // Timestamps
  created_at: z.string().datetime(),
  last_accessed_at: z.string().datetime().nullable(),
})

export type AssistantMemory = z.infer<typeof AssistantMemorySchema>

// =============================================================================
// ASSISTANT TEMPLATES (Pre-configured assistants)
// =============================================================================

export const AssistantTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string(), // Emoji or icon name
  
  // Pre-configured values
  system_prompt: z.string(),
  lucid_model: z.string(),
  enabled_n8n_nodes: z.array(z.string()),
  
  // Categorization
  category: z.enum(['personal', 'business', 'developer', 'creative']),
  is_featured: z.boolean().default(false),
})

export type AssistantTemplate = z.infer<typeof AssistantTemplateSchema>

// Built-in templates
export const ASSISTANT_TEMPLATES: AssistantTemplate[] = [
  {
    id: 'personal',
    name: 'Personal Assistant',
    description: 'Calendar, email, notes, web search',
    icon: '🏠',
    system_prompt: `You are a helpful personal assistant. You help with:
- Managing calendar and scheduling
- Reading and drafting emails
- Taking and organizing notes
- Web searches for information

Be concise, friendly, and proactive. Remember user preferences.`,
    lucid_model: 'lucid-auto',
    enabled_n8n_nodes: ['n8n-nodes-base.googleCalendar', 'n8n-nodes-base.gmail', 'n8n-nodes-base.notion'],
    category: 'personal',
    is_featured: true,
  },
  {
    id: 'founder',
    name: 'Founder Mode',
    description: 'All personal tools + Slack, Linear, analytics',
    icon: '🚀',
    system_prompt: `You are an executive assistant for a startup founder. You help with:
- Managing calendar and meetings
- Tracking tasks in Linear
- Summarizing Slack channels
- Monitoring key metrics
- Drafting communications

Be efficient, data-driven, and anticipate needs. Prioritize high-impact activities.`,
    lucid_model: 'lucid-auto',
    enabled_n8n_nodes: ['n8n-nodes-base.googleCalendar', 'n8n-nodes-base.slack', 'n8n-nodes-base.linear', 'n8n-nodes-base.notion'],
    category: 'business',
    is_featured: true,
  },
  {
    id: 'developer',
    name: 'Dev Assistant',
    description: 'GitHub, docs search, code review',
    icon: '👨‍💻',
    system_prompt: `You are a developer assistant. You help with:
- Searching documentation and Stack Overflow
- GitHub issue and PR management
- Code explanations and reviews
- Technical research

Be precise, include code examples when helpful. Cite sources.`,
    lucid_model: 'lucid-auto',
    enabled_n8n_nodes: ['n8n-nodes-base.github', 'n8n-nodes-base.httpRequest'],
    category: 'developer',
    is_featured: false,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Web search only - maximum privacy',
    icon: '🔒',
    system_prompt: `You are a minimal assistant focused on privacy. You can:
- Answer questions from your knowledge
- Search the web when needed

No integrations, no data storage beyond this conversation.`,
    lucid_model: 'lucid-auto',
    enabled_n8n_nodes: [],
    category: 'personal',
    is_featured: false,
  },
]
