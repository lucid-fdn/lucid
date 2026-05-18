import React from 'react'
import { notFound, redirect } from 'next/navigation'

import { getUserId } from '@/lib/auth/server-utils'
import { getTemplateBySlug } from '@/lib/retail'

import { StartWizard } from '@/components/retail/wizard/start-wizard'

interface StartPageProps {
  params: Promise<{ slug: string }>
}

export default async function RetailStartPage({ params }: StartPageProps) {
  const { slug } = await params
  const template = getTemplateBySlug(slug)
  if (!template) {
    notFound()
  }

  const userId = await getUserId()
  if (!userId) {
    // Bounce through /login. Phase 4 will add a redirect param to /login
    // so we land back here after auth — for now we just send them to /login.
    redirect('/login')
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <StartWizard template={template} />
    </main>
  )
}
