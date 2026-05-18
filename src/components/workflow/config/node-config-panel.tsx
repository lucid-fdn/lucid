'use client';

import Image from 'next/image';
import { useCanvasStore } from '@/stores/workflow/canvas.store';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Check, ChevronRight, Info } from 'lucide-react';
import { useState } from 'react';
import { useNodeParameters } from '@/hooks/use-node-parameters';
import { ParameterField } from '../parameters/parameter-field';
import { cn } from '@/lib/utils';
import { getLucidL2IconUrl } from '@/lib/lucid-l2/config';
import { NodeActionSelector } from '../node-action-selector';
import { CredentialSelector } from '../credentials';
import { getProviderFromDefinition } from '@/lib/workflow/credential-mapping';
import type { Node } from 'reactflow';
import type { NodeParameter } from '@/hooks/use-node-parameters';

type Step = 'setup' | 'configure' | 'test';

export function NodeConfigPanel() {
  const { selectedNodeId, nodes, updateNode, setSelectedNode } = useCanvasStore();
  const [currentStep, setCurrentStep] = useState<Step>('setup');
  const [showActionModal, setShowActionModal] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  
  // For Lucid-L2 nodes, extract real parameters (BEFORE early return to maintain hook order)
  const nodeDefinition = selectedNode?.data?.definition;
  const selectedAction = selectedNode?.data?.selectedAction;
  
  // Get dynamic parameter schema from n8n API (hook must be called unconditionally)
  const { parameters: parameterSchema } = useNodeParameters(
    nodeDefinition,
    selectedAction?.resource,
    selectedAction?.operation
  );
  
  // Early return AFTER all hooks
  if (!selectedNode) return null;
  
  const config = selectedNode.data.config || {};
  const parameterValues = selectedNode.data.parameters || {};
  
  // Get display names - remove "Trigger" suffix from app name
  const rawAppName = nodeDefinition?.displayName || selectedNode.data.label?.split(':')[0] || 'Unknown App';
  const appName = rawAppName.replace(/ Trigger$/i, '').trim();
  const actionName = selectedAction?.action?.name || selectedNode.data.label?.split(':')[1]?.trim();
  
  // Check if user has set a custom label (doesn't contain colon = custom)
  const hasCustomLabel = selectedNode.data.label && !selectedNode.data.label.includes(':');
  const customLabel = hasCustomLabel ? selectedNode.data.label : null;
  
  // Header title: Priority: Custom label > Action name > Placeholder
  const headerTitle = customLabel || actionName || (selectedNode.type === 'trigger' ? 'Select an Event' : 'Select an Action');
  
  // Check if steps are complete
  const isSetupComplete = !!selectedAction; // Has selected action
  const isConfigureComplete = parameterSchema.every(param => 
    !param.required || parameterValues[param.name] || config[param.name]
  );

  const handleConfigChange = (paramName: string, value: unknown) => {
    updateNode(selectedNode.id, {
      data: {
        ...selectedNode.data,
        config: {
          ...config,
          [paramName]: value
        }
      }
    });
  };

  const handleChangeAction = () => {
    setShowActionModal(true);
  };

  const handleStartEdit = () => {
    setEditedTitle(headerTitle);
    setIsEditingTitle(true);
  };

  const handleSaveTitle = () => {
    const trimmedTitle = editedTitle.trim();
    const currentLabel = selectedNode.data.label;
    
    // Only save if title is not empty and different from current stored label
    if (trimmedTitle && trimmedTitle !== currentLabel) {
      updateNode(selectedNode.id, {
        data: {
          ...selectedNode.data,
          label: trimmedTitle
        }
      });
    }
    setIsEditingTitle(false);
    setEditedTitle('');
  };

  const handleCancelEdit = () => {
    setIsEditingTitle(false);
    setEditedTitle('');
  };

  // Get icon URL helper
  const getIconUrl = () => {
    const iconUrl = selectedNode.data.iconUrl;
    if (!iconUrl) return null;
    if (typeof iconUrl === 'string') return getLucidL2IconUrl(iconUrl);
    if (typeof iconUrl === 'object' && iconUrl.light) return getLucidL2IconUrl(iconUrl.light);
    return null;
  };

  return (
    <>
      <style jsx>{`
        [data-radix-scroll-area-viewport] > div {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
        }
      `}</style>
      <div className="w-96 border-l w-full bg-background flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between gap-2">
          {isEditingTitle ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Input
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveTitle();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelEdit();
                  }
                }}
                className="h-8 text-sm"
                autoFocus
                onBlur={(_e) => {
                  // Small delay to allow click events to fire
                  setTimeout(() => handleSaveTitle(), 100);
                }}
              />
            </div>
          ) : (
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-2 min-w-0 flex-1 hover:bg-muted/50 rounded px-2 py-1 transition-colors group"
            >
              {/* App Icon */}
              {getIconUrl() ? (
                <Image
                  src={getIconUrl()!}
                  alt={appName}
                  width={20}
                  height={20}
                  className="w-5 h-5 object-contain flex-shrink-0"
                  unoptimized
                />
              ) : (
                <span className="text-lg">{selectedNode.type === 'trigger' ? '⚡' : '⚙️'}</span>
              )}
              <h3 className="font-semibold text-sm truncate min-w-0">{headerTitle}</h3>
              <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
            </button>
          )}
          <Button 
            variant="ghost" 
            size="sm"
            className="flex-shrink-0"
            onClick={() => setSelectedNode(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Multi-Step Navigation */}
      <div className="flex items-center border-b px-4 py-3 bg-muted/30">
        <StepButton
          step="setup"
          label="Setup"
          isActive={currentStep === 'setup'}
          isComplete={isSetupComplete}
          onClick={() => setCurrentStep('setup')}
        />
        <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />
        <StepButton
          step="configure"
          label="Configure"
          isActive={currentStep === 'configure'}
          isComplete={isConfigureComplete}
          onClick={() => setCurrentStep('configure')}
          disabled={!isSetupComplete}
        />
        <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />
        <StepButton
          step="test"
          label="Test"
          isActive={currentStep === 'test'}
          isComplete={false}
          onClick={() => setCurrentStep('test')}
          disabled={!isConfigureComplete}
        />
      </div>

      {/* Step Content */}
      <ScrollArea className="flex-1 w-full overflow-x-hidden [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!w-full [&_[data-radix-scroll-area-viewport]>div]:!max-w-full">
        <div className="p-4">
          {currentStep === 'setup' && (
            <SetupStep 
              node={selectedNode}
              appName={appName}
              iconUrl={getIconUrl()}
              onChangeAction={handleChangeAction}
              onContinue={() => setCurrentStep('configure')}
            />
          )}
          
          {currentStep === 'configure' && (
            <ConfigureStep
              parameters={parameterSchema}
              values={parameterValues}
              config={config}
              onChange={handleConfigChange}
              credentialId={selectedNode.data.credentialId}
            />
          )}
          
          {currentStep === 'test' && (
            <TestStep nodeId={selectedNode.id} />
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      {currentStep === 'configure' && (
        <div className="p-4 border-t">
          <Button 
            className="w-full"
            onClick={() => setCurrentStep('test')}
            disabled={!isConfigureComplete}
          >
            Continue
          </Button>
          {!isConfigureComplete && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              To continue, finish required fields
            </p>
          )}
        </div>
      )}

      {/* Node Action Selector Modal */}
      <NodeActionSelector
        open={showActionModal}
        onOpenChange={setShowActionModal}
        node={selectedNode}
        onSelectAction={(action) => {
          // Update node with selected action
          // action.action contains the full display name (e.g., "Create a subtask")
          // action.action is a string property, not a nested object!
          const fullActionName = action.action.action || action.action.name || 'Unknown';
          updateNode(selectedNode.id, {
            data: {
              ...selectedNode.data,
              selectedAction: action,
              label: `${appName}: ${fullActionName}`,
              parameters: action.parameters || {},
              settings: action.settings
            }
          });
          setShowActionModal(false);
        }}
      />
    </div>
    </>
  );
}

// ============================================================================
// Step Components
// ============================================================================

interface StepButtonProps {
  step: Step;
  label: string;
  isActive: boolean;
  isComplete: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function StepButton({ step: _step, label, isActive, isComplete, onClick, disabled }: StepButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium transition-colors',
        isActive && 'bg-primary text-primary-foreground',
        !isActive && !disabled && 'hover:bg-muted',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {isComplete && <Check className="h-3 w-3" />}
      {label}
    </button>
  );
}

interface SetupStepProps {
  node: Node;
  appName: string;
  iconUrl: string | null;
  onChangeAction: () => void;
  onContinue: () => void;
}

function SetupStep({ node, appName, iconUrl, onChangeAction, onContinue }: SetupStepProps) {
  const selectedAction = node.data.selectedAction;
  const { updateNode } = useCanvasStore();
  
  // Check if this is a webhook trigger node (memoize to prevent infinite loops)
  const nodeDefinition = node.data.definition;
  const hasWebhooks = nodeDefinition?.webhooks && nodeDefinition.webhooks.length > 0;
  
  // Additional check: If node type is 'trigger' and name contains "Trigger", treat as webhook
  const isTriggerByType = node.type === 'trigger';
  const isTriggerByName = nodeDefinition?.displayName?.includes('Trigger') || appName.includes('Trigger');
  const isWebhookTrigger = hasWebhooks || (isTriggerByType && isTriggerByName);
  
  // For webhook triggers, we don't show event selector
  const showEventSelector = !isWebhookTrigger;
  
  // Get OAuth provider for this node (if it requires OAuth)
  const oauthProvider = getProviderFromDefinition(nodeDefinition);
  
  // Check if credentials are required and selected
  const requiresCredentials = !!oauthProvider;
  const hasCredentials = !!node.data.credentialId;
  const credentialsValid = !requiresCredentials || hasCredentials;
  
  // Determine if Continue button should be enabled
  // Requirements:
  // 1. For webhook triggers: Only needs credentials (if required)
  // 2. For regular nodes: Needs selectedAction AND credentials (if required)
  const canContinue = isWebhookTrigger 
    ? credentialsValid  // Webhook triggers only need credentials
    : selectedAction && credentialsValid;  // Regular nodes need action + credentials
  
  // Handle credential selection
  const handleCredentialSelect = (credentialId: string | null) => {
    updateNode(node.id, {
      data: {
        ...node.data,
        credentialId: credentialId,
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* App */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">
          App <span className="text-destructive">*</span>
        </Label>
        <div className="flex items-center gap-2 w-full">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/50 min-w-0 overflow-hidden">
            {iconUrl ? (
              <Image
                src={iconUrl}
                alt={appName}
                width={20}
                height={20}
                className="w-5 h-5 object-contain flex-shrink-0"
                unoptimized
              />
            ) : (
              <span className="text-lg flex-shrink-0">{node.type === 'trigger' ? '⚡' : '⚙️'}</span>
            )}
            <span className="text-sm font-medium truncate">{appName}</span>
          </div>
          <Button variant="outline" size="sm" onClick={onChangeAction} className="flex-shrink-0 whitespace-nowrap">
            Change
          </Button>
        </div>
      </div>

      {/* Trigger/Action Event (only show if not a webhook trigger) */}
      {showEventSelector && (
        <div className="space-y-2">
          <Label className="text-xs font-medium">
            {node.type === 'trigger' ? 'Trigger' : 'Action'} event <span className="text-destructive">*</span>
          </Label>
          {selectedAction ? (
            <button 
              onClick={onChangeAction}
              className="w-full px-3 py-2 border rounded-md bg-background hover:bg-muted/50 transition-colors text-left overflow-hidden"
            >
              <p className="text-sm font-medium break-words">
                {selectedAction.action?.action || selectedAction.action?.name || node.data.label?.split(':')[1]?.trim() || 'Select Event'}
              </p>
            </button>
          ) : (
            <button
              onClick={onChangeAction}
              className="w-full px-3 py-2 border border-dashed rounded-md bg-muted/50 hover:bg-muted transition-colors"
            >
              <p className="text-sm text-muted-foreground">
                {node.type === 'trigger' ? 'Select an Event' : 'Select an Action'}
              </p>
            </button>
          )}
        </div>
      )}

      {/* Account (OAuth) - Real integration with Nango */}
      {oauthProvider ? (
        <CredentialSelector
          provider={oauthProvider}
          selectedCredentialId={node.data.credentialId}
          onSelect={handleCredentialSelect}
          label="Account"
          required={true}
        />
      ) : (
        // Fallback for nodes that don't require OAuth
        <div className="space-y-2">
          <Label className="text-xs font-medium">
            Account
          </Label>
          <div className="px-3 py-2 border rounded-md bg-muted/30">
            <p className="text-sm text-muted-foreground">
              This node doesn't require authentication
            </p>
          </div>
        </div>
      )}
      
      {/* Info about credentials */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground/70 p-3 bg-muted/30 rounded-md">
        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p>
          Your credentials are encrypted and can be managed in Settings → Integrations.
        </p>
      </div>

      {/* Continue Button */}
      <Button 
        className="w-full" 
        onClick={onContinue}
        disabled={!canContinue}
      >
        Continue
      </Button>
      {/* Validation message */}
      {!canContinue && (
        <p className="text-xs text-center text-muted-foreground mt-2">
          {!selectedAction && !isWebhookTrigger && !credentialsValid 
            ? 'Select an event and connect an account to continue'
            : !selectedAction && !isWebhookTrigger
            ? 'Select an event to continue'
            : !credentialsValid
            ? 'Connect an account to continue'
            : null
          }
        </p>
      )}
    </div>
  );
}

interface ConfigureStepProps {
  parameters: NodeParameter[];
  values: Record<string, unknown>;
  config: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  credentialId?: string | null; // OAuth credential ID for dynamic options
}

/**
 * Check if a parameter is authentication-related
 * These should only appear in the Setup step, not Configure step
 */
function isAuthParameter(param: NodeParameter): boolean {
  // Common auth parameter names in n8n nodes
  const authNames = ['authentication', 'credentials', 'credentialType'];
  const authDisplayNames = ['authentication', 'credential'];
  
  return (
    authNames.includes(param.name) ||
    authDisplayNames.some(name => 
      param.displayName?.toLowerCase().includes(name)
    )
  );
}

/**
 * Check if a parameter is unsupported/deprecated
 * These should be hidden to avoid confusing users
 */
function isUnsupportedParameter(param: NodeParameter): boolean {
  const description = param.description?.toLowerCase() || '';
  const placeholder = param.placeholder?.toLowerCase() || '';
  const displayName = param.displayName?.toLowerCase() || '';
  
  // Check for "not supported" indicators
  const notSupportedPhrases = [
    'not supported',
    'api limitations',
    'deprecated',
    'no longer available',
    'not available',
  ];
  
  return notSupportedPhrases.some(phrase => 
    description.includes(phrase) || 
    placeholder.includes(phrase) ||
    displayName.includes(phrase)
  );
}

function ConfigureStep({ parameters, values, config, onChange, credentialId }: ConfigureStepProps) {
  // Filter out:
  // 1. Authentication parameters (they're in Setup step)
  // 2. Unsupported/deprecated parameters (confusing to users)
  const configParameters = parameters.filter(param => 
    !isAuthParameter(param) && !isUnsupportedParameter(param)
  );
  const { selectedNodeId, nodes } = useCanvasStore();
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const nodeDefinition = selectedNode?.data?.definition;
  
  // Check if this is a webhook trigger
  const hasWebhooks = nodeDefinition?.webhooks && nodeDefinition.webhooks.length > 0;
  const isTriggerByType = selectedNode?.type === 'trigger';
  const isTriggerByName = nodeDefinition?.displayName?.includes('Trigger');
  const isWebhookTrigger = hasWebhooks || (isTriggerByType && isTriggerByName);
  
  // For webhook triggers, show Webhook URLs section at the top
  if (isWebhookTrigger) {
    return (
      <div className="space-y-4">
        {/* Webhook URLs Section */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">Webhook URLs</Label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1">
              Test URL
            </Button>
            <Button variant="outline" size="sm" className="flex-1">
              Production URL
            </Button>
          </div>
        <div className="px-3 py-2 border rounded-md bg-muted/50">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono bg-background px-2 py-1 rounded flex-shrink-0">POST</span>
            <p className="text-xs text-muted-foreground truncate min-w-0 flex-1">
              {`https://app.lucid.com/webhook/${selectedNode?.id}`}
            </p>
          </div>
        </div>
        </div>

        <Separator className="my-4" />

        {/* Show ALL parameters from API (including workspace, resource, etc.) */}
        {configParameters.length > 0 ? (
          configParameters.map((param) => (
            <div key={param.name}>
              <ParameterField
                parameter={param}
                value={values[param.name] || config[param.name]}
                onChange={(value) => onChange(param.name, value)}
                nodeDefinition={nodeDefinition}
                currentValues={{ ...values, ...config }}
                credentialId={credentialId}
              />
            </div>
          ))
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              No parameters to configure
            </p>
          </div>
        )}
      </div>
    );
  }
  
  // For non-webhook nodes, show regular parameters (excluding auth)
  if (configParameters.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">
          No parameters to configure
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          This action has no required fields
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {configParameters.map((param) => (
        <div key={param.name}>
          <ParameterField
            parameter={param}
            value={values[param.name] || config[param.name]}
            onChange={(value) => onChange(param.name, value)}
            nodeDefinition={nodeDefinition}
            currentValues={{ ...values, ...config }}
            credentialId={credentialId}
          />
        </div>
      ))}
    </div>
  );
}

interface TestStepProps {
  nodeId: string;
}

function TestStep({ nodeId: _nodeId }: TestStepProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; data: Record<string, unknown> } | null>(null);

  const handleTest = async () => {
    setIsLoading(true);
    // TODO: Implement test execution
    setTimeout(() => {
      setTestResult({
        success: true,
        data: { message: 'Test successful' }
      });
      setIsLoading(false);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h4 className="font-medium text-sm mb-2">Test Your Action</h4>
        <p className="text-xs text-muted-foreground">
          Send a test request to verify your configuration works correctly.
        </p>
      </div>

      <Button 
        className="w-full" 
        onClick={handleTest}
        disabled={isLoading}
      >
        {isLoading ? 'Testing...' : 'Test Action'}
      </Button>

      {testResult && (
        <div className="p-4 border rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 mb-2">
            <Check className="h-4 w-4 text-green-600" />
            <p className="font-medium text-sm">Test Successful</p>
          </div>
          <pre className="text-xs bg-background p-2 rounded overflow-auto max-h-40">
            {JSON.stringify(testResult.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
