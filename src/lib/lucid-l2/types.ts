/**
 * Lucid-L2 FlowSpec Types
 * 
 * TypeScript definitions for Lucid-L2's FlowSpec DSL format
 * Based on Lucid-L2 API contract
 */

// ============================================================================
// FlowSpec DSL Types
// ============================================================================

/**
 * FlowSpec - Lucid-L2's workflow definition format
 * 
 * This is the format Lucid-L2 expects for workflow creation/updates
 */
export interface FlowSpec {
  name: string;
  description?: string;
  trigger: TriggerNode;
  nodes: FlowNode[];
  edges: FlowEdge[];
  variables?: Record<string, unknown>;
}

/**
 * Trigger Node - How the workflow is initiated
 */
export interface TriggerNode {
  type: 'webhook' | 'cron' | 'manual';
  config: Record<string, unknown>;
}

/**
 * Flow Node - A step in the workflow
 */
export interface FlowNode {
  id: string;
  type: string;
  params?: Record<string, unknown>;
  config?: Record<string, unknown>; // API returns 'config' instead of 'params'
  position?: { x: number; y: number };
}

/**
 * Flow Edge - Connection between nodes
 */
export interface FlowEdge {
  from: string;
  to: string;
  condition?: string;
}

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Execution Context - Runtime variables for workflow execution
 */
export interface FlowExecutionContext {
  tenantId: string;
  variables?: Record<string, unknown>;
  input?: unknown;
}

/**
 * Execution Result - Response from workflow execution
 */
export interface FlowExecutionResult {
  success: boolean;
  executionId?: string;
  workflowId?: string;
  data?: unknown;
  error?: string;
}

/**
 * Execution History Item - Past execution record
 */
export interface ExecutionHistoryItem {
  id: string;
  executionId: string;
  status: 'pending' | 'running' | 'success' | 'error';
  startedAt: string;
  finishedAt?: string;
  output?: unknown;
  error?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Create Workflow Response
 */
export interface CreateWorkflowResponse {
  workflowId: string;
  workflowUrl: string;
}

/**
 * AI Planning Response (CrewAI)
 */
export interface AIPlanningResponse {
  flowspec: FlowSpec;
  reasoning: string;
  estimated_complexity: string;
  suggested_improvements?: string[];
  tokens_used?: number;
}

/**
 * Health Check Response
 */
export interface HealthCheckResponse {
  status: string;
  timestamp?: string;
  version?: string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Lucid-L2 API Error
 */
export class LucidL2Error extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'LucidL2Error';
  }
}
