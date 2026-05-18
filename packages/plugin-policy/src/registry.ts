/**
 * Capability Core — Registry
 *
 * In-memory registry of activated plugins for a given context (e.g., assistant run).
 * Provides lookup by slug and wire tool name parsing.
 *
 * Not a singleton — each agent run creates its own registry from the DB result.
 */

import type { ActivatedPlugin, ToolDef } from './types.js'

/** Wire tool name format: {pluginSlug}__{toolName} (double underscore separator). */
const WIRE_SEPARATOR = '__'

export class PluginRegistry {
  private readonly plugins = new Map<string, ActivatedPlugin>()

  constructor(plugins?: ActivatedPlugin[]) {
    if (plugins) {
      for (const p of plugins) {
        this.register(p)
      }
    }
  }

  register(plugin: ActivatedPlugin): void {
    this.plugins.set(plugin.slug, plugin)
  }

  get(slug: string): ActivatedPlugin | undefined {
    return this.plugins.get(slug)
  }

  has(slug: string): boolean {
    return this.plugins.has(slug)
  }

  getAll(): ActivatedPlugin[] {
    return Array.from(this.plugins.values())
  }

  /** Resolve a wire tool name (e.g., 'lucid_seo__research_keywords') to plugin + tool. */
  resolveWireToolName(wireName: string): { plugin: ActivatedPlugin; tool: ToolDef } | null {
    const idx = wireName.indexOf(WIRE_SEPARATOR)
    if (idx === -1) return null

    const slugPart = wireName.slice(0, idx)
    const toolName = wireName.slice(idx + WIRE_SEPARATOR.length)

    // Wire names sanitize hyphens to underscores, so try both
    const plugin = this.plugins.get(slugPart) ?? this.plugins.get(slugPart.replace(/_/g, '-'))
    if (!plugin) return null

    const tool = plugin.tools.find((t) => t.name === toolName)
    if (!tool) return null

    return { plugin, tool }
  }

  get size(): number {
    return this.plugins.size
  }
}
