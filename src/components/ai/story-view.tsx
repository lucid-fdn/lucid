'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StoryStepCard } from './story-step-card'
import dynamic from 'next/dynamic'

const NodePaletteModal = dynamic(() => import('@/components/workflow/node-palette-modal').then(mod => ({ default: mod.NodePaletteModal })), { ssr: false })
import { parseFlowSpecToStory, validateFlowSpec } from '@/lib/ai/flowspec-parser'
import type { FlowSpec } from '@/lib/lucid-l2/types'
import type { LucidNode } from '@/hooks/use-lucid-nodes'
import { cn } from '@/lib/utils'
import { useResolvedFeatureFlags } from '@/contexts/feature-flags-context'

interface StoryViewProps {
  flowSpec: FlowSpec | null
  onLoadToCanvas: () => void
  onRevealStructure: () => void
  isLoading?: boolean
  className?: string
}

/**
 * Story View Component
 * Displays workflow as narrative When/If/Do story
 * 
 * Features:
 * - Parse FlowSpec to story format
 * - Color-coded step cards
 * - Stagger animation entrance
 * - Confidence indicator
 * - Load to canvas action
 */
export function StoryView({
  flowSpec,
  onLoadToCanvas,
  onRevealStructure,
  isLoading = false,
  className,
}: StoryViewProps) {
  const { workflowsEnabled } = useResolvedFeatureFlags()
  const [showNodePalette, setShowNodePalette] = useState(false)
  const [addAfterStepIndex, setAddAfterStepIndex] = useState<number | null>(null)

  const handleAddNode = (stepIndex: number) => {
    setAddAfterStepIndex(stepIndex)
    setShowNodePalette(true)
  }

  const handleSelectNode = (node: LucidNode) => {
    // TODO: Insert node into flowspec after the selected step
    console.log('Add node after step', addAfterStepIndex, ':', node)
    setShowNodePalette(false)
    setAddAfterStepIndex(null)
    // Future: integrate with flowspec modification
  }
  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">
            Generating your workflow story...
          </p>
        </div>
      </div>
    )
  }

  if (!flowSpec) {
    return (
      <div className={cn("text-center py-12 space-y-3", className)}>
        <p className="text-muted-foreground">
          No workflow to display yet
        </p>
        <p className="text-xs text-muted-foreground">
          Enter a prompt to generate your workflow
        </p>
      </div>
    )
  }

  const steps = parseFlowSpecToStory(flowSpec)
  const validation = validateFlowSpec(flowSpec)

  if (steps.length === 0) {
    return (
      <div className={cn("text-center py-12 space-y-3", className)}>
        <p className="text-muted-foreground">
          Workflow generated but no steps found
        </p>
        <p className="text-xs text-muted-foreground">
          Try rephrasing your prompt
        </p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Confidence Header */}
      <div className="flex items-center justify-between p-4 rounded-lg border bg-card/50">
        <div className="space-y-1">
          <h3 className="font-semibold text-sm">Your Workflow Story</h3>
          <p className="text-xs text-muted-foreground">
            {steps.length} step{steps.length === 1 ? '' : 's'} • {validation.confidence}% confident
          </p>
        </div>
        
        {/* Confidence Indicator */}
        <div className={cn(
          "px-3 py-1.5 rounded-full text-xs font-medium",
          validation.confidence >= 80 && "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
          validation.confidence >= 50 && validation.confidence < 80 && "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
          validation.confidence < 50 && "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
        )}>
          {validation.confidence >= 80 && '✓ Ready to run'}
          {validation.confidence >= 50 && validation.confidence < 80 && '⚠ Needs review'}
          {validation.confidence < 50 && '⚠ Has issues'}
        </div>
      </div>

      {/* Story Steps - Stagger animation with inline add buttons */}
      <div className="space-y-2">
        {steps.map((step, index) => (
          <div key={step.id}>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.2,
                delay: index * 0.05, // 50ms stagger
                ease: [0.2, 0.8, 0.2, 1] // Apple easing
              }}
            >
              <StoryStepCard
                type={step.type}
                title={step.title}
                description={step.description}
                icon={step.icon}
              />
            </motion.div>
            
            {/* Inline "+ Add step" button (if feature enabled) */}
            {workflowsEnabled && (
              <div className="flex items-center justify-center h-8">
                <button
                  onClick={() => handleAddNode(index)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 px-2 py-1 rounded hover:bg-accent"
                >
                  <Plus className="w-3 h-3" />
                  Add step
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Node Palette Modal */}
      {workflowsEnabled && (
        <NodePaletteModal
          open={showNodePalette}
          onOpenChange={setShowNodePalette}
          onSelectNode={handleSelectNode}
        />
      )}

      {/* Validation Issues (if any) */}
      {validation.issues.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
        >
          <h4 className="font-medium text-sm text-amber-900 dark:text-amber-100 mb-2">
            Issues to Review:
          </h4>
          <ul className="space-y-1">
            {validation.issues.map((issue, index) => (
              <li key={index} className="text-xs text-amber-700 dark:text-amber-300">
                • {issue}
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <Button
          onClick={onLoadToCanvas}
          size="lg"
          className="flex-1"
        >
          Load to Canvas
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        
        <Button
          onClick={onRevealStructure}
          variant="outline"
          size="lg"
          className="flex-1"
        >
          Reveal Structure →
        </Button>
      </div>
    </div>
  )
}
