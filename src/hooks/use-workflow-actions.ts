/**
 * Workflow Actions Hook
 * 
 * Centralized hook for workflow operations (save, execute, status polling)
 * Now using Lucid-L2 remote execution instead of local n8n
 * 
 * Architecture:
 * - Server-side: Initial data fetch (page.tsx)
 * - Client-side: Mutations via this hook
 * - Notifications: useToast() (Sonner)
 * - Feature Flags: useFeatureFlags()
 * - Error handling: Try/catch with rollback
 * 
 * @example
 * ```tsx
 * const { saveWorkflow, executeWorkflow, pollStatus } = useWorkflowActions(workflowId);
 * 
 * await saveWorkflow();
 * const { executionId } = await executeWorkflow();
 * await pollStatus(executionId);
 * ```
 */

import { useState, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useResolvedFeatureFlags } from '@/contexts/feature-flags-context';

// ============================================================================
// Types
// ============================================================================

export interface ExecutionResult {
  success: boolean;
  executionId?: string;
  lucidL2ExecutionId?: string;
  status?: 'pending' | 'running' | 'success' | 'error';
  output?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface WorkflowActionsConfig {
  /**
   * Polling interval in milliseconds
   * @default 2000 (2 seconds)
   */
  pollInterval?: number;
  
  /**
   * Maximum polling attempts before timeout
   * @default 60 (2 minutes at 2s interval)
   */
  maxPollAttempts?: number;
  
  /**
   * Enable verbose logging for debugging
   * @default false
   */
  debug?: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useWorkflowActions(
  workflowId: string,
  config: WorkflowActionsConfig = {}
) {
  const {
    pollInterval = 2000,
    maxPollAttempts = 60,
    debug = false
  } = config;
  
  const toast = useToast();
  const flags = useResolvedFeatureFlags();
  
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  
  const log = useCallback((...args: unknown[]) => {
    if (debug) {
      console.log('[use-workflow-actions]', ...args);
    }
  }, [debug]);

  /**
   * Save workflow to Lucid-L2
   * 
   * Converts workflow to FlowSpec and syncs with Lucid-L2.
   * Should be called after saving to Supabase.
   * 
   * @throws Error if save fails
   */
  const saveWorkflow = useCallback(async (): Promise<void> => {
    // Feature flag check
    if (!flags.lucidL2Integration) {
      toast.error('Feature Disabled', 'Lucid-L2 integration is currently disabled');
      throw new Error('Lucid-L2 integration is disabled');
    }

    if (saving) {
      log('Already saving, skipping...');
      return;
    }
    
    setSaving(true);
    log('Saving workflow to Lucid-L2:', workflowId);
    
    // Optimistic UI: Show loading toast
    toast.info('Saving workflow...', 'Syncing with Lucid-L2');
    
    try {
      const response = await fetch(`/api/workflows/${workflowId}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || result.message || 'Failed to sync with Lucid-L2');
      }
      
      log('Successfully saved to Lucid-L2');
      
      // Success toast
      toast.success(
        'Workflow Saved',
        result.lucidL2Synced 
          ? 'Successfully synced with Lucid-L2' 
          : 'Saved locally (Lucid-L2 sync pending)'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync with Lucid-L2';
      log('Error saving to Lucid-L2:', error);
      
      // Error toast
      toast.error('Save Failed', message);
      
      throw error;
    } finally {
      setSaving(false);
    }
  }, [workflowId, saving, flags.lucidL2Integration, toast, log]);

  /**
   * Execute workflow via Lucid-L2
   * 
   * Starts workflow execution and returns executionId for polling.
   * Use pollStatus() to monitor execution progress.
   * 
   * @param input Optional input data for workflow
   * @returns executionId for status polling
   * @throws Error if execution fails to start
   */
  const executeWorkflow = useCallback(async (input?: unknown): Promise<string> => {
    // Feature flag check
    if (!flags.flowSpecExecution) {
      toast.error('Feature Disabled', 'Workflow execution is currently disabled');
      throw new Error('Workflow execution is disabled');
    }

    if (executing) {
      throw new Error('Workflow is already executing');
    }
    
    setExecuting(true);
    log('Executing workflow via Lucid-L2:', workflowId, input);
    
    // Optimistic UI: Show execution started toast
    toast.info('Executing Workflow', 'Starting execution on Lucid-L2...');
    
    try {
      const response = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input }),
      });
      
      const result: ExecutionResult = await response.json();
      
      if (!result.success || !result.executionId) {
        throw new Error(result.error || 'Failed to start execution');
      }
      
      log('Execution started:', result.executionId);
      
      // Success toast
      toast.success('Execution Started', 'Workflow is now running on Lucid-L2');
      
      return result.executionId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to execute workflow';
      log('Error executing workflow:', error);
      
      // Error toast
      toast.error('Execution Failed', message);
      
      setExecuting(false);
      throw error;
    }
    // Note: Don't set executing=false here, let pollStatus handle it
  }, [workflowId, executing, flags.flowSpecExecution, toast, log]);

  /**
   * Poll execution status from Lucid-L2
   * 
   * Polls Lucid-L2 for execution status and returns final result.
   * Automatically stops polling when execution completes or times out.
   * 
   * @param executionId ID from executeWorkflow()
   * @param onStatusUpdate Callback for each status update
   * @returns Final execution result
   * @throws Error if polling times out or fails
   */
  const pollStatus = useCallback(async (
    executionId: string,
    onStatusUpdate?: (result: ExecutionResult) => void
  ): Promise<ExecutionResult> => {
    if (polling) {
      throw new Error('Already polling another execution');
    }
    
    setPolling(true);
    log('Starting status polling for execution:', executionId);
    
    let attempts = 0;
    
    return new Promise((resolve, reject) => {
      pollingRef.current = setInterval(async () => {
        attempts++;
        log(`Polling attempt ${attempts}/${maxPollAttempts}`);
        
        try {
          const response = await fetch(
            `/api/workflows/${workflowId}/executions/${executionId}`
          );
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const result: ExecutionResult = await response.json();
          
          // Call update callback if provided
          if (onStatusUpdate) {
            onStatusUpdate(result);
          }
          
          const status = result.status;
          log('Status update:', status, result);
          
          // Check if execution is complete
          if (status === 'success' || status === 'error') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setPolling(false);
            setExecuting(false);
            
            log('Execution complete:', status);
            
            // Show completion toast
            if (status === 'success') {
              toast.success(
                'Execution Complete',
                `Workflow completed successfully ${result.durationMs ? `in ${(result.durationMs / 1000).toFixed(1)}s` : ''}`
              );
            } else {
              toast.error(
                'Execution Failed',
                result.error || 'Workflow execution failed'
              );
            }
            
            resolve(result);
          } else if (attempts >= maxPollAttempts) {
            // Timeout
            if (pollingRef.current) clearInterval(pollingRef.current);
            setPolling(false);
            setExecuting(false);
            
            const error = new Error('Execution timeout - maximum polling attempts reached');
            log('Polling timeout');
            
            toast.error('Execution Timeout', 'Workflow is taking too long to complete');
            
            reject(error);
          }
        } catch (error) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setPolling(false);
          setExecuting(false);

          log('Polling error:', error);
          
          toast.error(
            'Polling Error',
            error instanceof Error ? error.message : 'Failed to check execution status'
          );
          
          reject(error);
        }
      }, pollInterval);
    });
  }, [workflowId, polling, pollInterval, maxPollAttempts, toast, log]);

  /**
   * Stop polling (cleanup)
   * 
   * Call this in cleanup/unmount to prevent memory leaks
   */
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      setPolling(false);
      setExecuting(false);
      log('Polling stopped manually');
    }
  }, [log]);

  /**
   * Execute workflow and poll until complete (convenience method)
   * 
   * Combines executeWorkflow() + pollStatus() into single operation.
   * 
   * @param input Optional input data
   * @param onStatusUpdate Callback for status updates
   * @returns Final execution result
   */
  const executeAndPoll = useCallback(async (
    input?: unknown,
    onStatusUpdate?: (result: ExecutionResult) => void
  ): Promise<ExecutionResult> => {
    const executionId = await executeWorkflow(input);
    return pollStatus(executionId, onStatusUpdate);
  }, [executeWorkflow, pollStatus]);

  // Cleanup on unmount
  useCallback(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    // Actions
    saveWorkflow,
    executeWorkflow,
    pollStatus,
    stopPolling,
    executeAndPoll,
    
    // Deprecated aliases (for backward compatibility)
    saveToN8n: saveWorkflow,
    
    // State
    saving,
    executing,
    polling,
    isLoading: saving || executing || polling,
    
    // Feature flags (for conditional rendering)
    lucidL2Enabled: flags.lucidL2Integration,
    crewAIEnabled: flags.crewAIGeneration,
  };
}
