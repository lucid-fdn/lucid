import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Lucid Styleguide',
  description: 'Internal design system reference — tokens, primitives, motion, states.',
  robots: { index: false, follow: false },
}

export default function StyleguideLayout({ children }: { children: React.ReactNode }) {
  // Prod gate: styleguide is a dev-only reference surface.
  // Enable explicitly in prod with NEXT_PUBLIC_ENABLE_STYLEGUIDE=1 if needed.
  const enabled =
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_ENABLE_STYLEGUIDE === '1'

  if (!enabled) notFound()

  return <div className="min-h-screen bg-background text-foreground">{children}</div>
}
