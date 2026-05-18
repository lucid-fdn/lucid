import type { ToolDefinition } from './types.js'

/**
 * Type-enforcement helper for tool definitions.
 * Returns the input unchanged — the value is compile-time type checking.
 *
 * @example
 * const myTool = defineTool({
 *   name: 'get_price',
 *   description: 'Get current USD price',
 *   category: 'read',
 *   parameters: { type: 'object', properties: { chain: { type: 'string' } } },
 *   when_to_use: ['user asks about token price'],
 * })
 */
export function defineTool<T = unknown>(def: ToolDefinition<T>): ToolDefinition<T> {
  return def
}
