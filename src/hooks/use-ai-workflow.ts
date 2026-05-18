/**
 * AI Workflow Generation Hook
 * 
 * Handles AI-powered workflow generation with:
 * - Rate limiting awareness
 * - Real-time validation
 * - Loading states
 * - Error handling
 */

'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { FlowSpec } from '@/lib/lucid-l2/types';

interface AIWorkflowResult {
  flowspec: FlowSpec;
  reasoning: string;
  complexity: string;
  suggestions?: string[];
  rateLimit: {
    remaining: number;
    limit: number;
    resetAt: string;
    tier: string;
  };
}

interface UseAIWorkflowOptions {
  onSuccess?: (result: AIWorkflowResult) => void;
  onError?: (error: Error) => void;
}

export function useAIWorkflow(options?: UseAIWorkflowOptions) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<AIWorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const generateWorkflow = async (goal: string, constraints?: string[]) => {
    try {
      setIsGenerating(true);
      setError(null);

      console.log('[use-ai-workflow] Starting generation:', { goal, constraints });
      toast.info('Generating Workflow', 'AI is analyzing your request...');

      const response = await fetch('/api/ai/generate-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, constraints }),
      });

      console.log('[use-ai-workflow] Response status:', response.status);

      if (!response.ok) {
        const data = await response.json();
        console.error('[use-ai-workflow] Error response:', data);
        
        // Handle rate limit
        if (response.status === 429) {
          const resetDate = new Date(data.resetAt);
          const resetTime = resetDate.toLocaleTimeString();
          throw new Error(
            `${data.message}\nResets at ${resetTime}`
          );
        }
        
        throw new Error(data.message || 'Failed to generate workflow');
      }

      const data: AIWorkflowResult = await response.json();
      console.log('[use-ai-workflow] Success! Received flowspec:', {
        nodes: data.flowspec?.nodes?.length,
        complexity: data.complexity,
        rateLimit: data.rateLimit
      });
      setResult(data);

      toast.success(
        'Workflow Generated!',
        `${data.complexity} - ${data.rateLimit.remaining}/${data.rateLimit.limit} generations remaining`
      );

      options?.onSuccess?.(data);
      return data;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate workflow';
      setError(errorMessage);
      
      toast.error('Generation Failed', errorMessage);

      options?.onError?.(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      setIsGenerating(false);
    }
  };

  const clearResult = () => {
    setResult(null);
    setError(null);
  };

  return {
    generateWorkflow,
    isGenerating,
    result,
    error,
    clearResult,
  };
}
