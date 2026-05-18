import { Card, CardContent } from '@/components/ui/card'

/**
 * Phase 7 — retail cost framing strip.
 *
 * Server component (zero JS). Mounted on the retail landing below the
 * template gallery. The goal is to answer the single question every
 * consumer asks before signing up: "what does this cost me?"
 *
 * Three-card layout keeps each claim scannable:
 *   1. Free tier entry point
 *   2. Metered pricing (usage-based, no surprise bills)
 *   3. Upgrade path (private runtime) for power users
 *
 * Intentionally NOT linked to a pricing page — retail v1 has no
 * dedicated pricing route, and pointing at the pro /pricing page would
 * expose enterprise framing that confuses consumer visitors. When
 * retail gets its own pricing page, wire the CTAs here.
 */
export function RetailPricingStrip() {
  return (
    <section
      id="pricing"
      className="mx-auto max-w-5xl px-6 py-16 sm:py-20"
      aria-labelledby="retail-pricing-heading"
    >
      <div className="mb-10 text-center">
        <h2
          id="retail-pricing-heading"
          className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
        >
          $0 to start. Pay only when your agent gets busy.
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          No credit card to try it. No subscription you forget to cancel.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-2 p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Free
            </p>
            <p className="text-2xl font-semibold text-foreground">$0</p>
            <p className="text-sm text-muted-foreground">
              Build your first agent, connect a channel, and send real
              messages. No card required.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Pay as you go
            </p>
            <p className="text-2xl font-semibold text-foreground">
              ~$1<span className="text-sm font-normal text-muted-foreground"> / 1,000 messages</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Only when your agent gets used. Top up what you need,
              nothing more.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-6">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Private runtime
            </p>
            <p className="text-2xl font-semibold text-foreground">
              From $19<span className="text-sm font-normal text-muted-foreground"> / month</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Your own dedicated infrastructure when your agent starts
              handling serious volume.
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Fair-use limits apply on the free tier. You&apos;ll see a clear
        notice before any charge.
      </p>
    </section>
  )
}
