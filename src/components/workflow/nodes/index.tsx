/**
 * Node Type Registry
 * 
 * Centralized management system for workflow node types.
 * Industry standard pattern for extensible node systems.
 * 
 * Node Types:
 * - trigger: Circular nodes for workflow triggers (start nodes)
 * - custom: Standard rectangular nodes for actions/operations
 * - emptyState: Special node shown on empty canvas
 * 
 * To add a new node type:
 * 1. Create component in this directory
 * 2. Import and add to nodeTypes export
 * 3. Use the type when creating nodes in workflow-editor
 */

import { CustomNode } from './custom-node';
import { TriggerNode } from './trigger-node';
import { ActionNode } from './action-node';
import { AIAgentNode } from './ai-agent-node';
import { ResourceNode } from './resource-node';

// Empty State Node Component
import { Plus } from 'lucide-react';
import type { NodeProps } from 'reactflow';
import { BorderBeam } from '@/ui/components/border-beam';
import { Card } from '@/components/ui/card';
import { MagicCard } from '@/ui/components/magic-card';

function EmptyStateNode({ data: _data }: NodeProps) {
  const handleClick = () => {
    if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).globalOnAddNode) {
      ((window as unknown as Record<string, unknown>).globalOnAddNode as () => void)();
    }
  };

  return (
    <Card 
      onClick={handleClick}
      className="p-0 border-none cursor-pointer"
    >
      <BorderBeam size={100} duration={8} />
      <MagicCard 
        className="relative flex flex-col items-center justify-center gap-4 p-8 group"
        gradientSize={200}
        gradientColor="#111111"
      >
        <Plus className="m-auto w-20 h-20 text-primary/10 shrink-0" strokeWidth={2} />
        <div className="text-center">
          <div className="text-lg text-white font-semibold mb-1">Add a Trigger</div>
          <div className="text-sm text-muted-foreground">
            Start building your workflow
          </div>
        </div>
      </MagicCard>
    </Card>
  );
}

/**
 * Node Types Registry
 * Maps node type strings to their React components
 */
export const nodeTypes = {
  // Trigger nodes - Circular design for workflow starts
  trigger: TriggerNode,
  
  // Action nodes - Square design for operations
  action: ActionNode,
  
  // AI Agent nodes - Apple-like card design with 3 bottom inputs
  aiAgent: AIAgentNode,
  
  // Resource nodes - Small circular nodes for Tools/Data/Models
  resource: ResourceNode,
  
  // Legacy custom nodes - Rectangular design (fallback)
  custom: CustomNode,
  
  // Empty state - Special node for empty canvas
  emptyState: EmptyStateNode,
} as const;

/**
 * Node type definitions for TypeScript
 */
export type NodeType = keyof typeof nodeTypes;

/**
 * Helper to determine node type from node data
 */
export function getNodeType(nodeData: { name?: string; displayName?: string; type?: string; group?: string[] }): NodeType {
  // Check if this is an AI Agent node (special Apple-like UI)
  const isAIAgent = 
    nodeData.name?.includes('langchain.agent') ||
    nodeData.displayName?.includes('AI Agent') ||
    nodeData.name === '@n8n/n8n-nodes-langchain.agent';
  
  if (isAIAgent) {
    return 'aiAgent';
  }
  
  // Check if this is a Resource node (Tools/Data/Models for AI)
  const isResource =
    // Chat Models
    nodeData.name?.includes('Chat Model') ||
    nodeData.displayName?.includes('Chat Model') ||
    nodeData.name?.includes('lmChat') ||
    // Memory nodes (comprehensive detection)
    nodeData.name?.includes('Memory') ||
    nodeData.displayName?.includes('Memory') ||
    nodeData.name?.includes('memoryManager') ||
    nodeData.name?.includes('memoryChatRetriever') ||
    nodeData.name?.includes('memoryBufferWindow') ||
    // Tool nodes
    nodeData.name?.includes('Tool') ||
    nodeData.displayName?.includes('Tool') && !nodeData.displayName?.includes('Toolbox') ||
    // Model-related
    nodeData.name?.match(/^(OpenAI|Ollama|Cohere|Hugging Face|Anthropic|Azure).*(Model)$/) ||
    nodeData.displayName?.includes('Model Selector') ||
    // Vector stores (data sources)
    nodeData.name?.includes('Vector Store') ||
    nodeData.name?.includes('vectorStore') ||
    // Catch ALL LangChain framework nodes (they should all be resource nodes)
    nodeData.name?.includes('langchain') && !nodeData.name?.includes('agent');
  
  if (isResource) {
    return 'resource';
  }
  
  // Check if it's a trigger node
  if (nodeData.type === 'trigger' || nodeData.group?.includes('trigger')) {
    return 'trigger';
  }
  
  // Default to custom node
  return 'custom';
}

// Re-export components for direct imports if needed
export { CustomNode, TriggerNode, ActionNode, AIAgentNode, ResourceNode, EmptyStateNode };
