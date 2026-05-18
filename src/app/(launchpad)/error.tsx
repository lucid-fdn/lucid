'use client'

import Link from 'next/link'

export default function LaunchpadError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
        <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-white">Something went wrong</h2>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/30 hover:brightness-110"
        >
          Try Again
        </button>
        <Link
          href="/discover"
          className="rounded-lg border border-white/10 bg-white/[0.05] px-5 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
        >
          Go to Discover
        </Link>
      </div>
    </div>
  )
}
