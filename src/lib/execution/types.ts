/**
 * Workflow Execution Types
 * Stable interfaces for workflow execution across different executors
 */

// ============================================================================
// Executor Interface (Stable - Don't change without major version bump)
// ============================================================================

export interface IWorkflowExecutor {
  /**
   * Deploy a workflow to the execution engine
   * @returns executorWorkflowId - The ID assigned by the execution engine
   */
  deploy(workflow: Workflow): Promise<{ executorWorkflowId: string }>;

  /**
   * Execute a deployed workflow
   * @returns Execution result with status and output
   */
  execute(request: ExecuteRequest): Promise<ExecuteResult>;

  /**
   * Get the status of a running execution
   */
  getExecutionStatus(executionId: string): Promise<ExecutionStatus>;

  /**
   * Cancel a running execution
   */
  cancel(executionId: string): Promise<void>;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface ExecuteRequest {
  workflowId: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ExecuteResult {
  requestId: string;
  executionId: string;
  status: ExecutionStatusType;
  output?: unknown;
  error?: string;
  startedAt?: Date;
}

export interface ExecutionStatus {
  status: ExecutionStatusType;
  startedAt?: Date;
  finishedAt?: Date;
  output?: unknown;
  error?: string;
  progress?: {
    current: number;
    total: number;
  };
}

export type ExecutionStatusType = 
  | 'queued' 
  | 'running' 
  | 'success' 
  | 'error' 
  | 'timeout' 
  | 'cancelled';

// ============================================================================
// Workflow Structure (React Flow compatible)
// ============================================================================

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables?: Record<string, unknown>;
  settings?: WorkflowSettings;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  metadata?: {
    label?: string;
    description?: string;
    disabled?: boolean;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string; // For multi-output nodes (IF/Switch)
  targetHandle?: string;
  metadata?: {
    label?: string;
    condition?: string;
  };
}

export interface WorkflowSettings {
  timeout?: number; // Execution timeout in ms
  retryOnFail?: boolean;
  retryCount?: number;
  retryDelay?: number;
  errorWorkflow?: string; // Workflow to run on error
}

// ============================================================================
// n8n-Specific Types
// ============================================================================

export interface N8nWorkflow {
  id?: string;
  name: string;
  active: boolean;
  nodes: N8nNode[];
  connections: N8nConnections;
  settings?: N8nWorkflowSettings;
  staticData?: Record<string, unknown>;
  pinData?: Record<string, unknown>;
  versionId?: string;
}

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, unknown>;
  credentials?: Record<string, N8nCredentialReference>;
  disabled?: boolean;
  notes?: string;
  notesInFlow?: boolean;
  color?: string;
  icon?: string;
  alwaysOutputData?: boolean;
  executeOnce?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  continueOnFail?: boolean;
  onError?: 'continueErrorOutput' | 'continueRegularOutput' | 'stopWorkflow';
}

export interface N8nCredentialReference {
  id: string;
  name: string;
}

export interface N8nConnections {
  [key: string]: {
    main: N8nConnection[][];
  };
}

export interface N8nConnection {
  node: string;
  type: string;
  index: number;
}

export interface N8nWorkflowSettings {
  executionOrder?: 'v0' | 'v1';
  saveDataErrorExecution?: 'all' | 'none';
  saveDataSuccessExecution?: 'all' | 'none';
  saveExecutionProgress?: boolean;
  saveManualExecutions?: boolean;
  callerPolicy?: 'any' | 'workflowsFromSameOwner' | 'workflowsFromAList' | 'none';
  callerIds?: string;
  errorWorkflow?: string;
  timezone?: string;
}

// ============================================================================
// Database Types
// ============================================================================

export interface WorkflowRecord {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables?: Record<string, unknown>;
  n8n_workflow_id?: string;
  n8n_json?: N8nWorkflow;
  content_hash?: string;
  last_synced_at?: Date;
  n8n_updated_at?: Date;
  node_type_versions?: Record<string, number>;
  auto_heal_drift?: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string;
}

export interface WorkflowExecutionRecord {
  id: string;
  workflow_id: string;
  n8n_execution_id?: string;
  idempotency_key?: string;
  status: ExecutionStatusType;
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  started_at?: Date;
  finished_at?: Date;
  duration_ms?: number;
  created_at: Date;
  updated_at: Date;
}

export interface CredentialAliasRecord {
  id: string;
  tenant_id: string;
  alias: string;
  n8n_credential_name: string;
  created_at: Date;
  updated_at: Date;
}

export interface DriftConflictRecord {
  id: string;
  workflow_id: string;
  our_hash: string;
  n8n_hash: string;
  detected_at: Date;
  resolved_at?: Date;
  resolution?: 'ours' | 'theirs' | 'manual_merge';
  resolved_by?: string;
}

// ============================================================================
// Node Registry Types
// ============================================================================

export interface NodeMapping {
  n8nType: string;
  version: number;
  defaultName: string;
  mapParams: (data: Record<string, unknown>) => Record<string, unknown>;
  mapCredentials?: (data: Record<string, unknown>) => Record<string, N8nCredentialReference> | undefined;
  validate?: (data: Record<string, unknown>) => string[]; // Returns validation errors
}

export type NodeRegistry = Record<string, NodeMapping>;

// ============================================================================
// Credential Types
// ============================================================================

export interface CredentialData {
  type: string;
  name: string;
  data: Record<string, unknown>;
}

// ============================================================================
// Execution Context
// ============================================================================

export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  organizationId: string;
  userId: string;
  input?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Drift Detection
// ============================================================================

export interface DriftCheckResult {
  hasDrift: boolean;
  ourHash: string;
  n8nHash: string;
  differences?: string[];
}

// ============================================================================
// Circuit Breaker Types
// ============================================================================

export interface CircuitBreakerConfig {
  threshold: number; // Number of failures before opening
  timeout: number; // Time in ms to wait before trying again
  monitoringPeriod: number; // Time window for counting failures
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure?: Date;
  nextAttempt?: Date;
}
