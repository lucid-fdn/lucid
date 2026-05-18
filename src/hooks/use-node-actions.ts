/**
 * Hook for managing node actions/operations
 * 
 * Parses node properties to extract resources and their operations
 * following the pattern documented in docs/N8N_NODE_ACTIONS_API_GUIDE.md
 */

'use client'

import { useState, useEffect, useMemo } from 'react'

// ============================================================================
// Types
// ============================================================================

export interface NodeAction {
  name: string
  value: string
  action: string
  description?: string
}

export interface NodeResource {
  name: string
  value: string
  actions: NodeAction[]
}

export interface NodeActionsResult {
  resources: NodeResource[]
  allActions: NodeAction[] // Flattened list for search
  isLoading: boolean
  error: string | null
}

// ============================================================================
// Hook
// ============================================================================

export function useNodeActions(nodeDefinition: Record<string, unknown> | null | undefined): NodeActionsResult {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Parse resources and actions from node definition
  const resources = useMemo(() => {
    if (!nodeDefinition || !nodeDefinition.properties) {
      return []
    }

    try {
      return extractResourcesAndActions(nodeDefinition)
    } catch (err) {
      console.error('[useNodeActions] Error parsing actions:', err)
      setError(err instanceof Error ? err.message : 'Failed to parse actions')
      return []
    }
  }, [nodeDefinition])

  // Flatten actions for search
  const allActions = useMemo(() => {
    return resources.flatMap(resource =>
      resource.actions.map(action => ({
        ...action,
        resource: resource.name,
        resourceValue: resource.value
      }))
    )
  }, [resources])

  useEffect(() => {
    setIsLoading(false)
  }, [resources])

  return {
    resources,
    allActions,
    isLoading,
    error
  }
}

// ============================================================================
// Parser Functions
// ============================================================================

function extractResourcesAndActions(node: Record<string, unknown>): NodeResource[] {
  // Find resource property
  const properties = node.properties as Record<string, unknown>[] | undefined
  const resourceProp = properties?.find(
    (p) => p.name === 'resource' && p.type === 'options'
  )

  if (!resourceProp || !resourceProp.options) {
    // No resources - might have direct operations
    return extractDirectOperations(node)
  }

  const resources = resourceProp.options as Record<string, unknown>[]

  // For each resource, find its operations
  return resources.map((resource) => {
    const operationProp = properties!.find((p) => {
      const displayOptions = p.displayOptions as Record<string, Record<string, unknown[]>> | undefined
      return p.name === 'operation' &&
        p.type === 'options' &&
        displayOptions?.show?.resource?.includes(resource.value as string)
    })

    const actions = ((operationProp?.options || []) as Record<string, unknown>[])

    return {
      name: resource.name as string,
      value: resource.value as string,
      actions: actions.map((action) => ({
        name: action.name as string,
        value: action.value as string,
        action: (action.action as string) || `${action.name} ${resource.name}`,
        description: action.description as string | undefined
      }))
    }
  })
}

function extractDirectOperations(node: Record<string, unknown>): NodeResource[] {
  // For nodes without resources, look for direct operations
  const properties = node.properties as Record<string, unknown>[] | undefined
  const operationProp = properties?.find(
    (p) => p.name === 'operation' && p.type === 'options'
  )

  if (!operationProp || !operationProp.options) {
    // No operations found - this is a node that doesn't use resource/operation pattern
    // (like triggers, webhooks, AI agents, etc that just have direct configuration)
    return []
  }

  const options = operationProp.options as Record<string, unknown>[]

  // Create a single "Actions" resource
  return [{
    name: 'Actions',
    value: 'default',
    actions: options.map((action) => ({
      name: action.name as string,
      value: action.value as string,
      action: (action.action as string) || (action.name as string),
      description: action.description as string | undefined
    }))
  }]
}
