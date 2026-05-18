import { ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Phase 7 — private runtime upsell banner.
 *
 * Non-blocking card shown on the retail fleet page once the user's
 * oldest agent has crossed the stickiness threshold (see
 * `shouldShowPrivateRuntimeUpsell` in `src/lib/retail/upsell.ts`).
 *
 * Deliberately a server component with zero JS — we never want to ship
 * dismissible local state for an upsell banner from the retail funnel.
 * If the banner becomes annoying we'll extend the upsell logic to fade
 * it out rather than add a client-side dismiss mechanism here.
 *
 * The CTA is a `mailto:` today because there is no self-serve retail
 * runtime provisioning flow yet. When the dedicated-runtime one-click
 * launch ships for retail, swap the href for the real route.
 */
export function PrivateRuntimeUpsell() {
  return (
    <aside
      role="complementary"
      aria-labelledby="private-runtime-upsell-heading"
      className="mb-8 rounded-lg border bg-muted/30 p-5 sm:flex sm:items-center sm:justify-between sm:gap-6"
    >
      <div className="space-y-1">
        <p
          id="private-runtime-upsell-heading"
          className="text-sm font-semibold text-foreground"
        >
          Ready for your own dedicated infrastructure?
        </p>
        <p className="text-sm text-muted-foreground">
          You&apos;ve been running successfully on shared compute. A dedicated
          runtime gives you stronger continuity, better isolation, and more
          headroom as your agent workload grows.
        </p>
      </div>
      <div className="mt-4 sm:mt-0">
        <Button asChild size="sm" variant="outline" className="gap-2">
          <a href="mailto:hello@lucid.foundation?subject=Private%20runtime">
            Learn more
            <ArrowRight className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </aside>
  )
}
