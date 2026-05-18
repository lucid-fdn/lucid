import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/session'
import { LaunchWizardClient } from './launch-wizard-client'

export default async function LaunchWizardPage() {
  const session = await getServerSession()
  if (!session?.userId) redirect('/login?next=/launch')

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold">Launch an Agent</h1>
      <p className="mb-8 text-muted-foreground">
        Create and tokenize your AI agent. Let investors earn revenue share from usage.
      </p>
      <LaunchWizardClient userId={session.userId} />
    </div>
  )
}
