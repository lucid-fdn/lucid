/**
 * n8n API Client
 * Handles all communication with n8n REST API
 * Features: HMAC signing, retries, circuit breaker, logging
 */

import crypto from 'crypto';
import type { N8nWorkflow, CredentialData } from '../../types';

// ============================================================================
// Configuration
// ============================================================================

export interface N8nClientConfig {
  baseUrl: string;
  apiKey: string;
  hmacSecret: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailure?: Date;
  state: 'closed' | 'open' | 'half-open';
}

/** Response from n8n workflow execution API */
export interface N8nExecutionResponse {
  id: string;
  finished: boolean;
  mode: string;
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
  status: string;
  data?: Record<string, unknown>;
}

/** n8n credential as returned by the API */
export interface N8nCredentialResponse {
  id: string;
  name: string;
  type: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Paginated list response from n8n API */
interface N8nListResponse<T> {
  data: T[];
  nextCursor?: string;
}

// ============================================================================
// n8n API Client
// ============================================================================

export class N8nClient {
  private config: Required<N8nClientConfig>;
  private circuitBreaker: CircuitBreakerState;

  constructor(config: N8nClientConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''), // Remove trailing slash
      apiKey: config.apiKey,
      hmacSecret: config.hmacSecret,
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      retryDelay: config.retryDelay || 1000,
    };

    this.circuitBreaker = {
      failures: 0,
      state: 'closed',
    };
  }

  // ==========================================================================
  // Workflow Operations
  // ==========================================================================

  /**
   * Create a new workflow in n8n
   */
  async createWorkflow(workflow: Partial<N8nWorkflow>): Promise<N8nWorkflow> {
    return this.request('POST', '/api/v1/workflows', workflow);
  }

  /**
   * Update an existing workflow
   */
  async updateWorkflow(
    id: string,
    workflow: Partial<N8nWorkflow>
  ): Promise<N8nWorkflow> {
    return this.request('PUT', `/api/v1/workflows/${id}`, workflow);
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(id: string): Promise<N8nWorkflow> {
    return this.request('GET', `/api/v1/workflows/${id}`);
  }

  /**
   * Delete workflow
   */
  async deleteWorkflow(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/workflows/${id}`);
  }

  /**
   * List all workflows
   */
  async listWorkflows(): Promise<N8nWorkflow[]> {
    const response = await this.request<N8nListResponse<N8nWorkflow>>('GET', '/api/v1/workflows');
    return response.data || [];
  }

  // ==========================================================================
  // Execution Operations
  // ==========================================================================

  /**
   * Execute a workflow
   */
  async executeWorkflow(workflowId: string, data?: Record<string, unknown>): Promise<N8nExecutionResponse> {
    return this.request<N8nExecutionResponse>('POST', `/api/v1/workflows/${workflowId}/execute`, {
      data,
    });
  }

  /**
   * Get execution status
   */
  async getExecution(executionId: string): Promise<N8nExecutionResponse> {
    return this.request<N8nExecutionResponse>('GET', `/api/v1/executions/${executionId}`);
  }

  /**
   * List executions for a workflow
   */
  async listExecutions(workflowId: string, limit = 100): Promise<N8nExecutionResponse[]> {
    const response = await this.request<N8nListResponse<N8nExecutionResponse>>(
      'GET',
      `/api/v1/executions?workflowId=${workflowId}&limit=${limit}`
    );
    return response.data || [];
  }

  // ==========================================================================
  // Credential Operations
  // ==========================================================================

  /**
   * Create a credential
   */
  async createCredential(credential: CredentialData): Promise<N8nCredentialResponse> {
    return this.request<N8nCredentialResponse>('POST', '/api/v1/credentials', credential);
  }

  /**
   * List all credentials
   */
  async listCredentials(): Promise<N8nCredentialResponse[]> {
    const response = await this.request<N8nListResponse<N8nCredentialResponse>>('GET', '/api/v1/credentials');
    return response.data || [];
  }

  // ==========================================================================
  // Core Request Method
  // ==========================================================================

  /**
   * Make authenticated request to n8n API with retries and circuit breaker
   */
  async request<T = unknown>(
    method: string,
    path: string,
    body?: Record<string, unknown> | Partial<N8nWorkflow> | CredentialData
  ): Promise<T> {
    // Check circuit breaker
    if (this.circuitBreaker.state === 'open') {
      const timeSinceFailure =
        Date.now() - (this.circuitBreaker.lastFailure?.getTime() || 0);
      
      // Try to half-open after 30 seconds
      if (timeSinceFailure > 30000) {
        this.circuitBreaker.state = 'half-open';
      } else {
        throw new Error(
          'Circuit breaker is OPEN. n8n is unreachable. Try again later.'
        );
      }
    }

    let lastError: Error | null = null;

    // Retry loop
    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        const result = await this.makeRequest<T>(method, path, body);

        // Success - reset circuit breaker
        if (
          this.circuitBreaker.state === 'half-open' ||
          this.circuitBreaker.failures > 0
        ) {
          this.circuitBreaker.failures = 0;
          this.circuitBreaker.state = 'closed';
        }

        return result;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx)
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode && statusCode >= 400 && statusCode < 500) {
          throw error;
        }

        // Circuit breaker: increment failures
        this.circuitBreaker.failures++;
        this.circuitBreaker.lastFailure = new Date();

        // Open circuit after 5 failures
        if (this.circuitBreaker.failures >= 5) {
          this.circuitBreaker.state = 'open';
          throw new Error(
            'Circuit breaker OPENED after 5 consecutive failures. n8n is unreachable.'
          );
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.config.retries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Make a single HTTP request with HMAC signing
   */
  private async makeRequest<T>(
    method: string,
    path: string,
    body?: Record<string, unknown> | Partial<N8nWorkflow> | CredentialData
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();

    // Prepare body
    const bodyString = body ? JSON.stringify(body) : '';
    const bodyHash = crypto
      .createHash('sha256')
      .update(bodyString, 'utf8')
      .digest('hex');

    // Create canonical string for signing
    const canonical = [
      method.toUpperCase(),
      path,
      timestamp,
      nonce,
      bodyHash,
    ].join('\n');

    // Sign with HMAC
    const signature = crypto
      .createHmac('sha256', this.config.hmacSecret)
      .update(canonical, 'utf8')
      .digest('hex');

    // Prepare headers
    const headers: Record<string, string> = {
      'X-N8N-API-KEY': this.config.apiKey,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
      'Content-Type': 'application/json',
      'User-Agent': 'LucidMerged-n8n-Client/1.0',
    };

    // Make request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout
    );

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: bodyString || undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse response
      const responseText = await response.text();
      let data: unknown;

      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = responseText;
      }

      // Handle errors
      if (!response.ok) {
        const message = (data && typeof data === 'object' && 'message' in data)
          ? (data as { message: string }).message
          : `HTTP ${response.status}: ${response.statusText}`;
        const error = new Error(message) as Error & { statusCode: number; response: unknown };
        error.statusCode = response.status;
        error.response = data;
        throw error;
      }

      return data as T;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ==========================================================================
  // Circuit Breaker Status
  // ==========================================================================

  /**
   * Get current circuit breaker state
   */
  getCircuitBreakerState(): CircuitBreakerState {
    return { ...this.circuitBreaker };
  }

  /**
   * Reset circuit breaker (for testing/manual recovery)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker = {
      failures: 0,
      state: 'closed',
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create n8n client from environment variables
 */
export function createN8nClient(): N8nClient {
  const baseUrl = process.env.N8N_BASE_URL || 'http://n8n:5678';
  const apiKey = process.env.N8N_API_KEY || '';
  const hmacSecret = process.env.N8N_HMAC_SECRET || process.env.INTERNAL_API_KEY || '';

  if (!apiKey) {
    throw new Error('N8N_API_KEY is required');
  }

  if (!hmacSecret) {
    throw new Error('N8N_HMAC_SECRET or INTERNAL_API_KEY is required');
  }

  return new N8nClient({
    baseUrl,
    apiKey,
    hmacSecret,
    timeout: parseInt(process.env.N8N_TIMEOUT || '30000'),
    retries: parseInt(process.env.N8N_RETRIES || '3'),
    retryDelay: parseInt(process.env.N8N_RETRY_DELAY || '1000'),
  });
}

// ============================================================================
// Singleton Instance (Optional)
// ============================================================================

let clientInstance: N8nClient | null = null;

/**
 * Get or create singleton n8n client instance
 */
export function getN8nClient(): N8nClient {
  if (!clientInstance) {
    clientInstance = createN8nClient();
  }
  return clientInstance;
}

/**
 * Reset singleton (for testing)
 */
export function resetN8nClient(): void {
  clientInstance = null;
}
