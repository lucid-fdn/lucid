/**
 * Execution Context Builder
 * Builds the context object for expression resolution during workflow execution
 */

import { createClient } from '@supabase/supabase-js';
import type { ExecutionContext, NodeData } from './resolver';

interface WorkflowVariable {
  id: string;
  workflow_id: string;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'secret';
  is_secret: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

const WORKFLOW_VARIABLE_SELECT =
  'id, workflow_id, key, value, type, is_secret, description, created_at, updated_at' as const

/**
 * Build execution context for a workflow
 */
export async function buildExecutionContext(
  workflowId: string,
  currentItemData: unknown = {},
  nodeOutputs: Record<string, NodeData> = {}
): Promise<ExecutionContext> {
  // Fetch workflow variables
  const variables = await fetchWorkflowVariables(workflowId);

  // Build $vars object
  const $vars: Record<string, unknown> = {};
  variables.forEach((variable: WorkflowVariable) => {
    let value: string | number | boolean = variable.value;
    
    // Convert based on type
    if (variable.type === 'number') {
      value = parseFloat(variable.value) || 0;
    } else if (variable.type === 'boolean') {
      value = variable.value === 'true' || variable.value === '1';
    }
    
    $vars[variable.key] = value;
  });

  // Build $env object (only expose safe env vars)
  const $env: Record<string, string> = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    // Add other safe env vars as needed
  };

  return {
    $vars,
    $json: currentItemData,
    $node: nodeOutputs,
    $now: new Date(),
    $env,
  };
}

/**
 * Fetch workflow variables from database
 */
async function fetchWorkflowVariables(workflowId: string): Promise<WorkflowVariable[]> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { data, error } = await supabase
      .from('workflow_variables')
      .select(WORKFLOW_VARIABLE_SELECT)
      .eq('workflow_id', workflowId);

    if (error) {
      console.error('[context-builder] Error fetching variables:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[context-builder] Error:', error);
    return [];
  }
}

/**
 * Update context with new item data
 */
export function updateContextWithItem(
  context: ExecutionContext,
  itemData: unknown
): ExecutionContext {
  return {
    ...context,
    $json: itemData,
    $now: new Date(), // Update timestamp
  };
}

/**
 * Update context with node output
 */
export function updateContextWithNodeOutput(
  context: ExecutionContext,
  nodeName: string,
  output: unknown
): ExecutionContext {
  return {
    ...context,
    $node: {
      ...context.$node,
      [nodeName]: {
        json: output,
      },
    },
  };
}

/**
 * Get variable value from context
 */
export function getVariable(
  context: ExecutionContext,
  key: string
): unknown {
  return context.$vars[key];
}

/**
 * Check if variable exists
 */
export function hasVariable(
  context: ExecutionContext,
  key: string
): boolean {
  return key in context.$vars;
}
