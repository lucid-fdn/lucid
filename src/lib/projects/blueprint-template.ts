import type { ProjectBlueprint, ProjectBlueprintItem } from '@contracts/project-blueprint'
import type { TemplateSpec } from '@contracts/template'
import { getTemplateRegistryEntryBySlug } from '@/lib/templates/registry'

export interface ResolvedBlueprintTemplate {
  projectName: string
  projectDescription?: string
  item: ProjectBlueprintItem
  spec: TemplateSpec
  name: string
}

export function resolvePrimaryBlueprintTemplate(blueprint: ProjectBlueprint): ResolvedBlueprintTemplate | null {
  const item = blueprint.items[0]
  if (!item) return null

  if (item.source === 'blank') {
    return {
      projectName: blueprint.project.name,
      ...(blueprint.project.description ? { projectDescription: blueprint.project.description } : {}),
      item,
      spec: item.spec,
      name: item.name?.trim() || blueprint.project.name,
    }
  }

  const registryEntry = getTemplateRegistryEntryBySlug(item.template_slug)
  if (!registryEntry) return null

  return {
    projectName: blueprint.project.name,
    ...(blueprint.project.description ? { projectDescription: blueprint.project.description } : {}),
    item,
    spec: registryEntry.template.spec,
    name: item.name?.trim() || registryEntry.template.name,
  }
}
