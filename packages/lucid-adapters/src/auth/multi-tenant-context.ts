/**
 * Multi-Tenant Context — wraps OpenClaw sessions with org/project/env scoping.
 * Every DB operation is scoped to the tenant context.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TenantContext } from '../types'

export class MultiTenantContext {
  private context: TenantContext | null = null

  constructor(private supabase: SupabaseClient) {}

  /** Set the current tenant context */
  setContext(context: TenantContext): void {
    this.context = context
  }

  /** Get the current tenant context (throws if not set) */
  getContext(): TenantContext {
    if (!this.context) {
      throw new Error('Tenant context not set. Call setContext() before accessing scoped resources.')
    }
    return this.context
  }

  /** Resolve tenant context from an assistant ID */
  async resolveFromAssistant(assistantId: string): Promise<TenantContext> {
    const { data, error } = await this.supabase
      .from('assistants')
      .select('org_id, project_id, env_id')
      .eq('id', assistantId)
      .single()

    if (error || !data) {
      throw new Error(`Failed to resolve tenant for assistant ${assistantId}: ${error?.message ?? 'not found'}`)
    }

    const context: TenantContext = {
      orgId: data.org_id,
      projectId: data.project_id,
      envId: data.env_id,
    }

    this.context = context
    return context
  }

  /** Check if a tenant context is currently set */
  hasContext(): boolean {
    return this.context !== null
  }

  /** Clear the current tenant context */
  clearContext(): void {
    this.context = null
  }
}