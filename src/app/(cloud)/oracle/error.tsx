'use client'

export default function OracleError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <h2 className="text-xl font-bold text-zinc-100 mb-2">Something went wrong</h2>
      <p className="text-sm text-zinc-500 mb-6 max-w-md text-center">
        {error.message.includes('Oracle API')
          ? 'Unable to reach the Oracle API. The service may be restarting.'
          : 'An unexpected error occurred.'}
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
      >
        Try again
      </button>
    </div>
  )
}
