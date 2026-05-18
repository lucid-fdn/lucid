/**
 * Lucid-L2 API Client
 * 
 * Server-side only client for interacting with Lucid-L2's FlowSpec API
 * Uses React cache() for request-level deduplication
 * 
 * @example
 * ```typescript
 * const client = getLucidL2Client();
 * const result = await client.createWorkflow(flowspec);
 * ```
 */

import 'server-only'; // ⚠️ SERVER-SIDE ONLY - Never import in client components
import { cache } from 'react';
import { getL2AdminApiKey } from './admin-auth';
import { getL2ApiUrl } from './env';
import type {
  FlowSpec,
  FlowExecutionContext,
  FlowExecutionResult,
  CreateWorkflowResponse,
  ExecutionHistoryItem,
  AIPlanningResponse,
  HealthCheckResponse,
} from './types';

// ============================================================================
// Lucid-L2 Client Class
// ============================================================================

export class LucidL2Client {
  private baseUrl: string;
  private apiKey?: string;

  constructor() {
    // Remove trailing slash if present to ensure consistent URLs
    const url = getL2ApiUrl() || 'http://localhost:3001/api';
    this.baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    this.apiKey = getL2AdminApiKey() ?? undefined;
    
    if (!this.baseUrl) {
      throw new Error('LUCID_L2_API_URL environment variable is not set');
    }
  }

  /**
   * Make HTTP request to Lucid-L2 API
   * 
   * @private
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        // Reduce timeout to 5 seconds for faster failure recovery
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let error;
        try {
          error = JSON.parse(errorText);
        } catch {
          error = { message: errorText };
        }
        
        const errorMessage = error.message || error.error || `API Error: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      const responseText = await response.text();
      const data = JSON.parse(responseText);
      return data;
    } catch (error: unknown) {
      // Reduce log noise - only log once per error type
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw new Error('Lucid-L2 API timeout (5s) - server may be unreachable');
      }

      // For connection errors (ECONNREFUSED, fetch failed, etc.)
      if (error instanceof Error && ((error.cause as Record<string, unknown>)?.code === 'ECONNREFUSED' || error.message.includes('fetch failed'))) {
        throw new Error(`Lucid-L2 API unavailable: ${this.baseUrl}`);
      }

      throw error;
    }
  }

  // ============================================================================
  // Workflow Management
  // ============================================================================

  /**
   * Create a new workflow in Lucid-L2
   * 
   * @param flowspec - FlowSpec DSL definition
   * @returns Workflow ID and URL
   */
  async createWorkflow(flowspec: FlowSpec): Promise<CreateWorkflowResponse> {
    return this.request('/flowspec/create', {
      method: 'POST',
      body: JSON.stringify(flowspec),
    });
  }

  /**
   * Update an existing workflow
   * 
   * @param workflowId - Lucid-L2 workflow ID
   * @param flowspec - Updated FlowSpec definition
   */
  async updateWorkflow(
    workflowId: string,
    flowspec: FlowSpec
  ): Promise<void> {
    return this.request(`/flowspec/update/${workflowId}`, {
      method: 'PUT',
      body: JSON.stringify(flowspec),
    });
  }

  /**
   * Delete a workflow
   * 
   * @param workflowId - Lucid-L2 workflow ID
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    return this.request(`/flowspec/delete/${workflowId}`, {
      method: 'DELETE',
    });
  }

  /**
   * List all workflows
   * 
   * @returns Array of workflows
   */
  async listWorkflows(): Promise<Record<string, unknown>[]> {
    return this.request('/flowspec/list');
  }

  // ============================================================================
  // Workflow Execution
  // ============================================================================

  /**
   * Execute a workflow
   * 
   * @param workflowId - Lucid-L2 workflow ID
   * @param context - Execution context (tenant, variables, input)
   * @returns Execution result with execution ID
   */
  async executeWorkflow(
    workflowId: string,
    context: FlowExecutionContext
  ): Promise<FlowExecutionResult> {
    return this.request('/flowspec/execute', {
      method: 'POST',
      body: JSON.stringify({ workflowId, context }),
    });
  }

  /**
   * Get execution history for a workflow
   * 
   * @param workflowId - Lucid-L2 workflow ID
   * @param limit - Maximum number of executions to return
   * @returns Array of execution history items
   */
  async getExecutionHistory(
    workflowId: string,
    limit: number = 10
  ): Promise<ExecutionHistoryItem[]> {
    return this.request(`/flowspec/history/${workflowId}?limit=${limit}`);
  }

  // ============================================================================
  // AI-Powered Features (CrewAI)
  // ============================================================================

  /**
   * Generate workflow from natural language using AI
   * 
   * Requires CrewAI service to be running on Lucid-L2
   * 
   * @param goal - Natural language description of workflow
   * @param context - Additional context for AI planner
   * @param constraints - Optional constraints for workflow generation
   * @returns AI-generated FlowSpec with reasoning
   * 
   * @example
   * ```typescript
   * const result = await client.planWorkflowWithAI(
   *   'Monitor BTC price and alert if > $50k',
   *   { tenantId: 'user123' }
   * );
   * ```
   */
  async planWorkflowWithAI(
    goal: string,
    context?: Record<string, unknown>,
    constraints?: string[]
  ): Promise<AIPlanningResponse> {
    return this.request('/agents/plan', {
      method: 'POST',
      body: JSON.stringify({ goal, context, constraints }),
    });
  }

  /**
   * Plan and execute workflow in one call
   * 
   * Generates workflow from goal and executes immediately
   * 
   * @param goal - Natural language description
   * @param context - Execution context
   * @returns Execution result
   */
  async accomplishGoal(
    goal: string,
    context?: Record<string, unknown>
  ): Promise<FlowExecutionResult> {
    return this.request('/agents/accomplish', {
      method: 'POST',
      body: JSON.stringify({ goal, context }),
    });
  }

  // ============================================================================
  // Health & Status
  // ============================================================================

  /**
   * Check if Lucid-L2 API is healthy
   * 
   * @returns Health status
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    return this.request('/system/status');
  }

  /**
   * Get API version info
   * 
   * @returns Version information
   */
  async getVersion(): Promise<Record<string, unknown>> {
    return this.request('/system/version');
  }

  /**
   * Get all available node types from Lucid-L2
   * 
   * Fetches the complete list of nodes (core + integrations) that are
   * available in the Lucid-L2 n8n instance. Use this to dynamically
   * populate the node palette in the workflow editor.
   * 
   * This fetches ALL nodes using pagination (n8n API returns 100 at a time).
   * 
   * @returns Array of node type definitions with metadata
   * 
   * @example
   * ```typescript
   * const client = getLucidL2Client();
   * const nodes = await client.getAvailableNodes();
   * 
   * // Group by category
   * const grouped = nodes.reduce((acc, node) => {
   *   const cat = node.category || 'Other';
   *   if (!acc[cat]) acc[cat] = [];
   *   acc[cat].push(node);
   *   return acc;
   * }, {});
   * ```
   */
  /**
   * Load dynamic options for a node parameter
   * 
   * Called when a parameter has dependencies on other parameters.
   * For example, loading "Table" options based on selected "Base".
   * 
   * @param options - Node and parameter information
   * @returns Array of options
   */
  async loadNodeOptions(options: {
    nodeName: string
    nodeVersion?: number
    method: string
    currentValues: Record<string, unknown>
  }): Promise<Array<{ name: string; value: string | number }>> {
    const { nodeName, nodeVersion, method, currentValues } = options
    
    console.log('[Lucid-L2 Client] Loading options:', {
      nodeName,
      nodeVersion,
      method,
      currentValues
    })
    
    try {
      // n8n REST API endpoint for loading node parameter options
      // Endpoint: POST /rest/node-parameters/options
      const response = await this.request<Record<string, unknown>>('/rest/node-parameters/options', {
        method: 'POST',
        body: JSON.stringify({
          nodeTypeAndVersion: {
            name: nodeName,
            version: nodeVersion || 1
          },
          methodName: method,
          currentNodeParameters: currentValues,
          credentials: undefined // Will be added when auth is implemented
        })
      })
      
      // Handle different response formats
      const options = (response.options || response.data || response || []) as Array<{ name: string; value: string | number }>
      
      console.log('[Lucid-L2 Client] Loaded', options.length, 'options')
      return options
    } catch (error) {
      console.error('[Lucid-L2 Client] Failed to load options:', error)
      // Return empty array instead of throwing to prevent UI breakage
      return []
    }
  }

  /**
   * Get available nodes with optional search/filter
   * 
   * Industry standard: Let Elasticsearch do the heavy lifting
   * - With search: Query ES directly (fast, relevance scoring)
   * - Without search: Fetch all and cache (for palette browsing)
   * 
   * @param options - Search and pagination options
   */
  async getAvailableNodes(options?: {
    search?: string
    category?: string
    codexCategory?: string
    codexSubcategory?: string
    offset?: number
    limit?: number
  }): Promise<{ nodes: Record<string, unknown>[], total: number }> {
    const { search, category, codexCategory, codexSubcategory, offset = 0, limit = 100 } = options || {};
    
    // Build query params for Elasticsearch
    const params = new URLSearchParams({
      offset: offset.toString(),
      limit: limit.toString(),
    });
    
    if (search) {
      params.set('search', search); // Per docs: use 'search' parameter
    }
    
    // Per docs: use 'category' parameter for filtering by node group
    // n8n expects lowercase: transform, input, output, trigger
    if (category) {
      params.set('category', category.toLowerCase());
    }
    
    // Per docs: use 'codexCategory' parameter for filtering by codex category
    // Examples: AI, Sales, Marketing, Communication, etc.
    if (codexCategory) {
      params.set('codexCategory', codexCategory);
    }
    
    // Per docs: use 'codexSubcategory' parameter for filtering by subcategory
    // Examples: Memory, Tools, Language Models, etc.
    if (codexSubcategory) {
      params.set('codexSubcategory', codexSubcategory);
    }
    
    console.log('[Lucid-L2 Client] 🔍 Querying n8n/Elasticsearch:', {
      search,
      category,
      codexCategory,
      offset,
      limit,
    });
    
    const response = await this.request<Record<string, unknown>>(`/flow/nodes?${params}`);
    
    // Handle response format from Lucid-L2 API
    // Expected format: { success: true, count: 5, total: 110, nodes: [...] }
    const nodes = response.nodes || response.data || response;
    const nodeArray = Array.isArray(nodes) ? nodes : [];
    const total = (response.total as number) || nodeArray.length;
    
    // Check what groups are actually in the response
    const groupsInResponse = Array.from(
      new Set(nodeArray.map((n: Record<string, unknown>) => (n.group as string[])?.[0] || 'unknown'))
    );
    
    console.log('[Lucid-L2 Client] ✅ Query result:', {
      nodesReturned: nodeArray.length,
      total,
      hasMore: nodeArray.length < total,
      groupsInResponse,
      requestedGroup: category?.toLowerCase(),
    });
    
    return {
      nodes: nodeArray,
      total,
    };
  }
}

// ============================================================================
// Singleton with React Cache
// ============================================================================

/**
 * Get Lucid-L2 client instance (cached per request)
 * 
 * Uses React cache() for request-level deduplication
 * Multiple calls within same request return same instance
 * 
 * @example
 * ```typescript
 * // In API route or server component
 * const client = getLucidL2Client();
 * await client.createWorkflow(flowspec);
 * ```
 */
export const getLucidL2Client = cache(() => {
  return new LucidL2Client();
});
