/**
 * Reusable Workflow Hooks
 * Custom hooks for workflow functionality
 * Promotes code reuse and consistency
 */

import { useCallback } from 'react';
import { useExecutionStore, type NodeStatus } from '@/stores/workflow/execution.store';
import { EXECUTION_STATUS, STATUS_COLORS, STATUS_LABELS, MODE_LABELS } from './constants';
import type { ExecutionStatus, ExecutionMode } from './constants';

// ============================================
// EXECUTION HOOKS
// ============================================

/**
 * Hook for managing node execution status
 * Usage: const { status, updateStatus, getStatusColor } = useNodeStatus(nodeId);
 */
export function useNodeStatus(nodeId: string) {
  const nodeStatuses = useExecutionStore((state) => state.nodeStatuses);
  const updateNodeStatus = useExecutionStore((state) => state.updateNodeStatus);
  
  const status = nodeStatuses.get(nodeId);
  
  const updateStatus = useCallback((newStatus: ExecutionStatus) => {
    updateNodeStatus(nodeId, newStatus as NodeStatus);
  }, [nodeId, updateNodeStatus]);
  
  const getStatusColor = useCallback((status: ExecutionStatus | undefined) => {
    if (!status) return STATUS_COLORS[EXECUTION_STATUS.WAITING];
    return STATUS_COLORS[status];
  }, []);
  
  const getStatusLabel = useCallback((status: ExecutionStatus | undefined) => {
    if (!status) return STATUS_LABELS[EXECUTION_STATUS.WAITING];
    return STATUS_LABELS[status];
  }, []);
  
  return {
    status,
    updateStatus,
    getStatusColor,
    getStatusLabel,
    isRunning: status === EXECUTION_STATUS.RUNNING,
    isSuccess: status === EXECUTION_STATUS.SUCCESS,
    isError: status === EXECUTION_STATUS.ERROR,
    isWaiting: status === EXECUTION_STATUS.WAITING,
  };
}

/**
 * Hook for managing node output data
 * Usage: const { output, setOutput, clearOutput } = useNodeOutput(nodeId);
 */
export function useNodeOutput(nodeId: string) {
  const getNodeOutputData = useExecutionStore((state) => state.getNodeOutputData);
  const setNodeOutput = useExecutionStore((state) => state.setNodeOutput);

  const output = getNodeOutputData(nodeId);
  
  const setOutput = useCallback((data: unknown) => {
    setNodeOutput(nodeId, data);
  }, [nodeId, setNodeOutput]);
  
  const clearOutput = useCallback(() => {
    setNodeOutput(nodeId, undefined);
  }, [nodeId, setNodeOutput]);
  
  return {
    output,
    setOutput,
    clearOutput,
    hasOutput: output !== undefined,
  };
}

/**
 * Hook for managing workflow execution
 * Usage: const { execute, isExecuting, currentExecution } = useWorkflowExecution();
 */
export function useWorkflowExecution() {
  const startExecution = useExecutionStore((state) => state.startExecution);
  const finishExecution = useExecutionStore((state) => state.finishExecution);
  const currentExecution = useExecutionStore((state) => state.currentExecution);
  
  const execute = useCallback(async (
    workflowId: string,
    mode: ExecutionMode,
    _onProgress?: (nodeId: string, status: ExecutionStatus) => void
  ) => {
    startExecution(workflowId, mode);
    
    return {
      finish: (status: 'success' | 'error', error?: string) => {
        finishExecution(status, error);
      }
    };
  }, [startExecution, finishExecution]);
  
  return {
    execute,
    currentExecution,
    isExecuting: currentExecution?.status === EXECUTION_STATUS.RUNNING,
  };
}

// ============================================
// FORMATTING HOOKS
// ============================================

/**
 * Hook for formatting execution data
 * Usage: const { formatDuration, formatTime, formatMode } = useExecutionFormatters();
 */
export function useExecutionFormatters() {
  const formatDuration = useCallback((ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }, []);
  
  const formatTime = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }, []);
  
  const formatMode = useCallback((mode: ExecutionMode) => {
    return MODE_LABELS[mode];
  }, []);
  
  return {
    formatDuration,
    formatTime,
    formatMode,
  };
}

// ============================================
// PIN DATA HOOKS
// ============================================

/**
 * Hook for managing pin data
 * Usage: const { hasPinnedData, pinnedData } = usePinData(node);
 */
export function usePinData(node: { data?: { pinnedData?: unknown } } | null | undefined) {
  const hasPinnedData = node?.data?.pinnedData !== undefined && node?.data?.pinnedData !== null;
  const pinnedData = node?.data?.pinnedData;
  
  return {
    hasPinnedData,
    pinnedData,
  };
}
