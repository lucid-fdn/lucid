'use client'

export default function RetailError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center p-8 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-4 text-muted-foreground">Please try again.</p>
      <button
        onClick={reset}
        className="mt-6 rounded-md border border-border px-4 py-2 hover:bg-muted"
      >
        Retry
      </button>
    </main>
  )
}
