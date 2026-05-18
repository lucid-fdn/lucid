import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'

import { FEATURES } from '@/lib/features'

export const metadata = {
  title: 'Lucid — Build your AI agent',
  description: 'Create and manage AI agents in minutes.',
}

export default function RetailLayout({ children }: { children: ReactNode }) {
  if (!FEATURES.retailFunnel) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  )
}
