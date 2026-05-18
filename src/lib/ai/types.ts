/**
 * AI Platform Types
 * Centralized type definitions for AI features
 */

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

export interface Conversation {
  id: string;
  org_id: string;
  project_id: string;
  env_id: string;
  user_id: string;
  title: string | null;
  model: string;
  system_prompt: string | null;
  config: ConversationConfig;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_cents: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationConfig {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface CreateConversationInput {
  org_id: string;
  project_id: string;
  env_id?: string;
  user_id: string;
  title?: string;
  model: string;
  system_prompt?: string;
  config?: ConversationConfig;
}

// ============================================================================
// MESSAGE TYPES
// ============================================================================

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  metadata: MessageMetadata;
  created_at: string;
}

export interface MessageMetadata {
  finishReason?: string;
  toolCalls?: ToolCall[];
  attachments?: Attachment[];
  [key: string]: unknown;
}

export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface Attachment {
  type: 'file' | 'image' | 'document';
  url: string;
  name?: string;
  size?: number;
  mimeType?: string;
}

export interface CreateMessageInput {
  conversation_id: string;
  role: MessageRole;
  content: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_cents?: number;
  metadata?: MessageMetadata;
}

// ============================================================================
// DOCUMENT TYPES (RAG)
// ============================================================================

export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface Document {
  id: string;
  org_id: string;
  project_id: string;
  user_id: string;
  title: string;
  file_path: string | null;
  content: string | null;
  content_hash: string | null;
  status: DocumentStatus;
  chunk_count: number;
  metadata: DocumentMetadata;
  created_at: string;
  updated_at: string;
}

export interface DocumentMetadata {
  source?: string;
  mimeType?: string;
  fileSize?: number;
  pageCount?: number;
  wordCount?: number;
  chunkingStrategy?: string;
  embeddingModel?: string;
  [key: string]: unknown;
}

export interface CreateDocumentInput {
  org_id: string;
  project_id: string;
  user_id: string;
  title: string;
  file_path?: string;
  content?: string;
  metadata?: DocumentMetadata;
}

// ============================================================================
// DOCUMENT CHUNK TYPES (Vector Embeddings)
// ============================================================================

export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  embedding: number[]; // 1536 dimensions
  chunk_index: number;
  metadata: ChunkMetadata;
  created_at: string;
}

export interface ChunkMetadata {
  pageNumber?: number;
  sectionTitle?: string;
  startOffset?: number;
  endOffset?: number;
  [key: string]: unknown;
}

export interface CreateDocumentChunkInput {
  document_id: string;
  content: string;
  embedding: number[];
  chunk_index: number;
  metadata?: ChunkMetadata;
}

// ============================================================================
// PROCESSOR TYPES
// ============================================================================

export type ProcessorType = 'summary' | 'code' | 'sentiment' | 'translation' | 'custom';
export type ProcessorStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ProcessorRun {
  id: string;
  org_id: string;
  user_id: string;
  processor_type: ProcessorType;
  input_text: string | null;
  input_document_id: string | null;
  output_text: string | null;
  output_metadata: ProcessorOutputMetadata;
  model: string;
  status: ProcessorStatus;
  error_message: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  created_at: string;
  completed_at: string | null;
}

export interface ProcessorOutputMetadata {
  confidence?: number;
  language?: string;
  sentiment?: string;
  categories?: string[];
  [key: string]: unknown;
}

export interface CreateProcessorRunInput {
  org_id: string;
  user_id: string;
  processor_type: ProcessorType;
  input_text?: string;
  input_document_id?: string;
  model: string;
}

// ============================================================================
// SEARCH RESULT TYPES
// ============================================================================

export interface SearchResult {
  chunk_id: string;
  document_id: string;
  content: string;
  similarity: number;
  metadata: ChunkMetadata;
  document_title?: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface ChatRequest {
  messages: Array<{
    role: MessageRole;
    content: string;
  }>;
  model: string;
  conversationId?: string;
  orgId: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  finishReason: string;
}

// ============================================================================
// USAGE TRACKING TYPES
// ============================================================================

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCostCents: number;
  requestCount: number;
}

export interface UsageMetric {
  org_id: string;
  metric_name: string;
  current_value: number;
  period_start: string;
  period_end: string;
}
