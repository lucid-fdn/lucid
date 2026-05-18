/**
 * AI Workflow Generator Dialog
 * 
 * Professional, clean UI for AI-powered workflow generation
 * No user-facing mentions of n8n/CrewAI
 */

'use client';

import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ApplePromptInput } from '@/components/ai/apple-prompt-input';
import { SuggestionChips } from '@/components/ai/suggestion-chips';
import { StoryView } from '@/components/ai/story-view';
import { useAIWorkflow } from '@/hooks/use-ai-workflow';
import { flowSpecToReactFlow } from '@/lib/lucid-l2/converter';
import { motion, AnimatePresence } from 'motion/react';

interface AIWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWorkflowGenerated: (nodes: unknown[], edges: unknown[]) => void;
}

export function AIWorkflowDialog({
  open,
  onOpenChange,
  onWorkflowGenerated,
}: AIWorkflowDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [viewMode, setViewMode] = useState<'prompt' | 'story'>('prompt');
  
  const { generateWorkflow, isGenerating, result, error, clearResult } = useAIWorkflow({
    onSuccess: (data) => {
      // Convert FlowSpec to React Flow format
      const { nodes, edges } = flowSpecToReactFlow(data.flowspec);
      onWorkflowGenerated(nodes, edges);
    },
  });

  const handleSubmit = async () => {
    if (!prompt.trim() || isGenerating) return;
    await generateWorkflow(prompt);
    // Switch to story view when generation completes
    if (!isGenerating) {
      setTimeout(() => setViewMode('story'), 500);
    }
  };

  const handleSuggestionSelect = (suggestion: string) => {
    setPrompt(suggestion);
  };

  const handleLoadToCanvas = () => {
    if (!result) return;
    const { nodes, edges } = flowSpecToReactFlow(result.flowspec);
    onWorkflowGenerated(nodes, edges);
    onOpenChange(false);
    handleReset();
  };

  const handleRevealStructure = () => {
    // TODO: Implement structure view transition
    handleLoadToCanvas();
  };

  const handleReset = () => {
    clearResult();
    setPrompt('');
    setViewMode('prompt');
  };

  const handleClose = () => {
    onOpenChange(false);
    handleReset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-lucid" />
              Create Automation
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {viewMode === 'prompt' ? (
            <motion.div
              key="prompt-view"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Apple Prompt Input */}
              <ApplePromptInput
                value={prompt}
                onChange={setPrompt}
                onSubmit={handleSubmit}
                disabled={isGenerating}
                placeholder="Describe the workflow you want to create..."
              />

              {/* Suggestion Chips */}
              <SuggestionChips
                onSelect={handleSuggestionSelect}
                disabled={isGenerating}
              />

              {/* Error Display */}
              {error && (
                <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
                  <p className="text-sm text-red-900 dark:text-red-100">{error}</p>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="story-view"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.24 }}
            >
              {/* Story View */}
              <StoryView
                flowSpec={result?.flowspec || null}
                onLoadToCanvas={handleLoadToCanvas}
                onRevealStructure={handleRevealStructure}
                isLoading={isGenerating}
              />

              {/* Back Button */}
              <div className="mt-6">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="w-full"
                >
                  ← Start Over
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
