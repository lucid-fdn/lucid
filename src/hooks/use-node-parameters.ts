/**
 * Hook for extracting and managing node parameters
 *
 * Parses node properties to extract parameters based on selected resource/operation
 * Handles parameter dependencies (displayOptions)
 */

'use client'

import { useMemo } from 'react'

// ============================================================================
// Types
// ============================================================================

/** Raw property shape from a node definition */
interface NodePropertyRaw {
  name: string
  displayName?: string
  type?: string
  required?: boolean
  default?: unknown
  description?: string
  placeholder?: string
  options?: Array<{ name: string; value: string | number; description?: string }>
  displayOptions?: {
    show?: Record<string, Array<string | number>>
    hide?: Record<string, Array<string | number>>
  }
  typeOptions?: NodeParameter['typeOptions']
}

export interface NodeParameter {
  name: string
  displayName: string
  type: string
  required?: boolean
  default?: unknown
  description?: string
  placeholder?: string
  options?: Array<{ name: string; value: string | number; description?: string }>
  displayOptions?: {
    show?: Record<string, Array<string | number>>
    hide?: Record<string, Array<string | number>>
  }
  typeOptions?: {
    minValue?: number
    maxValue?: number
    numberStepSize?: number
    multipleValues?: boolean
    multipleValueButtonText?: string
    loadOptionsDependsOn?: string[]
    loadOptionsMethod?: string
    searchListMethod?: string
    searchable?: boolean
  }
}

export interface NodeParametersResult {
  parameters: NodeParameter[]
  isLoading: boolean
  error: string | null
}

// ============================================================================
// Hook
// ============================================================================

export function useNodeParameters(
  nodeDefinition: Record<string, unknown> | null | undefined,
  selectedResource?: string,
  selectedOperation?: string
): NodeParametersResult {
  const parameters = useMemo(() => {
    if (!nodeDefinition || !nodeDefinition.properties) {
      return []
    }

    try {
      const result = extractParameters(nodeDefinition, selectedResource, selectedOperation)
      return result
    } catch (_err) {
      return []
    }
  }, [nodeDefinition, selectedResource, selectedOperation])

  return {
    parameters,
    isLoading: false,
    error: null
  }
}

// ============================================================================
// Parameter Extraction
// ============================================================================

function extractParameters(
  node: Record<string, unknown>,
  resource?: string,
  operation?: string
): NodeParameter[] {
  const properties = (Array.isArray(node.properties) ? node.properties : []) as NodePropertyRaw[]
  const parameters: NodeParameter[] = []

  // Skip selection fields that were already chosen during node creation
  // resource/operation are selected in node-action-selector, no need to show again
  // Also skip AI Tool metadata fields
  const skipNames = ['resource', 'operation', 'descriptionType', 'toolDescription']

  for (const prop of properties) {
    // Skip already-selected fields and metadata
    if (skipNames.includes(prop.name)) {
      continue
    }

    // Check if this parameter should be shown based on current selection
    const shouldShow = shouldShowParameter(prop, resource, operation)
    if (!shouldShow) {
      continue
    }

    // Convert to our parameter format
    parameters.push({
      name: prop.name,
      displayName: prop.displayName || prop.name,
      type: prop.type || 'string',
      required: prop.required || false,
      default: prop.default,
      description: prop.description,
      placeholder: prop.placeholder,
      options: prop.options,
      displayOptions: prop.displayOptions,
      typeOptions: prop.typeOptions
    })
  }

  return parameters
}

function shouldShowParameter(
  param: NodePropertyRaw,
  resource?: string,
  operation?: string
): boolean {
  // If no displayOptions, always show
  if (!param.displayOptions) {
    return true
  }

  const { show, hide } = param.displayOptions

  // Check hide conditions first
  if (hide) {
    if (resource && hide.resource?.includes(resource)) {
      return false
    }
    if (operation && hide.operation?.includes(operation)) {
      return false
    }
  }

  // Check show conditions
  if (show) {
    // Only check resource/operation if they're actually specified in displayOptions
    const hasResourceCondition = show.resource !== undefined
    const hasOperationCondition = show.operation !== undefined

    // If neither resource nor operation conditions exist, show the parameter
    // (it likely has other conditions that will be checked dynamically)
    if (!hasResourceCondition && !hasOperationCondition) {
      return true
    }

    // Check resource condition if it exists
    if (hasResourceCondition && resource) {
      if (!show.resource.includes(resource)) {
        return false
      }
    }

    // Check operation condition if it exists
    if (hasOperationCondition && operation) {
      if (!show.operation.includes(operation)) {
        return false
      }
    }

    // If we have conditions but no values to check against, show the parameter
    // (we can't validate conditions we don't have values for yet)
    if ((hasResourceCondition && !resource) || (hasOperationCondition && !operation)) {
      return true
    }
  }

  return true
}

// ============================================================================
// Helper: Filter parameters by current form values
// ============================================================================

export function filterParametersByValues(
  parameters: NodeParameter[],
  formValues: Record<string, unknown>
): NodeParameter[] {
  return parameters.filter(param => {
    if (!param.displayOptions) {
      return true
    }

    const { show, hide } = param.displayOptions

    // Check hide conditions
    if (hide) {
      for (const [key, values] of Object.entries(hide)) {
        const formVal = formValues[key] as string | number
        if (formVal && values.includes(formVal)) {
          return false
        }
      }
    }

  // Check show conditions
  if (show) {
    for (const [key, values] of Object.entries(show)) {
      const formVal = formValues[key] as string | number | undefined
      // Use explicit undefined check to handle boolean false values correctly
      if (formVal === undefined || !values.includes(formVal)) {
        return false
      }
    }
  }

    return true
  })
}
