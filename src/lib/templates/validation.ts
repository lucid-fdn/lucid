import { z } from 'zod'

import {
  TemplateParamSchema,
  TemplateSpecSchema,
  type TemplateParam,
} from '@contracts/template'
import { AGENT_OPS_WORKFLOW_IDS } from '@/lib/agent-ops/workflow-types'

const PLACEHOLDER_RE = /\{\{([A-Z0-9_]+)\}\}/g

export const templateParamInputSchema = TemplateParamSchema.extend({
  description: z.string().max(300).optional(),
})
  .transform(({ description, hint, ...param }): TemplateParam => ({
    ...param,
    ...(hint ? { hint } : {}),
    ...(!hint && description ? { hint: description } : {}),
  }))
  .pipe(TemplateParamSchema)

const baseTemplateMetadataSchema = z.object({
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/i).optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.string().trim().min(1).max(50).regex(/^[a-z0-9-]+$/i),
  tags: z.array(z.string().trim().min(1).max(50).regex(/^[a-z0-9-]+$/i)).max(20),
  params: z.array(templateParamInputSchema).max(25),
  preview_prompt: z.string().max(2000).optional(),
  version: z.string().max(50).optional(),
  kind: z.enum(['agent', 'team']).optional(),
})

function validateTemplateParamsAgainstSpec(
  value: { params?: TemplateParam[]; spec?: unknown },
  ctx: z.RefinementCtx,
) {
  const params = value.params ?? []
  const spec = value.spec
  if (!spec) return

  const paramKeys = new Set<string>()
  for (const [index, param] of params.entries()) {
    if (paramKeys.has(param.key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate template param key: ${param.key}`,
        path: ['params', index, 'key'],
      })
    }
    paramKeys.add(param.key)

    if (param.type === 'select' && (!param.options || param.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select params must include at least one option',
        path: ['params', index, 'options'],
      })
    }
  }

  const placeholderKeys = new Set(
    Array.from(JSON.stringify(spec).matchAll(PLACEHOLDER_RE), (match) => match[1]),
  )

  for (const key of placeholderKeys) {
    if (!paramKeys.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Missing param definition for placeholder ${key}`,
        path: ['params'],
      })
    }
  }
}

function validateSpecOperationalLimits(spec: z.infer<typeof TemplateSpecSchema>, ctx: z.RefinementCtx) {
  if ((spec.ops_workflows?.length ?? 0) > 20) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Templates may include at most 20 Agent Ops workflow bindings',
      path: ['spec', 'ops_workflows'],
    })
  }

  if (spec.kind === 'team') {
    if (spec.members.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Team templates must include at least one member',
        path: ['spec', 'members'],
      })
    }
    if (spec.members.length > 20) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Team templates may include at most 20 members',
        path: ['spec', 'members'],
      })
    }
    if (spec.edges.length > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Team templates may include at most 100 edges',
        path: ['spec', 'edges'],
      })
    }
  }
}

function validateAgentOpsWorkflowBindings(
  spec: z.infer<typeof TemplateSpecSchema>,
  ctx: z.RefinementCtx,
) {
  const bindings = spec.ops_workflows ?? []
  const validWorkflowIds = new Set<string>(AGENT_OPS_WORKFLOW_IDS)
  const seen = new Set<string>()

  bindings.forEach((binding, index) => {
    if (!validWorkflowIds.has(binding.workflow_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown Agent Ops workflow id: ${binding.workflow_id}`,
        path: ['spec', 'ops_workflows', index, 'workflow_id'],
      })
    }

    if (seen.has(binding.workflow_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate Agent Ops workflow binding: ${binding.workflow_id}`,
        path: ['spec', 'ops_workflows', index, 'workflow_id'],
      })
    }
    seen.add(binding.workflow_id)
  })
}

function validateDeclaredKindMatchesSpec(
  value: { kind?: 'agent' | 'team'; spec?: z.infer<typeof TemplateSpecSchema> },
  ctx: z.RefinementCtx,
) {
  if (!value.kind || !value.spec) return

  if (value.kind !== value.spec.kind) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Template kind "${value.kind}" must match spec kind "${value.spec.kind}"`,
      path: ['kind'],
    })
  }
}

export const templateRegistrySeedSchema = baseTemplateMetadataSchema.extend({
  slug: baseTemplateMetadataSchema.shape.slug.unwrap(),
  tags: baseTemplateMetadataSchema.shape.tags.optional().default([]),
  params: baseTemplateMetadataSchema.shape.params.optional().default([]),
  kind: baseTemplateMetadataSchema.shape.kind.unwrap(),
  spec: TemplateSpecSchema,
}).superRefine((value, ctx) => {
  validateDeclaredKindMatchesSpec(value, ctx)
  validateSpecOperationalLimits(value.spec, ctx)
  validateAgentOpsWorkflowBindings(value.spec, ctx)
  validateTemplateParamsAgainstSpec(value, ctx)
})

export type TemplateRegistrySeedInput = z.infer<typeof templateRegistrySeedSchema>
