import type { ProjectBlueprint } from '@contracts/project-blueprint'

import type { GenerationDraft } from '@/lib/ai/project-generation/schemas'

/**
 * The config editor must expose an executable spec, not an opaque template
 * reference. If the user edits this config, the draft intentionally becomes a
 * blank resolved setup so JSON/YAML autosave can own the concrete values.
 */
export function buildBuilderConfigBlueprint(
  blueprint: ProjectBlueprint | null,
  draft: GenerationDraft | undefined,
): ProjectBlueprint | null {
  if (!blueprint) return null
  if (!draft || draft.mode !== 'template' || !draft.template) return blueprint

  const runtime = draft.runtime ? { runtime: draft.runtime } : {}
  if (draft.template.kind === 'agent' && draft.agent) {
    return {
      ...blueprint,
      items: [
        {
          kind: 'agent',
          source: 'blank',
          name: draft.starterName ?? draft.template.name,
          spec: draft.agent,
          ...runtime,
        },
      ],
    }
  }

  if (draft.template.kind === 'team' && draft.team) {
    return {
      ...blueprint,
      items: [
        {
          kind: 'team',
          source: 'blank',
          name: draft.starterName ?? draft.template.name,
          spec: draft.team,
          ...runtime,
        },
      ],
    }
  }

  return blueprint
}
