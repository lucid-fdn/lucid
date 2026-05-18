/**
 * Execution Store
 * Manages workflow execution state, node statuses, and execution history
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// Types
export type NodeStatus = 'waiting' | 'running' | 'success' | 'error' | 'skipped';

export interface NodeExecutionData {
  input?: unknown;
  output?: unknown;
  error?: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
}

export interface Execution {
  id: string;
  workflowId: string;
  status: 'running' | 'success' | 'error' | 'cancelled';
  startTime: number;
  endTime?: number;
  duration?: number;
  error?: string;
  mode: 'manual' | 'webhook' | 'schedule' | 'test';
}

interface ExecutionState {
  // Current execution
  currentExecution: Execution | null;
  
  // Node statuses (nodeId -> status)
  nodeStatuses: Map<string, NodeStatus>;
  
  // Node execution data (nodeId -> data)
  nodeData: Map<string, NodeExecutionData>;
  
  // Execution history (last 10 executions)
  executionHistory: Execution[];
  
  // Actions
  startExecution: (workflowId: string, mode?: Execution['mode']) => void;
  finishExecution: (status: 'success' | 'error', error?: string) => void;
  updateNodeStatus: (nodeId: string, status: NodeStatus) => void;
  setNodeInput: (nodeId: string, data: unknown) => void;
  setNodeOutput: (nodeId: string, data: unknown, error?: string) => void;
  getNodeInputData: (nodeId: string) => unknown;
  getNodeOutputData: (nodeId: string) => unknown;
  getNodeExecutionStatus: (nodeId: string) => {
    status: NodeStatus;
    duration?: number;
  } | null;
  clearExecution: () => void;
  addToHistory: (execution: Execution) => void;
}

export const useExecutionStore = create<ExecutionState>()(
  devtools(
    (set, get) => ({
      // Initial state
      currentExecution: null,
      nodeStatuses: new Map(),
      nodeData: new Map(),
      executionHistory: [],

      // Start a new execution
      startExecution: (workflowId, mode = 'manual') => {
        const execution: Execution = {
          id: `exec-${Date.now()}`,
          workflowId,
          status: 'running',
          startTime: Date.now(),
          mode,
        };

        set({
          currentExecution: execution,
          nodeStatuses: new Map(),
          nodeData: new Map(),
        });
      },

      // Finish the current execution
      finishExecution: (status, error) => {
        const { currentExecution, addToHistory } = get();
        
        if (!currentExecution) return;

        const finishedExecution: Execution = {
          ...currentExecution,
          status,
          error,
          endTime: Date.now(),
          duration: Date.now() - currentExecution.startTime,
        };

        set({ currentExecution: finishedExecution });
        
        // Add to history
        addToHistory(finishedExecution);
      },

      // Update a node's status
      updateNodeStatus: (nodeId, status) => {
        set((state) => {
          const newStatuses = new Map(state.nodeStatuses);
          newStatuses.set(nodeId, status);

          // Update timing
          const nodeDataMap = new Map(state.nodeData);
          const data: NodeExecutionData = nodeDataMap.get(nodeId) || {};

          if (status === 'running' && !data.startTime) {
            data.startTime = Date.now();
          } else if (
            (status === 'success' || status === 'error') &&
            data.startTime &&
            !data.endTime
          ) {
            data.endTime = Date.now();
            data.duration = data.endTime - data.startTime;
          }

          nodeDataMap.set(nodeId, data);

          return {
            nodeStatuses: newStatuses,
            nodeData: nodeDataMap,
          };
        });
      },

      // Set node input data
      setNodeInput: (nodeId, data) => {
        set((state) => {
          const newData = new Map(state.nodeData);
          const nodeData: NodeExecutionData = newData.get(nodeId) || {};
          nodeData.input = data;
          newData.set(nodeId, nodeData);
          return { nodeData: newData };
        });
      },

      // Set node output data
      setNodeOutput: (nodeId, data, error) => {
        set((state) => {
          const newData = new Map(state.nodeData);
          const nodeData: NodeExecutionData = newData.get(nodeId) || {};
          nodeData.output = data;
          if (error) nodeData.error = error;
          newData.set(nodeId, nodeData);
          return { nodeData: newData };
        });
      },

      // Get node input data
      getNodeInputData: (nodeId) => {
        const data = get().nodeData.get(nodeId);
        return data?.input;
      },

      // Get node output data
      getNodeOutputData: (nodeId) => {
        const data = get().nodeData.get(nodeId);
        return data?.output;
      },

      // Get node execution status
      getNodeExecutionStatus: (nodeId) => {
        const status = get().nodeStatuses.get(nodeId);
        const data = get().nodeData.get(nodeId);
        
        if (!status) return null;
        
        return {
          status,
          duration: data?.duration,
        };
      },

      // Clear execution state
      clearExecution: () => {
        set({
          currentExecution: null,
          nodeStatuses: new Map(),
          nodeData: new Map(),
        });
      },

      // Add execution to history
      addToHistory: (execution) => {
        set((state) => {
          const history = [execution, ...state.executionHistory];
          // Keep only last 10
          return {
            executionHistory: history.slice(0, 10),
          };
        });
      },
    }),
    { name: 'execution-store' }
  )
);
