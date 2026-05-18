"use client"

import * as React from "react"
import type { TemplateCatalogEntry } from "@contracts/template"
import type { UnifiedSkillItem } from "@contracts/unified-skill"

import { Button } from "@/components/ui/button"
import { ProjectCardShell } from "@/components/projects/project-card-shell"
import { ProjectBuilderPromptNode } from "@/components/projects/project-builder-prompt-node"
import { ProjectStartHeading } from "@/components/projects/project-start-heading"
import { TemplateCard } from "@/components/templates/template-card"

interface ProjectBuilderStartPanelProps {
  prompt: string
  onPromptChange: (value: string) => void
  onPromptSubmit: () => void
  isSubmitting?: boolean
  featuredTemplates: TemplateCatalogEntry[]
  availableUnifiedSkills?: UnifiedSkillItem[]
  onStartFresh: () => void
  onUploadSpec: () => void
  onSelectTemplate: (template: TemplateCatalogEntry) => void
  onBrowseAllTemplates: () => void
  inputId?: string
}

export function ProjectBuilderStartPanel({
  prompt,
  onPromptChange,
  onPromptSubmit,
  isSubmitting = false,
  featuredTemplates,
  availableUnifiedSkills = [],
  onStartFresh,
  onUploadSpec,
  onSelectTemplate,
  onBrowseAllTemplates,
  inputId = "browse-generation-prompt",
}: ProjectBuilderStartPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-1 px-6 py-5">
        <ProjectStartHeading words={["Personal Assistant", "Sales Closer", "Support Operator", "Growth Team"]} />
      </div>
      <div className="px-6 pb-6">
        <div className="mx-auto mb-10 mt-8 flex max-w-3xl flex-col items-center text-center">
          <div className="w-full">
            <ProjectBuilderPromptNode
              value={prompt}
              onValueChange={onPromptChange}
              isLoading={isSubmitting}
              onSubmit={onPromptSubmit}
              placeholder="Describe what you want to build or start with a template"
              inputId={inputId}
              className="mx-auto max-w-3xl"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <BlankProjectCard onClick={onStartFresh} />
          <UploadSpecCard onClick={onUploadSpec} />
          {featuredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              variant="compact"
              hideDescription
              availableUnifiedSkills={availableUnifiedSkills}
              onSelect={() => onSelectTemplate(template)}
            />
          ))}
        </div>
        <div className="mt-5 flex justify-center">
          <Button type="button" variant="outline" onClick={onBrowseAllTemplates}>
            Browse all templates
          </Button>
        </div>
      </div>
    </div>
  )
}

function BlankProjectCard({ onClick }: { onClick: () => void }) {
  return (
    <ProjectCardShell
      title="Start fresh"
      compact
      hideHeader
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onClick()
        }
      }}
      className="cursor-pointer"
      contentClassName="flex h-full items-center justify-center py-1"
    >
      <div className="flex flex-col items-center justify-center text-center">
        <p className="text-[12px] font-medium text-foreground">Start fresh</p>
        <p className="mt-0.5 text-[10px] leading-3.5 text-muted-foreground">
          Define the first operating brief yourself.
        </p>
      </div>
    </ProjectCardShell>
  )
}

function UploadSpecCard({ onClick }: { onClick: () => void }) {
  return (
    <ProjectCardShell
      title="Upload spec"
      compact
      hideHeader
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onClick()
        }
      }}
      className="cursor-pointer"
      contentClassName="flex h-full items-center justify-center py-1"
    >
      <div className="flex flex-col items-center justify-center text-center">
        <p className="text-[12px] font-medium text-foreground">Upload spec</p>
        <p className="mt-0.5 text-[10px] leading-3.5 text-muted-foreground">
          Paste JSON or YAML and validate before deploy.
        </p>
      </div>
    </ProjectCardShell>
  )
}
