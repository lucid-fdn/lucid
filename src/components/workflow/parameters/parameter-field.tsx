/**
 * Dynamic Parameter Field Component
 * 
 * Renders appropriate input based on parameter type
 * Handles: string, number, boolean, options, credentials
 */

'use client'

import { useState, useMemo, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus } from 'lucide-react'
import type { NodeParameter } from '@/hooks/use-node-parameters'
import { useCredentials, type Credential } from '@/hooks/use-credentials'
import { useToast } from '@/hooks/use-toast'
import { useDynamicOptions } from '@/hooks/use-dynamic-options'

// Feature flag: Enable dynamic options when credential is available
// Dynamic options fetch real data from provider (lists, users, etc.)
const ENABLE_DYNAMIC_OPTIONS = true

// ============================================================================
// DEMO DATA - REMOVE WHEN REAL AUTH IS INTEGRATED
// ============================================================================
const DEMO_OPTIONS: Record<string, Array<{ name: string; value: string }>> = {
  // Asana
  workspace: [
    { name: 'My Personal Workspace (Demo)', value: 'demo_workspace_1' },
    { name: 'Team Projects (Demo)', value: 'demo_workspace_2' },
    { name: 'Marketing Team (Demo)', value: 'demo_workspace_3' },
  ],
  project: [
    { name: 'Q4 Product Launch (Demo)', value: 'demo_project_1' },
    { name: 'Website Redesign (Demo)', value: 'demo_project_2' },
    { name: 'Customer Onboarding (Demo)', value: 'demo_project_3' },
  ],
  // Airtable
  base: [
    { name: 'CRM Database (Demo)', value: 'demo_base_1' },
    { name: 'Product Inventory (Demo)', value: 'demo_base_2' },
    { name: 'Content Calendar (Demo)', value: 'demo_base_3' },
  ],
  table: [
    { name: 'Contacts (Demo)', value: 'demo_table_1' },
    { name: 'Companies (Demo)', value: 'demo_table_2' },
    { name: 'Deals (Demo)', value: 'demo_table_3' },
  ],
  // Google Sheets
  spreadsheet: [
    { name: 'Sales Data 2024 (Demo)', value: 'demo_sheet_1' },
    { name: 'Expense Tracker (Demo)', value: 'demo_sheet_2' },
    { name: 'Marketing Metrics (Demo)', value: 'demo_sheet_3' },
  ],
  sheet: [
    { name: 'January (Demo)', value: 'demo_tab_1' },
    { name: 'February (Demo)', value: 'demo_tab_2' },
    { name: 'Q1 Summary (Demo)', value: 'demo_tab_3' },
  ],
  // Slack
  channel: [
    { name: '#general (Demo)', value: 'demo_channel_1' },
    { name: '#engineering (Demo)', value: 'demo_channel_2' },
    { name: '#marketing (Demo)', value: 'demo_channel_3' },
  ],
  // Generic
  resource: [
    { name: 'Resource A (Demo)', value: 'demo_resource_1' },
    { name: 'Resource B (Demo)', value: 'demo_resource_2' },
    { name: 'Resource C (Demo)', value: 'demo_resource_3' },
  ],
}
// ============================================================================

interface NodeDefinitionBase {
  name?: string;
  displayName?: string;
  [key: string]: unknown;
}

interface ParameterFieldProps {
  parameter: NodeParameter
  value: unknown
  onChange: (value: unknown) => void
  nodeDefinition?: NodeDefinitionBase
  currentValues?: Record<string, unknown>
  credentialId?: string | null // Selected OAuth credential ID for dynamic options
}

export function ParameterField({ 
  parameter, 
  value, 
  onChange,
  nodeDefinition,
  currentValues = {},
  credentialId
}: ParameterFieldProps) {
  const { name, displayName, type, required, placeholder, description, options, typeOptions } = parameter

  // Render based on type
  switch (type) {
    case 'callout':
      // Informational callout - render as info box
      return (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3">
          <div className="text-sm text-blue-900 dark:text-blue-100">
            {displayName || description || ''}
          </div>
        </div>
      )

    case 'string':
      return (
        <StringField
          label={displayName}
          value={(value as string) || ''}
          onChange={onChange}
          required={required}
          placeholder={placeholder}
          description={description}
        />
      )

    case 'number':
      return (
        <NumberField
          label={displayName}
          value={(value as string | number) ?? ''}
          onChange={onChange}
          required={required}
          placeholder={placeholder}
          description={description}
          min={typeOptions?.minValue}
          max={typeOptions?.maxValue}
          step={typeOptions?.numberStepSize}
        />
      )

    case 'boolean':
      return (
        <BooleanField
          label={displayName}
          value={(value as boolean) ?? false}
          onChange={onChange}
          description={description}
        />
      )

    case 'options':
      // Detect authentication/credential fields
      const isAuthField = name.toLowerCase().includes('authentication') || 
                         name.toLowerCase().includes('credential') ||
                         name.toLowerCase() === 'auth'
      
      if (isAuthField) {
        return (
          <CredentialsField
            label={displayName}
            value={value as string}
            onChange={onChange}
            required={required}
            description={description}
          />
        )
      }
      
      return (
        <OptionsField
          label={displayName}
          value={(value as string) || ''}
          onChange={onChange}
          required={required}
          options={options || []}
          description={description}
          parameter={parameter}
          nodeDefinition={nodeDefinition}
          currentValues={currentValues}
        />
      )

    case 'json':
      return (
        <JsonField
          label={displayName}
          value={(value as string) || ''}
          onChange={onChange}
          required={required}
          placeholder={placeholder}
          description={description}
        />
      )

    case 'resourceLocator':
      return (
        <ResourceLocatorField
          parameter={parameter}
          value={value}
          onChange={onChange}
          nodeDefinition={nodeDefinition}
          currentValues={currentValues}
          credentialId={credentialId}
        />
      )

    case 'fixedCollection':
      return (
        <FixedCollectionField
          parameter={parameter}
          value={value as Record<string, unknown>}
          onChange={onChange}
        />
      )

    case 'collection':
      return (
        <CollectionArrayField
          parameter={parameter}
          value={value as Record<string, unknown>}
          onChange={onChange}
        />
      )

    case 'multiOptions':
      return (
        <MultiOptionsField
          label={displayName}
          value={(value as string[]) || []}
          onChange={onChange}
          required={required}
          options={options || []}
          description={description}
        />
      )

    case 'credentialsSelect':
      return (
        <CredentialsField
          label={displayName}
          value={value as string}
          onChange={onChange}
          required={required}
          description={description}
        />
      )

    default:
      return (
        <StringField
          label={displayName}
          value={(value as string) || ''}
          onChange={onChange}
          required={required}
          placeholder={placeholder || `Enter ${displayName.toLowerCase()}`}
          description={description}
        />
      )
  }
}

// ============================================================================
// Field Components
// ============================================================================

interface StringFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
  description?: string
}

function StringField({ label, value, onChange, required, placeholder, description }: StringFieldProps) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || `Enter ${label.toLowerCase()}`}
        required={required}
      />
      {description && (
        <p className="text-xs text-muted-foreground break-words">{description}</p>
      )}
    </div>
  )
}

interface NumberFieldProps {
  label: string
  value: number | string
  onChange: (value: number) => void
  required?: boolean
  placeholder?: string
  description?: string
  min?: number
  max?: number
  step?: number
}

function NumberField({ label, value, onChange, required, placeholder, description, min, max, step }: NumberFieldProps) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        placeholder={placeholder || '0'}
        required={required}
        min={min}
        max={max}
        step={step || 1}
      />
      {description && (
        <p className="text-xs text-muted-foreground break-words">{description}</p>
      )}
    </div>
  )
}

interface BooleanFieldProps {
  label: string
  value: boolean
  onChange: (value: boolean) => void
  description?: string
}

function BooleanField({ label, value, onChange, description }: BooleanFieldProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Switch
          checked={value}
          onCheckedChange={onChange}
        />
      </div>
      {description && (
        <p className="text-xs text-muted-foreground break-words">{description}</p>
      )}
    </div>
  )
}

interface OptionsFieldProps {
  label: string
  value: string | number
  onChange: (value: string | number) => void
  required?: boolean
  options: Array<{ name: string; value: string | number; description?: string }>
  description?: string
  parameter?: NodeParameter
  nodeDefinition?: NodeDefinitionBase
  currentValues?: Record<string, unknown>
}

function OptionsField({ 
  label, 
  value, 
  onChange, 
  required, 
  options: staticOptions, 
  description,
  parameter,
  nodeDefinition,
  currentValues = {}
}: OptionsFieldProps) {
  // Always call hook unconditionally (Rules of Hooks)
  // Dynamic options loaded when parameter has dependencies
  const {
    options: dynamicOptions,
    isLoading: loadingOptions,
    error: optionsError
  } = useDynamicOptions(nodeDefinition, parameter!, currentValues)
  
  // DEMO: Check if we have hardcoded demo data for this parameter
  const paramName = parameter?.name?.toLowerCase() || ''
  const demoOptions = DEMO_OPTIONS[paramName] || null
  
  // Priority: Dynamic > Demo > Static
  const options = ENABLE_DYNAMIC_OPTIONS && dynamicOptions.length > 0 
    ? dynamicOptions 
    : demoOptions || staticOptions
  
  // Make resource/operation read-only (show as context, not editable)
  const isReadOnly = label.toLowerCase() === 'resource' || label.toLowerCase() === 'operation'
  
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
        {loadingOptions && <span className="text-xs text-muted-foreground ml-2">(loading...)</span>}
      </Label>
      <Select 
        value={String(value)} 
        onValueChange={(v) => onChange(v)} 
        disabled={isReadOnly || loadingOptions}
      >
        <SelectTrigger className={isReadOnly ? 'bg-muted cursor-not-allowed' : ''}>
          <SelectValue placeholder={
            loadingOptions 
              ? 'Loading options...' 
              : `Select ${label.toLowerCase()}`
          } />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 && !loadingOptions && (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              {optionsError ? 'Failed to load options' : 'No options available'}
            </div>
          )}
          {options.map((option: { name: string; value: string | number }) => (
            <SelectItem key={option.value} value={String(option.value)}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {optionsError && (
        <p className="text-xs text-destructive">{optionsError}</p>
      )}
      {description && (
        <p className="text-xs text-muted-foreground break-words">{description}</p>
      )}
    </div>
  )
}

interface JsonFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
  description?: string
}

function JsonField({ label, value, onChange, required, placeholder, description }: JsonFieldProps) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Enter JSON'}
        className="font-mono text-sm"
        rows={4}
      />
      {description && (
        <p className="text-xs text-muted-foreground break-words">{description}</p>
      )}
    </div>
  )
}

// ============================================================================
// Advanced Field Components
// ============================================================================

interface ResourceLocatorFieldProps {
  parameter: NodeParameter
  value: unknown
  onChange: (value: unknown) => void
  nodeDefinition?: NodeDefinitionBase
  currentValues?: Record<string, unknown>
  credentialId?: string | null // Selected OAuth credential ID
}

function ResourceLocatorField({ parameter, value, onChange, nodeDefinition, currentValues: _currentValues = {}, credentialId }: ResourceLocatorFieldProps) {
  const { displayName, required, description, typeOptions: _typeOptions } = parameter
  const [dynamicOptions, setDynamicOptions] = useState<Array<{ name: string; value: string }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Extract options from typeOptions or use simple dropdown
  // For MVP: treat as options field with list mode
  const valueObj = value as Record<string, unknown> | null | undefined
  const defaultValue = String((valueObj && typeof valueObj === 'object' ? valueObj.value : value) || '')
  
  // Check if this field needs OAuth-based dynamic loading
  const needsOAuthOptions = useMemo(() => {
    // resourceLocator fields like "list" for Twitter need OAuth
    // Check if there's a loadOptionsMethod or if the parameter name suggests OAuth resource
    const oauthResourceNames = ['list', 'channel', 'spreadsheet', 'sheet', 'database', 'board', 'workspace']
    const isOAuthResource = oauthResourceNames.includes(parameter.name.toLowerCase())
    return isOAuthResource && credentialId
  }, [parameter.name, credentialId])
  
  // Map node type to OAuth provider
  const oauthProvider = useMemo(() => {
    if (!nodeDefinition?.name) return null
    const nodeName = nodeDefinition.name.toLowerCase()
    // Map n8n node names to OAuth provider IDs
    if (nodeName.includes('twitter') || nodeName.includes('x')) return 'twitter'
    if (nodeName.includes('slack')) return 'slack'
    if (nodeName.includes('google')) return 'google-sheets'
    if (nodeName.includes('notion')) return 'notion'
    if (nodeName.includes('airtable')) return 'airtable'
    if (nodeName.includes('discord')) return 'discord'
    return null
  }, [nodeDefinition])
  
  // Map parameter name to resource type
  const resourceType = useMemo(() => {
    const name = parameter.name.toLowerCase()
    if (name === 'list') return 'lists'
    if (name === 'channel') return 'channels'
    if (name === 'spreadsheet') return 'spreadsheets'
    if (name === 'sheet') return 'sheets'
    if (name === 'database') return 'databases'
    if (name === 'workspace') return 'workspaces'
    return name + 's' // Default pluralization
  }, [parameter.name])
  
  // Fetch dynamic options from OAuth backend
  useEffect(() => {
    if (!needsOAuthOptions || !oauthProvider || !credentialId) {
      return
    }
    
    const fetchOAuthOptions = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        console.log('[ResourceLocatorField] Fetching OAuth options:', {
          provider: oauthProvider,
          resource: resourceType,
          credentialId
        })
        
        // Call OAuth backend for dynamic options
        const response = await fetch(
          `/api/oauth/${oauthProvider}/resources/${resourceType}?connectionId=${encodeURIComponent(credentialId)}`,
          {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
          }
        )
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to load ${resourceType}`)
        }
        
        const data = await response.json()
        console.log('[ResourceLocatorField] OAuth options loaded:', data)

        // Transform response to options format
        const options = Array.isArray(data.options)
          ? data.options
          : Array.isArray(data.data)
            ? data.data.map((item: Record<string, unknown>) => ({
                name: (item.name || item.title || item.label || item.id) as string,
                value: (item.id || item.value) as string
              }))
            : []
        
        setDynamicOptions(options)
      } catch (err) {
        console.error('[ResourceLocatorField] Failed to load OAuth options:', err)
        setError(err instanceof Error ? err.message : 'Failed to load options')
        setDynamicOptions([])
      } finally {
        setIsLoading(false)
      }
    }
    
    fetchOAuthOptions()
  }, [needsOAuthOptions, oauthProvider, resourceType, credentialId])
  
  // Determine which options to use
  const options = useMemo(() => {
    if (needsOAuthOptions && dynamicOptions.length > 0) {
      return dynamicOptions
    }
    return parameter.options || []
  }, [needsOAuthOptions, dynamicOptions, parameter.options])
  
  // If we have options (static or dynamic), show dropdown
  if (options.length > 0 || isLoading) {
    return (
      <div className="space-y-2">
        <Label>
          {displayName}
          {required && <span className="text-destructive ml-1">*</span>}
          {isLoading && <span className="text-xs text-muted-foreground ml-2">(loading...)</span>}
        </Label>
        <Select 
          value={String(defaultValue)} 
          onValueChange={(v) => onChange({ mode: 'list', value: v })}
          disabled={isLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder={
              isLoading 
                ? 'Loading...' 
                : `Select ${displayName.toLowerCase()}`
            } />
          </SelectTrigger>
          <SelectContent>
            {options.length === 0 && !isLoading && (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                {error ? 'Failed to load options' : 'No options available'}
              </div>
            )}
            {options.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
        {!error && needsOAuthOptions && !credentialId && (
          <p className="text-xs text-amber-600">Connect an account above to load options</p>
        )}
        {description && (
          <p className="text-xs text-muted-foreground break-words">{description}</p>
        )}
      </div>
    )
  }
  
  // Fallback to string input
  return (
    <div className="space-y-2">
      <Label>
        {displayName}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Input
        value={defaultValue}
        onChange={(e) => onChange({ mode: 'list', value: e.target.value })}
        placeholder={`Enter ${displayName.toLowerCase()}`}
        required={required}
      />
      {needsOAuthOptions && !credentialId && (
        <p className="text-xs text-amber-600">Connect an account to see available options</p>
      )}
      {description && (
        <p className="text-xs text-muted-foreground break-words">{description}</p>
      )}
    </div>
  )
}

interface FixedCollectionFieldProps {
  parameter: NodeParameter
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
}

function FixedCollectionField({ parameter, value, onChange }: FixedCollectionFieldProps) {
  const { displayName, description, options } = parameter
  
  // Get nested fields from options[0].values
  // Note: For fixedCollection, options structure is different from simple options
  const nestedFields = ((options as unknown as Array<{ values?: NodeParameter[] }>)?.[0]?.values) || []
  
  if (nestedFields.length === 0) {
    return (
      <div className="space-y-2">
        <Label>{displayName}</Label>
        <div className="p-4 border rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground">
            {description || 'No fields available'}
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
      <div>
        <Label className="text-base">{displayName}</Label>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      
      {/* Render nested fields recursively */}
      {nestedFields.map((field: NodeParameter) => (
        <ParameterField
          key={field.name}
          parameter={field}
          value={value?.[field.name]}
          onChange={(v) => onChange({ ...value, [field.name]: v })}
        />
      ))}
    </div>
  )
}

interface CollectionArrayFieldProps {
  parameter: NodeParameter
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
}

function CollectionArrayField({ parameter, value, onChange }: CollectionArrayFieldProps) {
  const { displayName, description, options } = parameter
  
  // Collection type has nested options for sub-fields
  const nestedFields = options || []
  
  if (nestedFields.length === 0) {
    return (
      <div className="space-y-2">
        <Label>{displayName}</Label>
        <div className="p-4 border rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground">
            {description || 'No options available'}
          </p>
        </div>
      </div>
    )
  }
  
  // Render as expandable section with nested fields
  return (
    <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
      <div>
        <Label className="text-base">{displayName}</Label>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      
      {/* Render nested fields */}
      <div className="space-y-4 pl-2 border-l-2 border-muted">
        {(nestedFields as unknown as NodeParameter[]).map((field: NodeParameter) => (
          <ParameterField
            key={field.name}
            parameter={field}
            value={value?.[field.name]}
            onChange={(v) => onChange({ ...value, [field.name]: v })}
          />
        ))}
      </div>
    </div>
  )
}

interface MultiOptionsFieldProps {
  label: string
  value: (string | number)[]
  onChange: (value: (string | number)[]) => void
  required?: boolean
  options: Array<{ name: string; value: string | number; description?: string }>
  description?: string
}

function MultiOptionsField({ label, value, onChange, required, options, description }: MultiOptionsFieldProps) {
  // MVP: Use checkboxes for multi-select
  const selectedValues = Array.isArray(value) ? value : []
  
  const toggleOption = (optionValue: string | number) => {
    const newValue = selectedValues.includes(optionValue)
      ? selectedValues.filter(v => v !== optionValue)
      : [...selectedValues, optionValue]
    onChange(newValue)
  }
  
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedValues.includes(option.value)}
              onChange={() => toggleOption(option.value)}
              className="rounded border-border"
            />
            <span className="text-sm">{option.name}</span>
          </label>
        ))}
      </div>
      {description && (
        <p className="text-xs text-muted-foreground break-words">{description}</p>
      )}
    </div>
  )
}

interface CredentialsFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  description?: string
}

function CredentialsField({ label, value, onChange, required, description }: CredentialsFieldProps) {
  const { credentials, isLoading, refetch } = useCredentials()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const toastUtils = useToast()
  
  // Form state for quick creation
  const [name, setName] = useState('')
  const [type, setType] = useState<'api_key' | 'basic_auth' | 'oauth2' | 'custom_headers'>('api_key')
  const [apiKey, setApiKey] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  
  // Handle value conversion (empty/null to __none__)
  const selectValue = value || '__none__'
  const handleChange = (newValue: string) => {
    if (newValue === '__new__') {
      setShowCreateModal(true)
      return
    }
    onChange(newValue === '__none__' ? '' : newValue)
  }
  
  const handleCreateCredential = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)
    
    try {
      let data: Record<string, string> = {}

      switch (type) {
        case 'api_key':
          data = { key: apiKey, headerName: 'Authorization', prefix: 'Bearer ' }
          break
        case 'basic_auth':
          data = { username, password }
          break
        case 'oauth2':
          data = { accessToken: apiKey, refreshToken: '', tokenType: 'Bearer' }
          break
      }
      
      const response = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, type, data }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create credential')
      }
      
      const result = await response.json()
      
      // Refresh credentials list
      await refetch()
      
      // Auto-select the new credential
      onChange(result.credential.id)
      
      // Close modal and reset form
      setShowCreateModal(false)
      setName('')
      setApiKey('')
      setUsername('')
      setPassword('')
      
      toastUtils.success('Credential created successfully')
    } catch (error) {
      toastUtils.error(
        error instanceof Error ? error.message : 'Failed to create credential'
      )
    } finally {
      setIsCreating(false)
    }
  }
  
  return (
    <>
      <div className="space-y-2">
        <Label>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Select value={selectValue} onValueChange={handleChange} disabled={isLoading}>
          <SelectTrigger>
            <SelectValue placeholder={isLoading ? "Loading..." : "Select credential"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              <span className="text-muted-foreground">No credential selected</span>
            </SelectItem>
            {credentials.map((cred: Credential) => (
              <SelectItem key={cred.id} value={cred.id}>
                {cred.name}
              </SelectItem>
            ))}
            <SelectItem value="__new__">
              <div className="flex items-center gap-2 text-primary">
                <Plus className="w-4 h-4" />
                <span className="font-medium">New Credential</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        {description && (
          <p className="text-xs text-muted-foreground break-words">{description}</p>
        )}
      </div>
      
      {/* Quick Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Credential</DialogTitle>
            <DialogDescription>
              Add a new credential to use in your workflow
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleCreateCredential} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cred-name">Name *</Label>
              <Input
                id="cred-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., My API Key"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="cred-type">Type *</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'api_key' | 'basic_auth' | 'oauth2' | 'custom_headers')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="api_key">API Key</SelectItem>
                  <SelectItem value="basic_auth">Basic Auth</SelectItem>
                  <SelectItem value="oauth2">OAuth2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {type === 'api_key' && (
              <div className="space-y-2">
                <Label htmlFor="cred-key">API Key *</Label>
                <Input
                  id="cred-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  required
                />
              </div>
            )}
            
            {type === 'basic_auth' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="cred-username">Username *</Label>
                  <Input
                    id="cred-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cred-password">Password *</Label>
                  <Input
                    id="cred-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </>
            )}
            
            {type === 'oauth2' && (
              <div className="space-y-2">
                <Label htmlFor="cred-token">Access Token *</Label>
                <Textarea
                  id="cred-token"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter access token"
                  required
                  rows={3}
                />
              </div>
            )}
            
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateModal(false)}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
