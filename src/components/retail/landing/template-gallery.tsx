import { RETAIL_TEMPLATES } from '@/lib/retail'

import { RetailTemplateCard } from './template-card'

/**
 * Static gallery of all retail templates. Server component.
 * Anchored at `#templates` so the hero CTA can scroll to it.
 */
export function RetailTemplateGallery() {
  return (
    <section id="templates" className="mx-auto max-w-6xl px-6 pb-24">
      <div className="mb-10 text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Start from a template
        </h2>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Each template is a working agent with sensible defaults. Pick one,
          rename it, and connect a channel.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RETAIL_TEMPLATES.map((template) => (
          <RetailTemplateCard key={template.slug} template={template} />
        ))}
      </div>
    </section>
  )
}
