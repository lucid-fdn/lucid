import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCachedSession } from '@/lib/auth/cache'
import { acceptInvite } from '@/lib/invites'

export default async function JoinPage({
  params
}: {
  params: Promise<{ token: string }>
}) {
  const session = await getCachedSession()
  
  // Require authentication
  if (!session?.user?.id) {
    redirect(`/login?returnTo=/join/${(await params).token}`)
  }
  
  // Accept the invite
  const result = await acceptInvite((await params).token, session.user.id)
  
  if (!result.success || !result.organization) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-6 text-center">
          <div className="mb-4">
            <svg
              className="mx-auto h-12 w-12 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Invalid Invite Link</h1>
          <p className="text-muted-foreground mb-6">
            {result.error || 'This invite link is no longer valid.'}
          </p>
          <Link
            href="/dashboard"
            className="inline-block bg-primary text-white px-6 py-2 rounded-md hover:bg-primary/90 transition-colors duration-120"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }
  
  // Success - redirect to workspace
  redirect(`/${result.organization.slug}/dashboard`)
}
