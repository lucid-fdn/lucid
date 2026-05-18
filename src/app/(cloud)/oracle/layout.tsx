import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FEATURES } from '@/lib/features'
import { OracleNav } from '@/components/oracle/oracle-nav'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Lucid Oracle — Agent Economy Intelligence',
  description: 'Real-time economic feeds, agent identity, and protocol analytics for the agent economy.',
}

export default function OracleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!FEATURES.oracleDashboard) {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 overflow-hidden">
      <OracleNav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        {children}
      </main>
    </div>
  )
}
