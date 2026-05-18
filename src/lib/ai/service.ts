/**
 * AI Service Layer (Server-only)
 * Centralized database operations for AI features
 * Uses server-side Supabase client for proper auth context
 */

import 'server-only';
import { cache } from 'react';
import { ErrorService } from '@/lib/errors/error-service';
import type {
  Conversation,
  CreateConversationInput,
  Message,
  CreateMessageInput,
  Document,
  CreateDocumentInput,
  CreateDocumentChunkInput,
  ProcessorRun,
  CreateProcessorRunInput,
  SearchResult,
} from './types';

const CONVERSATION_SELECT =
  'id, org_id, project_id, env_id, user_id, title, model, system_prompt, config, total_input_tokens, total_output_tokens, total_cost_cents, created_at, updated_at' as const;

const MESSAGE_SELECT =
  'id, conversation_id, role, content, model, input_tokens, output_tokens, cost_cents, metadata, created_at' as const;

const DOCUMENT_SELECT =
  'id, org_id, project_id, user_id, title, file_path, content, content_hash, status, chunk_count, metadata, created_at, updated_at' as const;

// Helper to get server-side Supabase client
async function getSupabase() {
  const { createClient } = await import('@/lib/supabase/server');
  return createClient();
}

// ============================================================================
// CONVERSATIONS
// ============================================================================

/**
 * Get conversation by ID with caching
 */
export const getConversation = cache(async (conversationId: string, userId: string): Promise<Conversation | null> => {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { conversationId, userId, table: 'conversations', operation: 'SELECT' },
      tags: { layer: 'ai-service', table: 'conversations' },
    });
    return null;
  }

  return data;
});

/**
 * Get all conversations for a user in a project
 */
export async function getConversations(
  userId: string,
  projectId: string,
  limit: number = 50
): Promise<Conversation[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { userId, projectId, table: 'conversations', operation: 'SELECT' },
      tags: { layer: 'ai-service', table: 'conversations' },
    });
    return [];
  }

  return data || [];
}

/**
 * Create a new conversation
 */
export async function createConversation(input: CreateConversationInput): Promise<Conversation> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('conversations')
    .insert(input as unknown as Record<string, unknown>)
    .select()
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { model: input.model, table: 'conversations', operation: 'INSERT' },
      tags: { layer: 'ai-service', table: 'conversations' },
    });
    throw error;
  }

  return data;
}

/**
 * Update conversation (title, config, usage)
 */
export async function updateConversation(
  conversationId: string,
  updates: Partial<Pick<Conversation, 'title' | 'config' | 'total_input_tokens' | 'total_output_tokens' | 'total_cost_cents'>>
): Promise<Conversation> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('conversations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .select()
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { conversationId, updateFields: Object.keys(updates), table: 'conversations', operation: 'UPDATE' },
      tags: { layer: 'ai-service', table: 'conversations' },
    });
    throw error;
  }

  return data;
}

/**
 * Delete conversation (cascade deletes messages)
 */
export async function deleteConversation(conversationId: string, userId: string): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId)
    .eq('user_id', userId);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { conversationId, userId, table: 'conversations', operation: 'DELETE' },
      tags: { layer: 'ai-service', table: 'conversations' },
    });
    throw error;
  }
}

// ============================================================================
// MESSAGES
// ============================================================================

/**
 * Get messages for a conversation
 */
export async function getMessages(conversationId: string, limit: number = 100): Promise<Message[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { conversationId, table: 'messages', operation: 'SELECT' },
      tags: { layer: 'ai-service', table: 'messages' },
    });
    return [];
  }

  return data || [];
}

/**
 * Create a message
 */
export async function createMessage(input: CreateMessageInput): Promise<Message> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('messages')
    .insert(input as unknown as Record<string, unknown>)
    .select()
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { conversationId: input.conversation_id, role: input.role, table: 'messages', operation: 'INSERT' },
      tags: { layer: 'ai-service', table: 'messages' },
    });
    throw error;
  }

  return data;
}

/**
 * Get conversation with messages (optimized single query)
 */
export async function getConversationWithMessages(
  conversationId: string,
  userId: string
): Promise<{ conversation: Conversation; messages: Message[] } | null> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('get_conversation_with_messages', {
    p_conversation_id: conversationId,
    p_user_id: userId,
  });

  if (error || !data || data.length === 0) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { conversationId, userId, function: 'get_conversation_with_messages', operation: 'RPC' },
        tags: { layer: 'ai-service', function: 'rpc' },
      });
    }
    return null;
  }

  return {
    conversation: data[0].conversation_data,
    messages: data[0].messages_data || [],
  };
}

// ============================================================================
// DOCUMENTS (RAG)
// ============================================================================

/**
 * Get document by ID
 */
export async function getDocument(documentId: string): Promise<Document | null> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('documents')
    .select(DOCUMENT_SELECT)
    .eq('id', documentId)
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { documentId, table: 'documents', operation: 'SELECT' },
      tags: { layer: 'ai-service', table: 'documents' },
    });
    return null;
  }

  return data;
}

/**
 * Get documents for a project
 */
export async function getDocuments(projectId: string, limit: number = 100): Promise<Document[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('documents')
    .select(DOCUMENT_SELECT)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { projectId, table: 'documents', operation: 'SELECT' },
      tags: { layer: 'ai-service', table: 'documents' },
    });
    return [];
  }

  return data || [];
}

/**
 * Create a document
 */
export async function createDocument(input: CreateDocumentInput): Promise<Document> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('documents')
    .insert({ ...input, status: 'pending' })
    .select()
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { title: input.title, projectId: input.project_id, table: 'documents', operation: 'INSERT' },
      tags: { layer: 'ai-service', table: 'documents' },
    });
    throw error;
  }

  return data;
}

/**
 * Update document status
 */
export async function updateDocumentStatus(
  documentId: string,
  status: 'pending' | 'processing' | 'ready' | 'error',
  chunkCount?: number
): Promise<void> {
  const supabase = await getSupabase();
  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (chunkCount !== undefined) updates.chunk_count = chunkCount;

  const { error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', documentId);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { documentId, status, table: 'documents', operation: 'UPDATE' },
      tags: { layer: 'ai-service', table: 'documents' },
    });
    throw error;
  }
}

/**
 * Delete document (cascade deletes chunks)
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { documentId, table: 'documents', operation: 'DELETE' },
      tags: { layer: 'ai-service', table: 'documents' },
    });
    throw error;
  }
}

// ============================================================================
// DOCUMENT CHUNKS (Vector Embeddings)
// ============================================================================

/**
 * Create document chunks in batch
 */
export async function createDocumentChunks(chunks: CreateDocumentChunkInput[]): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('document_chunks')
    .insert(chunks as unknown as Record<string, unknown>[]);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { chunkCount: chunks.length, table: 'document_chunks', operation: 'INSERT' },
      tags: { layer: 'ai-service', table: 'document_chunks' },
    });
    throw error;
  }
}

/**
 * Search document chunks by similarity (RAG)
 */
export async function searchDocumentChunks(
  projectId: string,
  queryEmbedding: number[],
  limit: number = 5,
  similarityThreshold: number = 0.7
): Promise<SearchResult[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('search_document_chunks', {
    p_project_id: projectId,
    p_query_embedding: queryEmbedding,
    p_match_count: limit,
    p_similarity_threshold: similarityThreshold,
  });

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { projectId, limit, function: 'search_document_chunks', operation: 'RPC' },
      tags: { layer: 'ai-service', function: 'rpc' },
    });
    return [];
  }

  return data || [];
}

// ============================================================================
// PROCESSOR RUNS
// ============================================================================

/**
 * Create processor run
 */
export async function createProcessorRun(input: CreateProcessorRunInput): Promise<ProcessorRun> {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('processor_runs')
    .insert({ ...input, status: 'pending' })
    .select()
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { processorType: input.processor_type, table: 'processor_runs', operation: 'INSERT' },
      tags: { layer: 'ai-service', table: 'processor_runs' },
    });
    throw error;
  }

  return data;
}

/**
 * Update processor run
 */
export async function updateProcessorRun(
  runId: string,
  updates: Partial<Pick<ProcessorRun, 'status' | 'output_text' | 'output_metadata' | 'error_message' | 'input_tokens' | 'output_tokens' | 'cost_cents'>>
): Promise<void> {
  const supabase = await getSupabase();
  const payload: Record<string, unknown> = { ...updates };
  if (updates.status === 'completed' || updates.status === 'failed') {
    payload.completed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('processor_runs')
    .update(payload)
    .eq('id', runId);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { runId, updateFields: Object.keys(updates), table: 'processor_runs', operation: 'UPDATE' },
      tags: { layer: 'ai-service', table: 'processor_runs' },
    });
    throw error;
  }
}

// ============================================================================
// USAGE TRACKING HELPERS
// ============================================================================

/**
 * Track AI usage (input/output tokens + requests)
 */
export async function trackAIUsage(
  orgId: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  const supabase = await getSupabase();
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  // Parallel usage metric updates
  await Promise.all([
    supabase.rpc('increment_usage_metric', {
      p_org_id: orgId,
      p_metric_name: 'ai_input_tokens',
      p_amount: inputTokens,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    }),
    supabase.rpc('increment_usage_metric', {
      p_org_id: orgId,
      p_metric_name: 'ai_output_tokens',
      p_amount: outputTokens,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    }),
    supabase.rpc('increment_usage_metric', {
      p_org_id: orgId,
      p_metric_name: 'ai_requests',
      p_amount: 1,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    }),
  ]);
}
