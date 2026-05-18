import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface Workflow {
  id: string;
  name: string;
  description: string;
  workspaceId: string;
  nodes: unknown[];
  connections: unknown[];
  createdAt: string;
  updatedAt: string;
}

interface WorkflowsState {
  // State
  workflows: Workflow[];
  currentWorkflow: Workflow | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setWorkflows: (workflows: Workflow[]) => void;
  setCurrentWorkflow: (workflow: Workflow | null) => void;
  addWorkflow: (workflow: Workflow) => void;
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void;
  removeWorkflow: (id: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useWorkflowsStore = create<WorkflowsState>()(
  devtools(
    immer((set) => ({
      // Initial state
      workflows: [],
      currentWorkflow: null,
      isLoading: false,
      error: null,

      // Actions
      setWorkflows: (workflows) => set({ workflows }),
      
      setCurrentWorkflow: (workflow) => set({ currentWorkflow: workflow }),
      
      addWorkflow: (workflow) =>
        set((state) => {
          state.workflows.push(workflow);
        }),
      
      updateWorkflow: (id, updates) =>
        set((state) => {
          const index = state.workflows.findIndex((w) => w.id === id);
          if (index !== -1) {
            state.workflows[index] = { ...state.workflows[index], ...updates };
          }
          if (state.currentWorkflow?.id === id) {
            state.currentWorkflow = { ...state.currentWorkflow, ...updates };
          }
        }),
      
      removeWorkflow: (id) =>
        set((state) => {
          state.workflows = state.workflows.filter((w) => w.id !== id);
          if (state.currentWorkflow?.id === id) {
            state.currentWorkflow = null;
          }
        }),
      
      setLoading: (isLoading) => set({ isLoading }),
      
      setError: (error) => set({ error }),
    })),
    { name: 'workflows-store' }
  )
);

// Selectors
export const selectAllWorkflows = (state: WorkflowsState) => state.workflows;
export const selectCurrentWorkflow = (state: WorkflowsState) => state.currentWorkflow;
export const selectIsLoading = (state: WorkflowsState) => state.isLoading;
