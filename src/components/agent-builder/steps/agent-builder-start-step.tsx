"use client"

import type { TemplateCatalogEntry } from "@contracts/template"
import type { UnifiedSkillItem } from "@contracts/unified-skill"
import { ProjectBuilderStartPanel } from "@/components/projects/project-builder-start-panel"

export interface AgentBuilderStartStepProps {
  prompt: string
  featuredTemplates: TemplateCatalogEntry[]
  availableUnifiedSkills: UnifiedSkillItem[]
  isSubmitting?: boolean
  onPromptChange: (value: string) => void
  onPromptSubmit: () => void
  onStartFresh: () => void
  onUploadSpec: () => void
  onSelectTemplate: (template: TemplateCatalogEntry) => void
  onBrowseAllTemplates: () => void
  inputId?: string
}

export function AgentBuilderStartStep(props: AgentBuilderStartStepProps) {
  return <ProjectBuilderStartPanel {...props} />
}
