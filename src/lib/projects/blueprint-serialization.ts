import { ProjectBlueprintSchema, type ProjectBlueprint } from '@contracts/project-blueprint'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'

export type BlueprintConfigFormat = 'json' | 'yaml'

function getLineColumnFromPosition(input: string, position: number): { line: number; column: number } {
  const before = input.slice(0, Math.max(0, position))
  const lines = before.split(/\r\n|\r|\n/)
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  }
}

function normalizeBlueprintParseError(error: unknown, input: string, format: BlueprintConfigFormat): Error {
  if (format === 'json' && error instanceof SyntaxError) {
    const match = error.message.match(/position\s+(\d+)/i)
    if (match?.[1]) {
      const location = getLineColumnFromPosition(input, Number(match[1]))
      return new Error(`Invalid JSON at line ${location.line}, column ${location.column}: ${error.message}`)
    }
  }

  if (format === 'yaml' && error && typeof error === 'object') {
    const yamlError = error as { message?: string; linePos?: Array<{ line: number; col: number }> }
    const firstPosition = yamlError.linePos?.[0]
    if (firstPosition) {
      return new Error(`Invalid YAML at line ${firstPosition.line}, column ${firstPosition.col}: ${yamlError.message ?? 'Parse error'}`)
    }
  }

  if (error instanceof z.ZodError) {
    const firstIssue = error.issues[0]
    if (firstIssue) {
      const path = firstIssue.path.length > 0 ? firstIssue.path.join('.') : 'root'
      return new Error(`Invalid blueprint at ${path}: ${firstIssue.message}`)
    }
  }

  if (error instanceof Error) {
    return error
  }

  return new Error('Invalid blueprint config')
}

export function serializeProjectBlueprint(
  blueprint: ProjectBlueprint,
  format: BlueprintConfigFormat,
): string {
  if (format === 'yaml') {
    return stringifyYaml(blueprint, {
      indent: 2,
      lineWidth: 0,
      minContentWidth: 0,
    })
  }

  return JSON.stringify(blueprint, null, 2)
}

export function parseProjectBlueprint(
  input: string,
  format: BlueprintConfigFormat,
): ProjectBlueprint {
  try {
    const parsed = format === 'yaml'
      ? parseYaml(input)
      : JSON.parse(input)

    return ProjectBlueprintSchema.parse(parsed)
  } catch (error) {
    throw normalizeBlueprintParseError(error, input, format)
  }
}
