/**
 * Enhanced FlowSpec Validation
 * Real-time validation with detailed issues and suggestions
 */

import type { FlowSpec } from '@/lib/lucid-l2/types'

/** Edge shape used in validation (may differ from FlowEdge) */
interface ValidationEdge {
  source: string
  target: string
}

/**
 * Validate AI prompt input
 */
export function validateAIPrompt(prompt: string): { valid: boolean; sanitized?: string; issues?: string[] } {
  const issues: string[] = []
  
  if (!prompt || typeof prompt !== 'string') {
    return { valid: false, issues: ['Prompt is required'] }
  }
  
  const trimmed = prompt.trim()
  
  if (trimmed.length < 10) {
    issues.push('Prompt is too short (minimum 10 characters)')
  }
  
  if (trimmed.length > 1000) {
    issues.push('Prompt is too long (maximum 1000 characters)')
  }
  
  if (issues.length > 0) {
    return { valid: false, issues }
  }
  
  // Sanitize: remove excessive whitespace
  const sanitized = trimmed.replace(/\s+/g, ' ')
  
  return { valid: true, sanitized }
}

/**
 * Validate workflow complexity against user tier
 */
export function validateComplexity(
  nodeCount: number,
  tier: 'starter' | 'pro' | 'business'
): { valid: boolean; message?: string } {
  const limits = {
    starter: 5,
    pro: 20,
    business: 100,
  }

  const limit = limits[tier] || limits.starter
  
  if (nodeCount > limit) {
    return {
      valid: false,
      message: `Workflow complexity exceeds ${tier} plan limit (${nodeCount} nodes, limit: ${limit}). Upgrade your plan for more complex workflows.`
    }
  }
  
  return { valid: true }
}

export interface ValidationIssue {
  stepId: string
  severity: 'error' | 'warning' | 'info'
  message: string
  suggestion?: string
  quickFix?: () => void
}

export interface ValidationResult {
  isValid: boolean
  issues: ValidationIssue[]
  confidence: number
  status: 'excellent' | 'ready' | 'needs-review' | 'has-errors'
}

/**
 * Comprehensive FlowSpec validation
 */
export function validateFlowSpecEnhanced(flowSpec: FlowSpec): ValidationResult {
  const issues: ValidationIssue[] = []

  // Check 1: Has nodes
  if (!flowSpec?.nodes || flowSpec.nodes.length === 0) {
    issues.push({
      stepId: 'global',
      severity: 'error',
      message: 'Workflow has no steps defined',
      suggestion: 'Add at least one trigger and one action'
    })
    return {
      isValid: false,
      issues,
      confidence: 0,
      status: 'has-errors'
    }
  }

  // Check 2: Has trigger
  const triggers = flowSpec.nodes.filter(n => 
    n.type === 'trigger' || n.type === 'start' || n.type === 'webhook' || n.type === 'schedule'
  )
  if (triggers.length === 0) {
    issues.push({
      stepId: 'global',
      severity: 'error',
      message: 'Missing trigger - workflow needs a starting point',
      suggestion: 'Add a webhook, schedule, or manual trigger'
    })
  } else if (triggers.length > 1) {
    issues.push({
      stepId: triggers[1].id || 'trigger-2',
      severity: 'warning',
      message: 'Multiple triggers detected',
      suggestion: 'Consider splitting into separate workflows'
    })
  }

  // Check 3: Has actions
  const actions = flowSpec.nodes.filter(n => 
    n.type === 'action' || n.type === 'do'
  )
  if (actions.length === 0) {
    issues.push({
      stepId: 'global',
      severity: 'error',
      message: 'No actions defined - workflow does nothing',
      suggestion: 'Add at least one action (send message, save data, etc.)'
    })
  }

  // Check 4: Node parameters
  flowSpec.nodes.forEach(node => {
    const params = (node as unknown as { parameters?: Record<string, unknown> }).parameters || {}
    const paramKeys = Object.keys(params)

    if (paramKeys.length === 0) {
      issues.push({
        stepId: node.id || 'unknown',
        severity: 'warning',
        message: `${node.type} has no parameters configured`,
        suggestion: 'Configure this step to specify what it should do'
      })
    }

    // Check specific parameter requirements
    if (node.type === 'webhook' && !params.url) {
      issues.push({
        stepId: node.id || '',
        severity: 'error',
        message: 'Webhook needs a URL',
        suggestion: 'Add webhook endpoint URL (e.g., /api/webhooks/payment)'
      })
    }

    if ((node.type === 'email' || node.type === 'slack') && !params.message) {
      issues.push({
        stepId: node.id || '',
        severity: 'warning',
        message: `${node.type} needs a message`,
        suggestion: 'Specify what message to send'
      })
    }
  })

  // Check 5: Node connections (if edges exist)
  if (flowSpec.edges && flowSpec.edges.length > 0) {
    const nodeIds = new Set(flowSpec.nodes.map(n => n.id));

    (flowSpec.edges as unknown as ValidationEdge[]).forEach((edge) => {
      if (edge.source && !nodeIds.has(edge.source)) {
        issues.push({
          stepId: edge.source,
          severity: 'error',
          message: 'Connection references missing node',
          suggestion: 'Remove invalid connection or add missing node'
        })
      }
      if (edge.target && !nodeIds.has(edge.target)) {
        issues.push({
          stepId: edge.target,
          severity: 'error',
          message: 'Connection references missing node',
          suggestion: 'Remove invalid connection or add missing node'
        })
      }
    })

    // Check for orphaned nodes (no connections)
    flowSpec.nodes.forEach(node => {
      const hasIncoming = (flowSpec.edges as unknown as ValidationEdge[] | undefined)?.some((e) => e.target === node.id)
      const _hasOutgoing = (flowSpec.edges as unknown as ValidationEdge[] | undefined)?.some((e) => e.source === node.id)
      const isTrigger = node.type === 'trigger' || node.type === 'start'

      if (!isTrigger && !hasIncoming) {
        issues.push({
          stepId: node.id || '',
          severity: 'warning',
          message: 'Step is disconnected from trigger',
          suggestion: 'Connect this step to the workflow'
        })
      }
    })
  }

  // Check 6: Circular dependencies
  if (flowSpec.edges) {
    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    const hasCycle = (nodeId: string): boolean => {
      visited.add(nodeId)
      recursionStack.add(nodeId)

      const outgoing = (flowSpec.edges as unknown as ValidationEdge[] | undefined)?.filter((e) => e.source === nodeId) || []
      for (const edge of outgoing) {
        if (!visited.has(edge.target)) {
          if (hasCycle(edge.target)) return true
        } else if (recursionStack.has(edge.target)) {
          return true
        }
      }

      recursionStack.delete(nodeId)
      return false
    }

    for (const node of flowSpec.nodes) {
      if (node.id && !visited.has(node.id)) {
        if (hasCycle(node.id)) {
          issues.push({
            stepId: 'global',
            severity: 'error',
            message: 'Circular dependency detected',
            suggestion: 'Remove loop - workflow cannot cycle back to itself'
          })
          break
        }
      }
    }
  }

  // Calculate confidence (0-100)
  const errorCount = issues.filter(i => i.severity === 'error').length
  const warningCount = issues.filter(i => i.severity === 'warning').length
  
  let confidence = 100
  confidence -= errorCount * 20  // Each error: -20%
  confidence -= warningCount * 5  // Each warning: -5%
  confidence = Math.max(0, Math.min(100, confidence))

  // Determine status
  let status: ValidationResult['status'] = 'excellent'
  if (errorCount > 0) status = 'has-errors'
  else if (confidence < 70) status = 'needs-review'
  else if (confidence < 90) status = 'ready'

  return {
    isValid: errorCount === 0,
    issues,
    confidence: Math.round(confidence),
    status
  }
}

/**
 * Get status label for UI
 */
export function getStatusLabel(status: ValidationResult['status']): string {
  const labels = {
    'excellent': '✓ Excellent',
    'ready': '✓ Ready to run',
    'needs-review': '⚠ Needs review',
    'has-errors': '⚠ Has errors'
  }
  return labels[status]
}

/**
 * Get status color for UI
 */
export function getStatusColor(status: ValidationResult['status']): string {
  const colors = {
    'excellent': 'text-green-600 bg-green-50 dark:bg-green-950',
    'ready': 'text-green-600 bg-green-50 dark:bg-green-950',
    'needs-review': 'text-amber-600 bg-amber-50 dark:bg-amber-950',
    'has-errors': 'text-red-600 bg-red-50 dark:bg-red-950'
  }
  return colors[status]
}
