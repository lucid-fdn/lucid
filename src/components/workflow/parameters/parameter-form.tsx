/**
 * Parameter Form Component
 * 
 * Dynamic form that renders parameters for selected node action
 * Handles dependencies and form state management
 */

'use client'

import { useState, useMemo, useEffect } from 'react'
import { useNodeParameters, filterParametersByValues } from '@/hooks/use-node-parameters'
import { ParameterField } from './parameter-field'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { AlertCircle } from 'lucide-react'

interface ParameterFormProps {
  nodeDefinition: Record<string, unknown>
  selectedResource: string
  selectedOperation: string
  selectedAction?: { name: string; value: string; description?: string } // Full action object
  onSubmit: (parameters: Record<string, unknown>) => void
  onCancel: () => void
}

export function ParameterForm({
  nodeDefinition,
  selectedResource,
  selectedOperation,
  selectedAction,
  onSubmit,
  onCancel
}: ParameterFormProps) {
  // Get parameters for this action
  const { parameters: allParameters, isLoading } = useNodeParameters(
    nodeDefinition,
    selectedResource,
    selectedOperation
  )
  
  // Debug logging
  console.log('[ParameterForm] Rendering with:', {
    hasDefinition: !!nodeDefinition,
    selectedResource,
    selectedOperation,
    parametersCount: allParameters.length,
    parameters: allParameters.map(p => ({ name: p.name, displayName: p.displayName, type: p.type }))
  })

  // Form state
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'parameters' | 'settings'>('parameters')
  
  // Settings state (n8n standard node settings)
  const [settings, setSettings] = useState({
    alwaysOutputData: false,
    executeOnce: false,
    retryOnFail: false,
    onError: 'stopWorkflow' as 'stopWorkflow' | 'continueRegularOutput' | 'continueErrorOutput',
    notes: '',
    displayNoteInFlow: false,
  })

  // Initialize form with defaults
  useEffect(() => {
    const defaults: Record<string, unknown> = {}
    allParameters.forEach(param => {
      if (param.default !== undefined) {
        defaults[param.name] = param.default
      }
    })
    setFormData(defaults)
  }, [allParameters])

  // Filter parameters based on current form values (dependencies)
  // IMPORTANT: Include resource/operation in context for displayOptions checking
  const visibleParameters = useMemo(() => {
    const contextWithResourceOperation = {
      ...formData,
      resource: selectedResource,
      operation: selectedOperation
    }
    const filtered = filterParametersByValues(allParameters, contextWithResourceOperation)
    console.log('[ParameterForm] Filtered parameters:', {
      total: allParameters.length,
      visible: filtered.length,
      context: contextWithResourceOperation,
      hidden: allParameters.filter(p => !filtered.includes(p)).map(p => ({
        name: p.name,
        displayOptions: p.displayOptions
      }))
    })
    return filtered
  }, [allParameters, formData, selectedResource, selectedOperation])

  // Handle field change
  const handleFieldChange = (name: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [name]: value }))
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  // Validate form
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    visibleParameters.forEach(param => {
      if (param.required) {
        const value = formData[param.name]
        if (value === undefined || value === null || value === '') {
          newErrors[param.name] = `${param.displayName} is required`
        }
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle submit
  const handleSubmit = () => {
    if (!validate()) {
      return
    }

    // Only submit values for visible parameters
    const submittedData: Record<string, unknown> = {}
    visibleParameters.forEach(param => {
      if (formData[param.name] !== undefined) {
        submittedData[param.name] = formData[param.name]
      }
    })

    // Include settings with parameters
    const fullNodeConfig = {
      parameters: submittedData,
      settings: settings
    }

    onSubmit(fullNodeConfig)
  }

  // Check if form is valid
  const hasRequiredFields = visibleParameters.some(p => p.required)
  const hasErrors = Object.keys(errors).length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Action Context Header - n8n style */}
      <div className="p-4 border-b space-y-3">
        {/* Action Name */}
        <div>
          <h3 className="text-lg font-semibold">
            {selectedAction?.name || selectedOperation || 'Configure Parameters'}
          </h3>
          {selectedAction?.description && (
            <p className="text-xs text-muted-foreground mt-1">
              {selectedAction.description}
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b">
          <button 
            className={`pb-2 text-sm font-medium transition-colors ${
              activeTab === 'parameters' 
                ? 'border-b-2 border-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('parameters')}
          >
            Parameters
          </button>
          <button 
            className={`pb-2 text-sm font-medium transition-colors ${
              activeTab === 'settings' 
                ? 'border-b-2 border-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>
      </div>

      {/* Content Area - Parameters or Settings */}
      <div className="flex-1">
        {activeTab === 'parameters' ? (
          <div className="p-4 space-y-4">
            {isLoading ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Loading parameters...
              </div>
            ) : visibleParameters.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                <p>No parameters required for this action.</p>
                <p className="text-xs mt-2">Click "Add to Canvas" to continue.</p>
              </div>
            ) : (
              <>
                {visibleParameters.map((param, index) => (
                  <div key={param.name}>
                    <ParameterField
                      parameter={param}
                      value={formData[param.name]}
                      onChange={(value) => handleFieldChange(param.name, value)}
                    />
                    {errors[param.name] && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3" />
                        {errors[param.name]}
                      </div>
                    )}
                    {index < visibleParameters.length - 1 && (
                      <Separator className="mt-4" />
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        ) : (
          <NodeSettings settings={settings} onChange={setSettings} nodeVersion={nodeDefinition?.defaultVersion as string | undefined} />
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t bg-background space-y-2">
        {hasErrors && (
          <div className="flex items-center gap-2 text-xs text-destructive mb-2">
            <AlertCircle className="h-4 w-4" />
            <span>Please fix the errors above</span>
          </div>
        )}
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            onClick={handleSubmit}
            className="flex-1"
            disabled={hasErrors}
          >
            Add to Canvas
          </Button>
        </div>

        {hasRequiredFields && (
          <p className="text-xs text-muted-foreground text-center">
            * Required fields
          </p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Node Settings Component (n8n standard settings)
// ============================================================================

import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface NodeSettingsProps {
  settings: {
    alwaysOutputData: boolean
    executeOnce: boolean
    retryOnFail: boolean
    onError: 'stopWorkflow' | 'continueRegularOutput' | 'continueErrorOutput'
    notes: string
    displayNoteInFlow: boolean
  }
  onChange: (settings: NodeSettingsProps['settings']) => void
  nodeVersion?: string
}

function NodeSettings({ settings, onChange, nodeVersion }: NodeSettingsProps) {
  const updateSetting = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
    onChange({ ...settings, [key]: value })
  }

  return (
    <div className="p-4 space-y-6">
      {/* Always Output Data */}
      <div className="flex items-center justify-between">
        <Label htmlFor="alwaysOutputData" className="cursor-pointer">
          Always Output Data
        </Label>
        <Switch
          id="alwaysOutputData"
          checked={settings.alwaysOutputData}
          onCheckedChange={(checked) => updateSetting('alwaysOutputData', checked)}
        />
      </div>

      {/* Execute Once */}
      <div className="flex items-center justify-between">
        <Label htmlFor="executeOnce" className="cursor-pointer">
          Execute Once
        </Label>
        <Switch
          id="executeOnce"
          checked={settings.executeOnce}
          onCheckedChange={(checked) => updateSetting('executeOnce', checked)}
        />
      </div>

      {/* Retry On Fail */}
      <div className="flex items-center justify-between">
        <Label htmlFor="retryOnFail" className="cursor-pointer">
          Retry On Fail
        </Label>
        <Switch
          id="retryOnFail"
          checked={settings.retryOnFail}
          onCheckedChange={(checked) => updateSetting('retryOnFail', checked)}
        />
      </div>

      <Separator />

      {/* On Error */}
      <div className="space-y-2">
        <Label htmlFor="onError">On Error</Label>
        <Select 
          value={settings.onError} 
          onValueChange={(value: string) => updateSetting('onError', value as typeof settings.onError)}
        >
          <SelectTrigger id="onError">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stopWorkflow">Stop Workflow</SelectItem>
            <SelectItem value="continueRegularOutput">Continue (Regular Output)</SelectItem>
            <SelectItem value="continueErrorOutput">Continue (Error Output)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          placeholder="Add notes about this node..."
          value={settings.notes}
          onChange={(e) => updateSetting('notes', e.target.value)}
          rows={4}
          className="resize-none"
        />
      </div>

      {/* Display Note in Flow */}
      <div className="flex items-center justify-between">
        <Label htmlFor="displayNoteInFlow" className="cursor-pointer">
          Display Note in Flow?
        </Label>
        <Switch
          id="displayNoteInFlow"
          checked={settings.displayNoteInFlow}
          onCheckedChange={(checked) => updateSetting('displayNoteInFlow', checked)}
        />
      </div>

      {/* Node Version Info */}
      {nodeVersion && (
        <>
          <Separator />
          <div className="text-xs text-muted-foreground text-center py-2">
            Node version {nodeVersion} (Latest)
          </div>
        </>
      )}
    </div>
  )
}
