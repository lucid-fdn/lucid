'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/radix-tabs'
import { CodeBlock, CodeBlockGroup } from '@/ui/components/code-block'
import type { BlueprintConfigFormat } from '@/lib/projects/blueprint-serialization'

const ProjectBuilderConfigEditor = dynamic(
  () => import('@/components/projects/project-builder-config-editor').then((mod) => mod.ProjectBuilderConfigEditor),
  {
    ssr: false,
    loading: () => <ConfigEditorLoadingSkeleton />,
  },
)

interface ProjectBuilderConfigCodeBlockProps {
  format: BlueprintConfigFormat
  value: string
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  error: string | null
  onFormatChange: (format: BlueprintConfigFormat) => void
  onChange: (value: string) => void
  validateChange?: (value: string) => boolean
  onRejectedStructureChange?: () => void
}

export function ProjectBuilderConfigCodeBlock({
  format,
  value,
  saveState,
  error,
  onFormatChange,
  onChange,
  validateChange,
  onRejectedStructureChange,
}: ProjectBuilderConfigCodeBlockProps) {
  const filename = format === 'yaml' ? 'lucid-agent.yaml' : 'lucid-agent.json'
  const language = format === 'yaml' ? 'YAML' : 'JSON'
  const saveLabel = saveState === 'saving'
    ? 'Autosaving values...'
    : saveState === 'error'
      ? 'Fix config to save'
      : saveState === 'saved'
        ? 'Values autosaved'
        : 'Values autosave'

  return (
    <CodeBlock className="rounded-2xl border-border/60 bg-background/70">
      <CodeBlockGroup className="border-b border-border/60 px-3 py-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-foreground">{filename}</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{language}</p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs
            value={format}
            onValueChange={(nextFormat) => onFormatChange(nextFormat as BlueprintConfigFormat)}
          >
            <TabsList className="grid h-8 w-[150px] grid-cols-2">
              <TabsTrigger value="yaml" className="text-xs">YAML</TabsTrigger>
              <TabsTrigger value="json" className="text-xs">JSON</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="hidden text-xs text-muted-foreground sm:block">{saveLabel}</p>
        </div>
      </CodeBlockGroup>

      <ProjectBuilderConfigEditor
        value={value}
        format={format}
        onChange={onChange}
        validateChange={validateChange}
        onRejectedChange={onRejectedStructureChange}
      />

      <div className="border-t border-border/60 px-4 py-3">
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            YAML/JSON is value-locked: edit existing values here; use Summary controls for structural changes.
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground sm:hidden">{saveLabel}</p>
      </div>
    </CodeBlock>
  )
}

function ConfigEditorLoadingSkeleton() {
  return (
    <div className="flex min-h-[520px] bg-[#050505]">
      <div className="w-[42px] shrink-0 border-r border-border/40 bg-[#050505] px-2 py-4">
        {Array.from({ length: 16 }).map((_, index) => (
          <Skeleton
            key={index}
            className="mb-2 h-3 w-4 rounded bg-muted-foreground/10"
          />
        ))}
      </div>
      <div className="flex-1 px-4 py-4">
        {Array.from({ length: 14 }).map((_, index) => (
          <Skeleton
            key={index}
            className="mb-2 h-3 rounded bg-muted-foreground/10"
            style={{ width: `${Math.max(28, 88 - (index % 5) * 12)}%` }}
          />
        ))}
      </div>
    </div>
  )
}
