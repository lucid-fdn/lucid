import Link from 'next/link'

import { Button } from '@/components/ui/button'

/**
 * Retail landing hero. Server component, no client JS.
 *
 * The CTA points at `/login`. Phase 3 will wire post-login routing
 * back into the retail wizard via `?redirect=...` (the existing /login
 * page does not yet support a redirect param — adding that is Phase 3 work).
 */
export function RetailHero() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center px-6 py-20 text-center sm:py-28">
      <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
        Lucid agents
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        Build an AI agent in three minutes.
      </h1>
      <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
        Pick a template, give it a name, and connect Telegram. Your agent
        replies to real messages within minutes — no code, no setup.
      </p>
      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/login">Get started — free</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="#templates">Browse templates</Link>
        </Button>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        $0 to start — then roughly $1 per 1,000 messages as it grows.
      </p>
      <p className="mt-4 text-xs text-muted-foreground">
        Already have an agent?{' '}
        <Link
          href="/agents-preview/mine"
          className="font-medium text-foreground underline underline-offset-4"
        >
          View your agents
        </Link>
      </p>
    </section>
  )
}
