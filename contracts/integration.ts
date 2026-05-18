/**
 * Integration Types — shared between server service and client context.
 *
 * Single source of truth. Import from '@contracts/integration'.
 */

export interface Integration {
  id: string
  slug: string
  name: string
  description: string | null
  category: string
  auth_provider: string
  installed: boolean
  installation_id: string | null
  connection_status: 'connected' | 'setup_required'
  connection_id: string | null
  tools: Array<{ name: string; description?: string }> | null
  tool_count: number
}
