/**
 * Template rendering — substitutes {{KEY}} placeholders in spec string values.
 *
 * Pure functions — no I/O, no side-effects. Safe to call in any context.
 * Missing params leave the placeholder unchanged ({{KEY}} remains).
 */

import type { TemplateSpec } from '@contracts/template'

type TemplateRenderParams = Record<string, string | undefined> | null | undefined

function normalizeParams(params: TemplateRenderParams): Record<string, string | undefined> {
  return params ?? (Object.create(null) as Record<string, string | undefined>)
}

/**
 * Substitute all `{{KEY}}` occurrences in a string.
 * Unknown keys are left as-is so that partial param sets
 * produce predictable output (the placeholder remains visible).
 */
export function substituteString(s: string, params?: TemplateRenderParams): string {
  const normalizedParams = normalizeParams(params)

  return s.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_match, key: string) => {
    return Object.prototype.hasOwnProperty.call(normalizedParams, key)
      ? (normalizedParams[key] ?? _match)
      : _match
  })
}

/**
 * Recursively walk any JSON-serialisable value and substitute
 * `{{KEY}}` placeholders in every string it encounters.
 * Arrays, objects, and nested structures are all handled.
 * Non-string primitives (numbers, booleans, null) are returned unchanged.
 */
function substituteValue<T>(value: T, params?: TemplateRenderParams): T {
  if (typeof value === 'string') {
    return substituteString(value, params) as unknown as T
  }

  if (Array.isArray(value)) {
    return value.map((item) => substituteValue(item, params)) as unknown as T
  }

  if (value !== null && typeof value === 'object') {
    const result = Object.create(null) as Record<string, unknown>
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = substituteValue(v, params)
    }
    return result as T
  }

  return value
}

/**
 * Render a template spec by substituting all `{{KEY}}` placeholders
 * with the supplied params. Returns a new spec object; the original
 * is never mutated.
 */
export function renderTemplate(spec: TemplateSpec, params?: TemplateRenderParams): TemplateSpec {
  return substituteValue(spec, params)
}
