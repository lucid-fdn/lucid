import { createHash } from 'node:crypto'

import type { ToolDef } from './types.js'

export const TOOL_MANIFEST_VERSION = '2026-04-20.1'
export const TOOL_MANIFEST_COMPATIBILITY = 'openai-functions-v1'

export interface ToolManifestIssue {
  code:
    | 'tool_name_invalid'
    | 'tool_description_missing'
    | 'tool_parameters_invalid'
    | 'tool_parameters_not_object'
    | 'tool_parameters_defaulted_object'
    | 'schema_array_missing_items'
    | 'schema_properties_invalid'
    | 'schema_union_invalid'
  severity: 'warning' | 'error'
  toolName: string
  path: string
  message: string
}

export interface PreparedToolManifest {
  tools: ToolDef[]
  issues: ToolManifestIssue[]
  metadata: {
    manifestVersion: string
    compatibility: string
    manifestHash: string
    generatedAt: string
    toolCount: number
    validToolCount: number
    invalidToolCount: number
    hasErrors: boolean
  }
}

export interface PrepareToolManifestOptions {
  dropInvalidTools?: boolean
  generatedAt?: string
}

function pushIssue(
  issues: ToolManifestIssue[],
  issue: ToolManifestIssue,
): void {
  issues.push(issue)
}

export function normalizeJsonSchema(
  node: unknown,
  issues: ToolManifestIssue[] = [],
  toolName = 'unknown_tool',
  path = '$',
): unknown {
  if (!node || typeof node !== 'object') return node

  if (Array.isArray(node)) {
    return node.map((item, index) => normalizeJsonSchema(item, issues, toolName, `${path}[${index}]`))
  }

  const schema = { ...(node as Record<string, unknown>) }

  if (schema.type === 'array' && !('items' in schema)) {
    schema.items = {}
    pushIssue(issues, {
      code: 'schema_array_missing_items',
      severity: 'warning',
      toolName,
      path,
      message: 'Array schema was missing `items`; defaulted to an open schema.',
    })
  }

  if ('items' in schema) {
    schema.items = normalizeJsonSchema(schema.items, issues, toolName, `${path}.items`)
  }

  if ('properties' in schema) {
    if (schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)) {
      const normalizedProperties: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
        normalizedProperties[key] = normalizeJsonSchema(value, issues, toolName, `${path}.properties.${key}`)
      }
      schema.properties = normalizedProperties
    } else if (schema.properties != null) {
      schema.properties = {}
      pushIssue(issues, {
        code: 'schema_properties_invalid',
        severity: 'warning',
        toolName,
        path: `${path}.properties`,
        message: 'Schema properties were invalid; defaulted to an empty object.',
      })
    }
  }

  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    if (key in schema) {
      if (Array.isArray(schema[key])) {
        schema[key] = schema[key].map((entry, index) => normalizeJsonSchema(entry, issues, toolName, `${path}.${key}[${index}]`))
      } else if (schema[key] != null) {
        delete schema[key]
        pushIssue(issues, {
          code: 'schema_union_invalid',
          severity: 'warning',
          toolName,
          path: `${path}.${key}`,
          message: `${key} must be an array; removed invalid value.`,
        })
      }
    }
  }

  return schema
}

function normalizeTool(
  rawTool: ToolDef,
  index: number,
  issues: ToolManifestIssue[],
): { tool: ToolDef; valid: boolean } {
  const rawName = typeof rawTool?.name === 'string' ? rawTool.name.trim() : ''
  const toolName = rawName || `invalid_tool_${index + 1}`
  let valid = true

  if (!rawName) {
    valid = false
    pushIssue(issues, {
      code: 'tool_name_invalid',
      severity: 'error',
      toolName,
      path: '$.name',
      message: 'Tool name must be a non-empty string.',
    })
  }

  const description = typeof rawTool?.description === 'string' && rawTool.description.trim().length > 0
    ? rawTool.description
    : `Execute ${toolName}`

  if (description === `Execute ${toolName}` && rawTool?.description !== description) {
    pushIssue(issues, {
      code: 'tool_description_missing',
      severity: 'warning',
      toolName,
      path: '$.description',
      message: 'Tool description was missing; defaulted from tool name.',
    })
  }

  let parameters: Record<string, unknown> = { type: 'object', properties: {}, additionalProperties: false }
  if (rawTool?.parameters && typeof rawTool.parameters === 'object' && !Array.isArray(rawTool.parameters)) {
    parameters = normalizeJsonSchema(rawTool.parameters, issues, toolName, '$.parameters') as Record<string, unknown>
  } else {
    valid = false
    pushIssue(issues, {
      code: 'tool_parameters_invalid',
      severity: 'error',
      toolName,
      path: '$.parameters',
      message: 'Tool parameters must be an object schema.',
    })
  }

  if (!('type' in parameters)) {
    parameters = {
      ...parameters,
      type: 'object',
    }
    pushIssue(issues, {
      code: 'tool_parameters_defaulted_object',
      severity: 'warning',
      toolName,
      path: '$.parameters.type',
      message: 'Top-level tool parameters omitted `type`; defaulted to an object schema.',
    })
  }

  if (parameters.type !== 'object') {
    valid = false
    parameters = {
      type: 'object',
      properties: {},
      additionalProperties: false,
    }
    pushIssue(issues, {
      code: 'tool_parameters_not_object',
      severity: 'error',
      toolName,
      path: '$.parameters.type',
      message: 'Top-level tool parameters must be an object schema.',
    })
  }

  return {
    tool: {
      name: toolName,
      description,
      parameters,
    },
    valid,
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`
  }

  if (!value || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
  return `{${entries.join(',')}}`
}

export function buildToolManifestHash(tools: ToolDef[]): string {
  return createHash('sha256').update(stableSerialize(tools)).digest('hex')
}

export function prepareToolManifest(
  tools: ToolDef[],
  options: PrepareToolManifestOptions = {},
): PreparedToolManifest {
  const issues: ToolManifestIssue[] = []
  const normalizedTools: ToolDef[] = []
  let invalidToolCount = 0

  for (const [index, rawTool] of tools.entries()) {
    const { tool, valid } = normalizeTool(rawTool, index, issues)
    if (!valid) invalidToolCount += 1
    if (valid || !options.dropInvalidTools) {
      normalizedTools.push(tool)
    }
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString()
  return {
    tools: normalizedTools,
    issues,
    metadata: {
      manifestVersion: TOOL_MANIFEST_VERSION,
      compatibility: TOOL_MANIFEST_COMPATIBILITY,
      manifestHash: buildToolManifestHash(normalizedTools),
      generatedAt,
      toolCount: tools.length,
      validToolCount: tools.length - invalidToolCount,
      invalidToolCount,
      hasErrors: issues.some((issue) => issue.severity === 'error'),
    },
  }
}
