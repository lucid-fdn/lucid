import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FEATURES } from '@/lib/features'
import { LaunchpadClientLayout } from './launchpad-client-layout'

export const metadata: Metadata = {
  title: 'Lucid Launch — AI Agent Launchpad',
  description: 'Discover, invest in, and use tokenized AI agents',
}

export default function LaunchpadLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!FEATURES.launchpad) {
    redirect('/')
  }

  return (
    <LaunchpadClientLayout>
      {children}
    </LaunchpadClientLayout>
  )
}
