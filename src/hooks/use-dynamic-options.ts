/**
 * Hook for loading dynamic options based on parameter dependencies
 * 
 * n8n nodes often have parameters whose options depend on other parameters.
 * For example, "Table" options depend on which "Base" is selected.
 * 
 * This hook:
 * 1. Detects when a parameter has loadOptionsDependsOn
 * 2. Watches those dependency values
 * 3. Fetches new options when dependencies change
 * 4. Caches results per dependency combination
 */

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { NodeParameter } from './use-node-parameters'
import { redactLogMetadata, summarizeError } from '@/lib/logging/safe-log'

// ============================================================================
// Types
// ============================================================================

interface DynamicOptionsResult {
  options: Array<{ name: string; value: string | number; description?: string }>
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

interface OptionItem {
  name: string
  value: string | number
  description?: string
}

interface OptionsCache {
  [key: string]: {
    options: OptionItem[]
    timestamp: number
  }
}

// ============================================================================
// Cache (5 minute TTL)
// ============================================================================

const optionsCache: OptionsCache = {}
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const DEBUG_DYNAMIC_OPTIONS = process.env.NEXT_PUBLIC_DEBUG_DYNAMIC_OPTIONS === 'true'

function debugDynamicOptions(message: string, metadata?: Record<string, unknown>) {
  if (!DEBUG_DYNAMIC_OPTIONS) return
  console.debug(`[useDynamicOptions] ${message}`, redactLogMetadata(metadata))
}

function getCacheKey(nodeName: string, paramName: string, dependencies: Record<string, unknown>): string {
  const depsString = JSON.stringify(dependencies)
  return `${nodeName}:${paramName}:${depsString}`
}

function getCachedOptions(key: string): OptionItem[] | null {
  const cached = optionsCache[key]
  if (!cached) return null
  
  const age = Date.now() - cached.timestamp
  if (age > CACHE_TTL) {
    delete optionsCache[key]
    return null
  }
  
  return cached.options
}

function setCachedOptions(key: string, options: OptionItem[]): void {
  optionsCache[key] = {
    options,
    timestamp: Date.now()
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useDynamicOptions(
  nodeDefinition: Record<string, unknown> | null | undefined,
  parameter: NodeParameter,
  currentValues: Record<string, unknown>
): DynamicOptionsResult {
  const [options, setOptions] = useState<OptionItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if this parameter needs dynamic loading
  const needsDynamicLoading = useMemo(() => {
    return !!(
      parameter.typeOptions?.loadOptionsDependsOn ||
      parameter.typeOptions?.loadOptionsMethod
    )
  }, [parameter])

  // Extract dependency values
  const dependencies = useMemo(() => {
    if (!parameter.typeOptions?.loadOptionsDependsOn) return {}
    
    const deps: Record<string, unknown> = {}
    for (const depPath of parameter.typeOptions.loadOptionsDependsOn) {
      // Handle nested paths like "base.value"
      const value = getNestedValue(currentValues, depPath)
      deps[depPath] = value
    }
    return deps
  }, [parameter, currentValues])

  // Check if all dependencies are satisfied
  const hasAllDependencies = useMemo(() => {
    if (!parameter.typeOptions?.loadOptionsDependsOn) return true
    
    return parameter.typeOptions.loadOptionsDependsOn.every(depPath => {
      const value = getNestedValue(currentValues, depPath)
      return value !== undefined && value !== null && value !== ''
    })
  }, [parameter, currentValues])

  // Fetch options
  const fetchOptions = useCallback(async () => {
    if (!needsDynamicLoading || !hasAllDependencies) {
      return
    }

    const cacheKey = getCacheKey(
      (nodeDefinition?.name as string) || 'unknown',
      parameter.name,
      dependencies
    )

    // Check cache first
    const cached = getCachedOptions(cacheKey)
    if (cached) {
      debugDynamicOptions('Cache hit', { parameterName: parameter.name })
      setOptions(cached)
      return
    }

    debugDynamicOptions('Fetching options', {
      parameterName: parameter.name,
      dependencyKeys: Object.keys(dependencies),
    })
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/lucid-l2/node-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeName: nodeDefinition?.name,
          nodeVersion: nodeDefinition?.version,
          parameterName: parameter.name,
          loadOptionsMethod: parameter.typeOptions?.loadOptionsMethod,
          currentValues: currentValues
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to load options: ${response.statusText}`)
      }

      const data = await response.json()
      const fetchedOptions = data.options || []

      // Cache the result
      setCachedOptions(cacheKey, fetchedOptions)

      setOptions(fetchedOptions)
      debugDynamicOptions('Loaded options', {
        parameterName: parameter.name,
        optionCount: fetchedOptions.length,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load options'
      console.error('[useDynamicOptions] Error:', summarizeError(err))
      setError(errorMessage)
      setOptions([])
    } finally {
      setIsLoading(false)
    }
  }, [needsDynamicLoading, hasAllDependencies, nodeDefinition, parameter, dependencies, currentValues])

  // Auto-fetch when dependencies change
  useEffect(() => {
    if (needsDynamicLoading && hasAllDependencies) {
      fetchOptions()
    } else if (!hasAllDependencies) {
      // Clear options when dependencies are not satisfied
      setOptions([])
      setError(null)
    }
  }, [needsDynamicLoading, hasAllDependencies, fetchOptions])

  // Return static options if no dynamic loading needed
  const finalOptions = useMemo(() => {
    if (!needsDynamicLoading) {
      return parameter.options || []
    }
    return options
  }, [needsDynamicLoading, parameter.options, options])

  return {
    options: finalOptions,
    isLoading,
    error,
    refetch: fetchOptions
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  // Handle paths like "base.value" or just "base"
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

// ============================================================================
// Export cache management
// ============================================================================

export function clearDynamicOptionsCache(): void {
  Object.keys(optionsCache).forEach(key => delete optionsCache[key])
  console.log('[useDynamicOptions] Cache cleared')
}
