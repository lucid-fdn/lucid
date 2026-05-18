'use client';

import { motion } from 'motion/react';
import { ArrowUp } from 'lucide-react';
import { Ripple } from '@/ui/components/ripple';
import { 
  PromptInput, 
  PromptInputTextarea, 
  PromptInputActions, 
  PromptInputAction 
} from '@/ui/components/prompt-input';
import { Button } from '@/components/ui/button';
import { PromptSuggestion } from '@/ui/components/prompt-suggestion';

interface Suggestion {
  label: string;
  prompt: string;
}

interface EmptyStateProps {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  suggestions?: Suggestion[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  modelSelector?: React.ReactNode;
}

export function EmptyState({
  title = 'What do you want to create?',
  subtitle = 'Start building with a single prompt. No coding needed.',
  placeholder = 'Ask Lucid AI what to build...',
  suggestions = [
    { label: 'Explain RLS policies', prompt: 'Explain how Row Level Security works in Supabase' },
    { label: 'Debug an error', prompt: 'Help me debug a TypeScript error' },
    { label: 'Create a workflow', prompt: 'Create a workflow that sends daily email reports' },
    { label: 'Optimize query', prompt: 'How can I optimize this database query?' },
  ],
  value,
  onChange,
  onSubmit,
  disabled = false,
  modelSelector,
}: EmptyStateProps) {
  return (
    <div className="relative h-full flex items-center justify-center p-8 bg-background overflow-hidden">
      {/* Background Ripple */}
      <Ripple />
      
      {/* Centered Content */}
      <div className="relative w-full max-w-3xl space-y-8 z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-center"
        >
          <h1 className="sm:text-[32px] md:text-[46px] text-[29px] text-pretty tracking-tighter font-semibold text-foreground">
            {title}
          </h1>
          <p className="text-[clamp(12px,3.5vw,20px)] sm:text-[20px] whitespace-nowrap sm:whitespace-normal leading-tight tracking-tight text-muted-foreground mt-2">
            {subtitle}
          </p>
        </motion.div>

        {/* Model Selector - Above Input */}
        {modelSelector && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="flex justify-start"
          >
            {modelSelector}
          </motion.div>
        )}

        {/* Prompt Input */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <PromptInput
            value={value}
            onValueChange={onChange}
            onSubmit={onSubmit}
            className="!bg-sidebar/60 backdrop-blur-sm"
          >
            <PromptInputTextarea 
              className="!bg-transparent"
              placeholder={placeholder}
            />
            <PromptInputActions className="justify-end">
              <PromptInputAction tooltip="Send message">
                <Button
                  size="icon"
                  variant="default"
                  className="h-8 w-8 rounded-full"
                  aria-label="Send message"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (value?.trim()) {
                      onSubmit();
                    }
                  }}
                  disabled={!value?.trim() || disabled}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </PromptInputAction>
            </PromptInputActions>
          </PromptInput>
        </motion.div>

        {/* Quick Suggestions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="flex flex-wrap gap-3 justify-center"
        >
          {suggestions.map((suggestion) => (
            <PromptSuggestion
              key={suggestion.label}
              variant="outline"
              size="sm"
              className="text-xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
              onClick={() => onChange(suggestion.prompt)}
              disabled={disabled}
            >
              {suggestion.label}
            </PromptSuggestion>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
