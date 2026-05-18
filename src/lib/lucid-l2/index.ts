/**
 * Lucid-L2 Integration Module
 * 
 * Exports all types, client, and utilities for Lucid-L2 FlowSpec integration
 * 
 * @module lucid-l2
 */

// ============================================================================
// Client (Server-side only)
// ============================================================================
export { LucidL2Client, getLucidL2Client } from './client';

// ============================================================================
// Converter Functions
// ============================================================================
export {
  reactFlowToFlowSpec,
  flowSpecToReactFlow,
  validateReactFlowNodes,
  validateFlowSpec,
  isTriggerNode,
  isValidFlowSpec,
} from './converter';

// ============================================================================
// Types
// ============================================================================
export type {
  FlowSpec,
  TriggerNode,
  FlowNode,
  FlowEdge,
  FlowExecutionContext,
  FlowExecutionResult,
  ExecutionHistoryItem,
  CreateWorkflowResponse,
  AIPlanningResponse,
  HealthCheckResponse,
} from './types';

export { LucidL2Error } from './types';
